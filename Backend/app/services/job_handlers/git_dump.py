import asyncio
import json
import os

import httpx
from sqlmodel import select

from app.db import DATA_DIR, get_session
from app.models.assets import Asset
from app.models.git_dump import GitDumpResult
from app.models.jobs import Job
from app.services.job_engine import JobContext
from app.services.job_handlers import register_job_handler
from app.services.subprocess_job import run_per_target, run_subprocess


def _load_assets(asset_ids: list[int]) -> list[Asset]:
    with get_session() as session:
        assets = session.exec(select(Asset).where(Asset.id.in_(asset_ids))).all()
        session.expunge_all()
        return assets


async def _is_git_exposed(client: httpx.AsyncClient, url: str) -> bool:
    head_url = url.rstrip("/") + "/.git/HEAD"
    try:
        resp = await client.get(head_url, timeout=10)
    except httpx.RequestError:
        return False
    return resp.status_code == 200 and resp.text.strip().startswith("ref:")


def _dir_stats(path: str) -> tuple[int, int]:
    file_count = 0
    total_size = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            file_count += 1
            try:
                total_size += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return file_count, total_size


def _persist_result(result: GitDumpResult) -> None:
    with get_session() as session:
        session.add(result)
        session.commit()


@register_job_handler("git-dump")
async def run_git_dump_job(job: Job, ctx: JobContext) -> None:
    params = json.loads(job.params_json)
    target_concurrency = max(1, int(params.get("target_concurrency", 2)))

    asset_ids = json.loads(job.target_asset_ids_json or "[]")
    assets = await asyncio.to_thread(_load_assets, asset_ids)

    await ctx.log(
        f"Checking {len(assets)} target(s) for exposed .git directories, {target_concurrency} at a time"
    )

    async def _handle(asset: Asset) -> bool:
        async with httpx.AsyncClient() as client:
            exposed = await _is_git_exposed(client, asset.normalized_url)

        if not exposed:
            await ctx.log(f"{asset.normalized_url}: no exposed .git directory")
            await asyncio.to_thread(
                _persist_result, GitDumpResult(job_id=job.id, asset_id=asset.id, exposed=False)
            )
            return True

        await ctx.log(f"{asset.normalized_url}: exposed .git found, dumping", level="warn")
        dump_path = os.path.join(DATA_DIR, "git_dumps", str(job.id), str(asset.id))
        os.makedirs(os.path.dirname(dump_path), exist_ok=True)

        git_url = asset.normalized_url.rstrip("/") + "/.git/"
        cmd = ["git-dumper", git_url, dump_path]
        returncode = await run_subprocess(cmd, ctx, asset.normalized_url)

        if returncode != 0:
            await ctx.log(
                f"{asset.normalized_url}: git-dumper exited with code {returncode}", level="error"
            )
            await asyncio.to_thread(
                _persist_result,
                GitDumpResult(
                    job_id=job.id,
                    asset_id=asset.id,
                    exposed=True,
                    error_message=f"git-dumper exited with code {returncode}",
                ),
            )
            return False

        file_count, dump_size = await asyncio.to_thread(_dir_stats, dump_path)
        await ctx.log(
            f"{asset.normalized_url}: dumped {file_count} file(s), {dump_size} bytes to {dump_path}"
        )
        await asyncio.to_thread(
            _persist_result,
            GitDumpResult(
                job_id=job.id,
                asset_id=asset.id,
                exposed=True,
                dump_path=dump_path,
                file_count=file_count,
                dump_size_bytes=dump_size,
            ),
        )
        return True

    await run_per_target(ctx, assets, target_concurrency, _handle)
