import asyncio
import json

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.db import get_session
from app.models.assets import Asset
from app.models.jobs import Job
from app.models.whatweb import WhatwebResult
from app.schemas.job_schemas import JobResponse
from app.schemas.whatweb_schemas import WhatwebJobRequest, WhatwebResultResponse
from app.services import job_engine
from app.services.workspace_utils import create_scoped_job

router = APIRouter(tags=["whatweb"])


def _get_job_or_404(job_id: int) -> Job:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        session.expunge(job)
        return job


@router.post("/workspaces/{workspace_id}/jobs/whatweb", response_model=JobResponse)
async def create_whatweb_job(workspace_id: int, payload: WhatwebJobRequest) -> Job:
    if not payload.asset_ids:
        raise HTTPException(status_code=400, detail="asset_ids must not be empty")

    job_id = await asyncio.to_thread(
        create_scoped_job,
        workspace_id,
        "whatweb",
        {"target_concurrency": payload.target_concurrency, "aggression": payload.aggression},
        payload.asset_ids,
    )
    job_engine.launch_job(job_id)
    return await asyncio.to_thread(_get_job_or_404, job_id)


def _get_results(job_id: int) -> list[dict]:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        if job.type != "whatweb":
            raise HTTPException(status_code=400, detail=f"job {job_id} is not a whatweb job")

        stmt = (
            select(WhatwebResult, Asset)
            .join(Asset, WhatwebResult.asset_id == Asset.id)
            .where(WhatwebResult.job_id == job_id)
        )
        rows = session.exec(stmt).all()
        return [
            {
                "asset_id": asset.id,
                "target_url": asset.normalized_url,
                "http_status": result.http_status,
                "plugins": json.loads(result.plugins_json),
                "error_message": result.error_message,
                "checked_at": result.checked_at,
            }
            for result, asset in rows
        ]


@router.get("/jobs/whatweb/{job_id}/results", response_model=list[WhatwebResultResponse])
async def get_whatweb_results(job_id: int) -> list[dict]:
    return await asyncio.to_thread(_get_results, job_id)
