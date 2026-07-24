import asyncio
import json
import logging
from datetime import datetime

from sqlmodel import select

from app.db import get_session
from app.models.jobs import Job, JobLog, JobStatus
from app.services.job_handlers import JOB_HANDLERS
from app.ws import job_broadcast

logger = logging.getLogger("job_engine")

# In-memory only while a job is actively running; used to route cancellation
# requests and let WebSocket handlers know a job is live. The DB row is the
# durable source of truth - this registry is just the "is it running right
# now, in this process" index. Requires uvicorn --workers 1.
JOB_REGISTRY: dict[int, "JobContext"] = {}


class JobContext:
    def __init__(self, job_id: int):
        self.job_id = job_id
        self.cancel_event = asyncio.Event()

    async def log(self, message: str, level: str = "info") -> None:
        def _write() -> None:
            with get_session() as session:
                session.add(JobLog(job_id=self.job_id, level=level, message=message))
                session.commit()

        await asyncio.to_thread(_write)
        job_broadcast.publish(
            self.job_id,
            {
                "type": "log",
                "ts": datetime.utcnow().isoformat(),
                "level": level,
                "message": message,
            },
        )

    async def update_progress(
        self,
        *,
        done: int | None = None,
        total: int | None = None,
        success: int | None = None,
        fail: int | None = None,
    ) -> None:
        def _write() -> dict:
            with get_session() as session:
                job = session.get(Job, self.job_id)
                if done is not None:
                    job.progress_done = done
                if total is not None:
                    job.progress_total = total
                if success is not None:
                    job.progress_success = success
                if fail is not None:
                    job.progress_fail = fail
                session.add(job)
                session.commit()
                return {
                    "done": job.progress_done,
                    "total": job.progress_total,
                    "success": job.progress_success,
                    "fail": job.progress_fail,
                }

        snapshot = await asyncio.to_thread(_write)
        job_broadcast.publish(self.job_id, {"type": "progress", **snapshot})


def _set_job_status(job_id: int, status: str, *, error_message: str | None = None) -> None:
    with get_session() as session:
        job = session.get(Job, job_id)
        job.status = status
        if status == JobStatus.RUNNING:
            job.started_at = datetime.utcnow()
        elif status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            job.finished_at = datetime.utcnow()
        if error_message is not None:
            job.error_message = error_message
        session.add(job)
        session.commit()


def _load_job(job_id: int) -> Job:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise ValueError(f"job {job_id} not found")
        session.expunge(job)
        return job


async def run_job(job_id: int) -> None:
    ctx = JobContext(job_id)
    JOB_REGISTRY[job_id] = ctx
    try:
        job = await asyncio.to_thread(_load_job, job_id)
        handler = JOB_HANDLERS.get(job.type)
        if handler is None:
            await asyncio.to_thread(
                _set_job_status, job_id, JobStatus.FAILED, error_message=f"unknown job type: {job.type}"
            )
            await ctx.log(f"No handler registered for job type '{job.type}'", level="error")
            return

        await asyncio.to_thread(_set_job_status, job_id, JobStatus.RUNNING)
        await ctx.log(f"Job {job_id} ({job.type}) started")

        try:
            await handler(job, ctx)
        except asyncio.CancelledError:
            await asyncio.to_thread(_set_job_status, job_id, JobStatus.CANCELLED)
            await ctx.log("Job cancelled", level="warn")
        except Exception as exc:  # noqa: BLE001 - a handler crash must not crash the engine
            logger.exception("job %s failed", job_id)
            await asyncio.to_thread(
                _set_job_status, job_id, JobStatus.FAILED, error_message=str(exc)
            )
            await ctx.log(f"Job failed: {exc}", level="error")
        else:
            if ctx.cancel_event.is_set():
                await asyncio.to_thread(_set_job_status, job_id, JobStatus.CANCELLED)
                await ctx.log("Job cancelled", level="warn")
            else:
                await asyncio.to_thread(_set_job_status, job_id, JobStatus.COMPLETED)
                await ctx.log("Job completed")
    finally:
        job_broadcast.publish(job_id, {"type": "end"})
        JOB_REGISTRY.pop(job_id, None)


def launch_job(job_id: int) -> None:
    asyncio.create_task(run_job(job_id))


def cancel_job(job_id: int) -> bool:
    ctx = JOB_REGISTRY.get(job_id)
    if ctx is None:
        return False
    ctx.cancel_event.set()
    return True


def create_job(
    workspace_id: int, job_type: str, params: dict, target_asset_ids: list[int] | None = None
) -> int:
    with get_session() as session:
        job = Job(
            workspace_id=workspace_id,
            type=job_type,
            status=JobStatus.PENDING,
            params_json=json.dumps(params),
            target_asset_ids_json=json.dumps(target_asset_ids) if target_asset_ids is not None else None,
            progress_total=len(target_asset_ids) if target_asset_ids else 0,
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        return job.id


def reconcile_interrupted_jobs() -> None:
    """Any job still 'running' at process startup was orphaned by a crash/restart.

    The in-memory JOB_REGISTRY is empty on a fresh process, so nothing can ever
    resume these - mark them explicitly rather than leaving a phantom "running"
    job with no way to complete.
    """
    with get_session() as session:
        stmt = select(Job).where(Job.status == JobStatus.RUNNING)
        for job in session.exec(stmt):
            job.status = JobStatus.INTERRUPTED
            job.finished_at = datetime.utcnow()
            session.add(job)
        session.commit()
