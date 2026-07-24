import asyncio
import json
import os
import tempfile
from urllib.parse import urlsplit

from sqlmodel import select

from app.db import get_session
from app.models.assets import Asset
from app.models.dirsearch import DirsearchResult
from app.models.jobs import Job
from app.services.job_engine import JobContext
from app.services.job_handlers import register_job_handler
from app.services.subprocess_job import run_per_target, run_subprocess


def _load_assets(asset_ids: list[int]) -> list[Asset]:
    with get_session() as session:
        assets = session.exec(select(Asset).where(Asset.id.in_(asset_ids))).all()
        session.expunge_all()
        return assets


def _parse_report(path: str, job_id: int, asset_id: int) -> list[DirsearchResult]:
    if not os.path.exists(path):
        # dirsearch only writes the report file if at least one path survived
        # its own false-positive calibration - "no file" means "nothing found",
        # not an error.
        return []
    with open(path) as f:
        data = json.load(f)
    results = []
    for entry in data.get("results", []):
        url = entry.get("url", "")
        results.append(
            DirsearchResult(
                job_id=job_id,
                asset_id=asset_id,
                url=url,
                path=urlsplit(url).path or "/",
                status_code=entry.get("status", 0),
                content_length=entry.get("content-length"),
                content_type=entry.get("content-type"),
                redirect=entry.get("redirect") or None,
            )
        )
    return results


def _persist_results(results: list[DirsearchResult]) -> None:
    if not results:
        return
    with get_session() as session:
        for result in results:
            session.add(result)
        session.commit()


@register_job_handler("dirsearch")
async def run_dirsearch_job(job: Job, ctx: JobContext) -> None:
    params = json.loads(job.params_json)
    cfg = {
        "target_concurrency": max(1, int(params.get("target_concurrency", 2))),
        "threads": max(1, int(params.get("threads", 25))),
        "exclude_status": str(params.get("exclude_status", "403,500")),
    }
    asset_ids = json.loads(job.target_asset_ids_json or "[]")
    assets = await asyncio.to_thread(_load_assets, asset_ids)

    await ctx.log(
        f"Dirsearch scanning {len(assets)} target(s), {cfg['target_concurrency']} at a time, "
        f"{cfg['threads']} threads each, excluding status {cfg['exclude_status']}"
    )

    async def _handle(asset: Asset) -> bool:
        fd, output_path = tempfile.mkstemp(suffix=".json", prefix=f"dirsearch_{job.id}_{asset.id}_")
        os.close(fd)
        os.remove(output_path)  # dirsearch must create this file fresh itself

        cmd = [
            "dirsearch",
            "-u", asset.normalized_url,
            "--format", "json",
            "-o", output_path,
            "-x", cfg["exclude_status"],
            "-t", str(cfg["threads"]),
            "--no-color",
        ]
        returncode = await run_subprocess(cmd, ctx, asset.normalized_url)

        results = await asyncio.to_thread(_parse_report, output_path, job.id, asset.id)
        await asyncio.to_thread(_persist_results, results)
        try:
            os.remove(output_path)
        except OSError:
            pass

        await ctx.log(f"{asset.normalized_url}: {len(results)} path(s) found")
        return returncode == 0

    await run_per_target(ctx, assets, cfg["target_concurrency"], _handle)
