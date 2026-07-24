import asyncio

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.db import get_session
from app.models.assets import Asset
from app.models.git_dump import GitDumpResult
from app.models.jobs import Job
from app.schemas.git_dump_schemas import GitDumpJobRequest, GitDumpResultResponse
from app.schemas.job_schemas import JobResponse
from app.services import job_engine
from app.services.workspace_utils import create_scoped_job

router = APIRouter(tags=["git-dump"])


def _get_job_or_404(job_id: int) -> Job:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        session.expunge(job)
        return job


@router.post("/workspaces/{workspace_id}/jobs/git-dump", response_model=JobResponse)
async def create_git_dump_job(workspace_id: int, payload: GitDumpJobRequest) -> Job:
    if not payload.asset_ids:
        raise HTTPException(status_code=400, detail="asset_ids must not be empty")

    job_id = await asyncio.to_thread(
        create_scoped_job,
        workspace_id,
        "git-dump",
        {"target_concurrency": payload.target_concurrency},
        payload.asset_ids,
    )
    job_engine.launch_job(job_id)
    return await asyncio.to_thread(_get_job_or_404, job_id)


def _get_results(job_id: int) -> list[dict]:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        if job.type != "git-dump":
            raise HTTPException(status_code=400, detail=f"job {job_id} is not a git-dump job")

        stmt = (
            select(GitDumpResult, Asset)
            .join(Asset, GitDumpResult.asset_id == Asset.id)
            .where(GitDumpResult.job_id == job_id)
        )
        rows = session.exec(stmt).all()
        return [
            {
                "asset_id": asset.id,
                "target_url": asset.normalized_url,
                "exposed": result.exposed,
                "dump_path": result.dump_path,
                "file_count": result.file_count,
                "dump_size_bytes": result.dump_size_bytes,
                "error_message": result.error_message,
                "checked_at": result.checked_at,
            }
            for result, asset in rows
        ]


@router.get("/jobs/git-dump/{job_id}/results", response_model=list[GitDumpResultResponse])
async def get_git_dump_results(job_id: int) -> list[dict]:
    return await asyncio.to_thread(_get_results, job_id)
