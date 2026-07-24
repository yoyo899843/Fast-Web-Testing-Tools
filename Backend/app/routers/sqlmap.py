import asyncio
import json

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.db import get_session
from app.models.jobs import Job
from app.models.sqlmap import SqlmapFinding
from app.schemas.job_schemas import JobResponse
from app.schemas.sqlmap_schemas import (
    SqlmapFindingResponse,
    SqlmapJobRequest,
    SqlmapParseRequest,
    SqlmapParseResponse,
    SqlmapResultsResponse,
)
from app.services import job_engine
from app.services.http_request_parse import parse_get_url, parse_raw_request

router = APIRouter(tags=["sqlmap"])


def _get_job_or_404(job_id: int) -> Job:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        session.expunge(job)
        return job


@router.post("/sqlmap/parse", response_model=SqlmapParseResponse)
async def parse_sqlmap_target(payload: SqlmapParseRequest) -> dict:
    if not payload.raw.strip():
        raise HTTPException(status_code=400, detail="raw must not be empty")

    if payload.mode == "get":
        parsed = parse_get_url(payload.raw)
        return {"method": "GET", "target": parsed["url"], "params": parsed["params"]}

    parsed = parse_raw_request(payload.raw)
    target = f"{parsed['method']} {parsed['path']}" + (f" (Host: {parsed['host']})" if parsed["host"] else "")
    return {"method": parsed["method"], "target": target, "params": parsed["params"]}


@router.post("/workspaces/{workspace_id}/jobs/sqlmap", response_model=JobResponse)
async def create_sqlmap_job(workspace_id: int, payload: SqlmapJobRequest) -> Job:
    if not payload.raw.strip():
        raise HTTPException(status_code=400, detail="raw must not be empty")
    if not payload.params:
        raise HTTPException(status_code=400, detail="params must not be empty")

    if payload.mode == "get":
        available = set(parse_get_url(payload.raw)["params"])
    else:
        available = set(parse_raw_request(payload.raw)["params"])
    unknown = [p for p in payload.params if p not in available]
    if unknown:
        raise HTTPException(status_code=400, detail=f"unknown parameter(s) not found in request: {unknown}")

    job_id = await asyncio.to_thread(
        job_engine.create_job,
        workspace_id,
        "sqlmap",
        {
            "mode": payload.mode,
            "raw": payload.raw,
            "params": payload.params,
            "risk": max(1, min(3, payload.risk)),
            "level": max(1, min(5, payload.level)),
            "https": payload.https,
        },
    )
    job_engine.launch_job(job_id)
    return await asyncio.to_thread(_get_job_or_404, job_id)


def _get_results(job_id: int) -> dict:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        if job.type != "sqlmap":
            raise HTTPException(status_code=400, detail=f"job {job_id} is not a sqlmap job")

        params = json.loads(job.params_json)
        if params.get("mode") == "get":
            target = parse_get_url(params.get("raw", ""))["url"]
        else:
            parsed = parse_raw_request(params.get("raw", ""))
            target = f"{parsed['method']} {parsed['path']}" + (
                f" (Host: {parsed['host']})" if parsed["host"] else ""
            )

        rows = session.exec(
            select(SqlmapFinding).where(SqlmapFinding.job_id == job_id).order_by(SqlmapFinding.id)
        ).all()
        session.expunge_all()
        return {
            "target": target,
            "findings": rows,
            "error_message": job.error_message,
        }


@router.get("/jobs/sqlmap/{job_id}/results", response_model=SqlmapResultsResponse)
async def get_sqlmap_results(job_id: int) -> dict:
    return await asyncio.to_thread(_get_results, job_id)
