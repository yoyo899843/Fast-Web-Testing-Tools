import asyncio
import html
import json
import re
import ssl
from datetime import datetime
from typing import Optional

import httpx
from aiolimiter import AsyncLimiter
from sqlmodel import select

from app.db import get_session
from app.models.assets import Asset
from app.models.jobs import Job
from app.models.liveness import LivenessResult
from app.services.job_engine import JobContext
from app.services.job_handlers import register_job_handler

_TITLE_RE = re.compile(rb"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_TITLE_SCAN_BYTES = 65536


def _extract_title(content_type: str, body: bytes, encoding: Optional[str]) -> Optional[str]:
    if "html" not in (content_type or "").lower():
        return None
    match = _TITLE_RE.search(body[:_TITLE_SCAN_BYTES])
    if not match:
        return None
    text = match.group(1).decode(encoding or "utf-8", errors="replace")
    return html.unescape(text).strip() or None


def _classify_error(exc: Exception) -> tuple[Optional[str], Optional[str]]:
    """Return (tls_error, error_message) - at most one populated."""
    if isinstance(exc, (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout)):
        return None, "timeout"
    if isinstance(exc, httpx.ConnectError):
        cause = exc.__cause__ or exc.__context__
        if isinstance(cause, ssl.SSLError):
            return str(cause), None
        return None, str(exc)
    if isinstance(exc, httpx.RequestError):
        return None, str(exc)
    return None, str(exc)


async def _check_one(client: httpx.AsyncClient, asset: Asset, cfg: dict, ctx: JobContext) -> LivenessResult:
    retries = cfg["retries"]
    attempts = 0
    last_tls_error = None
    last_error_message = None

    for attempt in range(1, retries + 2):
        attempts = attempt
        try:
            resp = await client.get(asset.normalized_url, timeout=cfg["timeout"])
        except Exception as exc:  # noqa: BLE001 - classified below, never allowed to crash the worker
            tls_error, error_message = _classify_error(exc)
            last_tls_error, last_error_message = tls_error, error_message
            await ctx.log(
                f"[{attempt}/{retries + 1}] {asset.normalized_url} -> {tls_error or error_message}",
                level="warn",
            )
            continue

        title = _extract_title(resp.headers.get("content-type", ""), resp.content, resp.encoding)
        await ctx.log(f"{asset.normalized_url} -> {resp.status_code}")
        return LivenessResult(
            job_id=ctx.job_id,
            asset_id=asset.id,
            reachable=True,
            status_code=resp.status_code,
            page_title=title,
            checked_at=datetime.utcnow(),
            attempt_count=attempts,
        )

    await ctx.log(f"{asset.normalized_url} unreachable after {attempts} attempt(s)", level="error")
    return LivenessResult(
        job_id=ctx.job_id,
        asset_id=asset.id,
        reachable=False,
        tls_error=last_tls_error,
        error_message=last_error_message,
        checked_at=datetime.utcnow(),
        attempt_count=attempts,
    )


def _persist_result(result: LivenessResult) -> None:
    with get_session() as session:
        session.add(result)
        asset = session.get(Asset, result.asset_id)
        asset.last_alive = result.reachable
        asset.last_checked_at = result.checked_at
        asset.last_liveness_job_id = result.job_id
        session.add(asset)
        session.commit()


def _load_assets(asset_ids: list[int]) -> list[Asset]:
    with get_session() as session:
        assets = session.exec(select(Asset).where(Asset.id.in_(asset_ids))).all()
        session.expunge_all()
        return assets


@register_job_handler("liveness")
async def run_liveness_job(job: Job, ctx: JobContext) -> None:
    params = json.loads(job.params_json)
    cfg = {
        "concurrency": max(1, int(params.get("concurrency", 10))),
        "timeout": float(params.get("timeout", 10)),
        "retries": max(0, int(params.get("retries", 0))),
        "rps": max(0.1, float(params.get("rps", 5))),
    }
    asset_ids = json.loads(job.target_asset_ids_json or "[]")
    assets = await asyncio.to_thread(_load_assets, asset_ids)

    total = len(assets)
    await ctx.update_progress(done=0, total=total, success=0, fail=0)
    await ctx.log(f"Checking {total} target(s) with concurrency={cfg['concurrency']} rps={cfg['rps']}")

    semaphore = asyncio.Semaphore(cfg["concurrency"])
    limiter = AsyncLimiter(cfg["rps"], 1)
    counters = {"done": 0, "success": 0, "fail": 0}
    counters_lock = asyncio.Lock()

    async with httpx.AsyncClient(follow_redirects=True, verify=True) as client:

        async def _worker(asset: Asset) -> None:
            if ctx.cancel_event.is_set():
                return
            async with semaphore:
                if ctx.cancel_event.is_set():
                    return
                async with limiter:
                    result = await _check_one(client, asset, cfg, ctx)
            # Read before persisting: committing expires the instance's
            # attributes, and by the time we'd read them here the session
            # that could refresh them from the DB has already closed.
            reachable = result.reachable
            await asyncio.to_thread(_persist_result, result)
            async with counters_lock:
                counters["done"] += 1
                if reachable:
                    counters["success"] += 1
                else:
                    counters["fail"] += 1
                await ctx.update_progress(
                    done=counters["done"], success=counters["success"], fail=counters["fail"]
                )

        await asyncio.gather(*(_worker(asset) for asset in assets))

    if ctx.cancel_event.is_set():
        await ctx.log(f"Stopped early: {counters['done']}/{total} checked before cancellation")
    else:
        await ctx.log(f"Done: {counters['success']} alive, {counters['fail']} unreachable out of {total}")
