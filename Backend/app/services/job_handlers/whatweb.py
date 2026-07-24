import asyncio
import json
import os
import tempfile
from typing import Optional

from sqlmodel import select

from app.db import get_session
from app.models.assets import Asset
from app.models.jobs import Job
from app.models.whatweb import WhatwebResult
from app.services.job_engine import JobContext
from app.services.job_handlers import register_job_handler
from app.services.subprocess_job import run_per_target, run_subprocess


def _load_assets(asset_ids: list[int]) -> list[Asset]:
    with get_session() as session:
        assets = session.exec(select(Asset).where(Asset.id.in_(asset_ids))).all()
        session.expunge_all()
        return assets


def _parse_report(path: str) -> tuple[Optional[int], dict]:
    if not os.path.exists(path):
        return None, {}
    with open(path) as f:
        data = json.load(f)
    if not data:
        return None, {}
    entry = data[0]
    return entry.get("http_status"), entry.get("plugins", {})


def _persist_result(result: WhatwebResult) -> None:
    with get_session() as session:
        session.add(result)
        session.commit()


@register_job_handler("whatweb")
async def run_whatweb_job(job: Job, ctx: JobContext) -> None:
    params = json.loads(job.params_json)
    target_concurrency = max(1, int(params.get("target_concurrency", 5)))
    aggression = max(1, int(params.get("aggression", 1)))

    asset_ids = json.loads(job.target_asset_ids_json or "[]")
    assets = await asyncio.to_thread(_load_assets, asset_ids)

    await ctx.log(f"WhatWeb fingerprinting {len(assets)} target(s), {target_concurrency} at a time")

    async def _handle(asset: Asset) -> bool:
        fd, output_path = tempfile.mkstemp(suffix=".json", prefix=f"whatweb_{job.id}_{asset.id}_")
        os.close(fd)
        os.remove(output_path)  # whatweb must create this file fresh itself

        cmd = [
            "whatweb",
            "--color=never",
            "--aggression", str(aggression),
            f"--log-json={output_path}",
            asset.normalized_url,
        ]
        returncode = await run_subprocess(cmd, ctx, asset.normalized_url)

        http_status, plugins = await asyncio.to_thread(_parse_report, output_path)
        try:
            os.remove(output_path)
        except OSError:
            pass

        error_message = None if returncode == 0 else f"whatweb exited with code {returncode}"
        status_note = f" (status {http_status})" if http_status else ""
        await ctx.log(f"{asset.normalized_url}: {len(plugins)} plugin(s) detected{status_note}")
        await asyncio.to_thread(
            _persist_result,
            WhatwebResult(
                job_id=job.id,
                asset_id=asset.id,
                http_status=http_status,
                plugins_json=json.dumps(plugins),
                error_message=error_message,
            ),
        )
        return returncode == 0

    await run_per_target(ctx, assets, target_concurrency, _handle)
