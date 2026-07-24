import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlmodel import select

from app.db import get_session
from app.models.assets import Asset
from app.models.jobs import Job, JobLog, JobStatus
from app.models.liveness import LivenessResult
from app.schemas.job_schemas import JobResponse, LivenessJobRequest, LivenessResultResponse
from app.services import job_engine
from app.services.workspace_utils import create_scoped_job
from app.ws import job_broadcast

router = APIRouter(tags=["jobs"])

_TERMINAL_STATUSES = {
    JobStatus.COMPLETED,
    JobStatus.FAILED,
    JobStatus.CANCELLED,
    JobStatus.INTERRUPTED,
}


def _get_job_or_404(job_id: int) -> Job:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        session.expunge(job)
        return job


@router.post("/workspaces/{workspace_id}/jobs/liveness", response_model=JobResponse)
async def create_liveness_job(workspace_id: int, payload: LivenessJobRequest) -> Job:
    if not payload.asset_ids:
        raise HTTPException(status_code=400, detail="asset_ids must not be empty")

    job_id = await asyncio.to_thread(
        create_scoped_job,
        workspace_id,
        "liveness",
        {
            "concurrency": payload.concurrency,
            "timeout": payload.timeout,
            "retries": payload.retries,
            "rps": payload.rps,
        },
        payload.asset_ids,
    )
    job_engine.launch_job(job_id)
    return await asyncio.to_thread(_get_job_or_404, job_id)


def _list_jobs(workspace_id: int, job_type: Optional[str]) -> list[Job]:
    with get_session() as session:
        stmt = select(Job).where(Job.workspace_id == workspace_id)
        if job_type is not None:
            stmt = stmt.where(Job.type == job_type)
        stmt = stmt.order_by(Job.id.desc())
        jobs = session.exec(stmt).all()
        session.expunge_all()
        return jobs


@router.get("/workspaces/{workspace_id}/jobs", response_model=list[JobResponse])
async def list_jobs(workspace_id: int, type: Optional[str] = Query(default=None)) -> list[Job]:
    return await asyncio.to_thread(_list_jobs, workspace_id, type)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: int) -> Job:
    return await asyncio.to_thread(_get_job_or_404, job_id)


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: int) -> dict:
    cancelled = job_engine.cancel_job(job_id)
    if not cancelled:
        raise HTTPException(status_code=409, detail="job is not currently running")
    return {"cancelled": True}


def _get_liveness_results(job_id: int, alive_only: Optional[bool]) -> list[dict]:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        if job.type != "liveness":
            raise HTTPException(status_code=400, detail=f"job {job_id} is not a liveness job")

        stmt = select(LivenessResult, Asset).join(Asset, LivenessResult.asset_id == Asset.id).where(
            LivenessResult.job_id == job_id
        )
        if alive_only is not None:
            stmt = stmt.where(LivenessResult.reachable == alive_only)
        rows = session.exec(stmt).all()
        return [
            {
                "asset_id": asset.id,
                "url": asset.normalized_url,
                "reachable": result.reachable,
                "status_code": result.status_code,
                "page_title": result.page_title,
                "tls_error": result.tls_error,
                "error_message": result.error_message,
                "checked_at": result.checked_at,
                "attempt_count": result.attempt_count,
            }
            for result, asset in rows
        ]


@router.get("/jobs/{job_id}/results", response_model=list[LivenessResultResponse])
async def get_job_results(job_id: int, alive_only: Optional[bool] = Query(default=None)) -> list[dict]:
    return await asyncio.to_thread(_get_liveness_results, job_id, alive_only)


def _job_snapshot(job_id: int):
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            return None, []
        logs = session.exec(select(JobLog).where(JobLog.job_id == job_id).order_by(JobLog.id)).all()
        session.expunge_all()
        return job, logs


@router.websocket("/ws/jobs/{job_id}")
async def job_ws(websocket: WebSocket, job_id: int) -> None:
    await websocket.accept()

    # Subscribe before reading DB state so we never miss the "end" event that
    # can race between our snapshot query and the job finishing concurrently.
    queue = job_broadcast.subscribe(job_id)
    try:
        job, logs = await asyncio.to_thread(_job_snapshot, job_id)
        if job is None:
            await websocket.send_json({"type": "error", "message": "job not found"})
            await websocket.close(code=4404)
            return

        for log in logs:
            await websocket.send_json(
                {"type": "log", "ts": log.ts.isoformat(), "level": log.level, "message": log.message}
            )
        await websocket.send_json(
            {
                "type": "progress",
                "done": job.progress_done,
                "total": job.progress_total,
                "success": job.progress_success,
                "fail": job.progress_fail,
            }
        )

        if job.status in _TERMINAL_STATUSES:
            await websocket.send_json({"type": "end"})
            await websocket.close()
            return

        while True:
            message = await queue.get()
            await websocket.send_json(message)
            if message.get("type") == "end":
                break
    except WebSocketDisconnect:
        pass
    finally:
        job_broadcast.unsubscribe(job_id, queue)
