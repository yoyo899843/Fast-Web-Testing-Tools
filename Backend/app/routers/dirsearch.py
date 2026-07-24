import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.db import get_session
from app.models.assets import Asset
from app.models.dirsearch import DirsearchResult
from app.models.jobs import Job
from app.schemas.dirsearch_schemas import DirsearchJobRequest, DirsearchResultResponse
from app.schemas.job_schemas import JobResponse
from app.services import job_engine
from app.services.workspace_utils import create_scoped_job

router = APIRouter(tags=["dirsearch"])


def _get_job_or_404(job_id: int) -> Job:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        session.expunge(job)
        return job


@router.post("/workspaces/{workspace_id}/jobs/dirsearch", response_model=JobResponse)
async def create_dirsearch_job(workspace_id: int, payload: DirsearchJobRequest) -> Job:
    if not payload.asset_ids:
        raise HTTPException(status_code=400, detail="asset_ids must not be empty")

    job_id = await asyncio.to_thread(
        create_scoped_job,
        workspace_id,
        "dirsearch",
        {
            "target_concurrency": payload.target_concurrency,
            "threads": payload.threads,
            "exclude_status": payload.exclude_status,
        },
        payload.asset_ids,
    )
    job_engine.launch_job(job_id)
    return await asyncio.to_thread(_get_job_or_404, job_id)


def _get_results(job_id: int, status_codes: Optional[list[int]]) -> list[dict]:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        if job.type != "dirsearch":
            raise HTTPException(status_code=400, detail=f"job {job_id} is not a dirsearch job")

        stmt = (
            select(DirsearchResult, Asset)
            .join(Asset, DirsearchResult.asset_id == Asset.id)
            .where(DirsearchResult.job_id == job_id)
        )
        if status_codes:
            stmt = stmt.where(DirsearchResult.status_code.in_(status_codes))
        rows = session.exec(stmt).all()
        return [
            {
                "asset_id": asset.id,
                "target_url": asset.normalized_url,
                "url": result.url,
                "path": result.path,
                "status_code": result.status_code,
                "content_length": result.content_length,
                "content_type": result.content_type,
                "redirect": result.redirect,
                "found_at": result.found_at,
            }
            for result, asset in rows
        ]


@router.get("/jobs/dirsearch/{job_id}/results", response_model=list[DirsearchResultResponse])
async def get_dirsearch_results(
    job_id: int,
    status: Optional[str] = Query(default=None, description="comma-separated status codes to include"),
) -> list[dict]:
    status_codes = [int(s) for s in status.split(",")] if status else None
    return await asyncio.to_thread(_get_results, job_id, status_codes)
