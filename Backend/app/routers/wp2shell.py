import asyncio
import json

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.db import get_session
from app.models.jobs import Job
from app.models.wp2shell import Wp2shellResult
from app.schemas.job_schemas import JobResponse
from app.schemas.wp2shell_schemas import (
    Wp2shellJobRequest,
    Wp2shellResultsResponse,
)
from app.services import job_engine

router = APIRouter(tags=["wp2shell"])


def _get_job_or_404(job_id: int) -> Job:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        session.expunge(job)
        return job


@router.post("/workspaces/{workspace_id}/jobs/wp2shell", response_model=JobResponse)
async def create_wp2shell_job(workspace_id: int, payload: Wp2shellJobRequest) -> Job:
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="url must not be empty")
    command = (payload.command or "").strip()
    if payload.mode == "bash" and not command:
        raise HTTPException(status_code=400, detail="command must not be empty in bash mode")

    job_id = await asyncio.to_thread(
        job_engine.create_job,
        workspace_id,
        "wp2shell",
        {"url": url, "mode": payload.mode, "command": command, "insecure": payload.insecure},
    )
    job_engine.launch_job(job_id)
    return await asyncio.to_thread(_get_job_or_404, job_id)


def _get_results(job_id: int) -> dict:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        if job.type != "wp2shell":
            raise HTTPException(status_code=400, detail=f"job {job_id} is not a wp2shell job")

        params = json.loads(job.params_json)
        row = session.exec(
            select(Wp2shellResult).where(Wp2shellResult.job_id == job_id)
        ).first()
        session.expunge_all()
        return {
            "target": params.get("url", ""),
            "mode": params.get("mode", "test"),
            "result": row,
            "error_message": job.error_message,
        }


@router.get("/jobs/wp2shell/{job_id}/results", response_model=Wp2shellResultsResponse)
async def get_wp2shell_results(job_id: int) -> dict:
    return await asyncio.to_thread(_get_results, job_id)
