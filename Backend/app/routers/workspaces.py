import asyncio
import os
import shutil

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete
from sqlmodel import func, select

from app.db import DATA_DIR, get_session
from app.models.assets import Asset
from app.models.dirsearch import DirsearchResult
from app.models.git_dump import GitDumpResult
from app.models.imports import ImportBatch, ImportRow
from app.models.jobs import Job, JobLog, JobStatus
from app.models.liveness import LivenessResult
from app.models.whatweb import WhatwebResult
from app.models.workspace import Workspace

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceCreateRequest(BaseModel):
    name: str
    description: str | None = None


class WorkspaceResponse(BaseModel):
    id: int
    name: str
    description: str | None
    created_at: str
    asset_count: int
    job_count: int


def _to_response(workspace: Workspace, asset_count: int, job_count: int) -> dict:
    return {
        "id": workspace.id,
        "name": workspace.name,
        "description": workspace.description,
        "created_at": workspace.created_at.isoformat(),
        "asset_count": asset_count,
        "job_count": job_count,
    }


def _create(payload: WorkspaceCreateRequest) -> dict:
    with get_session() as session:
        workspace = Workspace(name=payload.name, description=payload.description)
        session.add(workspace)
        session.commit()
        session.refresh(workspace)
        return _to_response(workspace, 0, 0)


def _list() -> list[dict]:
    with get_session() as session:
        workspaces = session.exec(select(Workspace).order_by(Workspace.id.desc())).all()
        result = []
        for ws in workspaces:
            asset_count = session.exec(
                select(func.count()).select_from(Asset).where(Asset.workspace_id == ws.id)
            ).one()
            job_count = session.exec(
                select(func.count()).select_from(Job).where(Job.workspace_id == ws.id)
            ).one()
            result.append(_to_response(ws, asset_count, job_count))
        return result


def _get(workspace_id: int) -> dict:
    with get_session() as session:
        workspace = session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(status_code=404, detail="workspace not found")
        asset_count = session.exec(
            select(func.count()).select_from(Asset).where(Asset.workspace_id == workspace_id)
        ).one()
        job_count = session.exec(
            select(func.count()).select_from(Job).where(Job.workspace_id == workspace_id)
        ).one()
        return _to_response(workspace, asset_count, job_count)


@router.post("", response_model=WorkspaceResponse)
async def create_workspace(payload: WorkspaceCreateRequest) -> dict:
    return await asyncio.to_thread(_create, payload)


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces() -> list[dict]:
    return await asyncio.to_thread(_list)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(workspace_id: int) -> dict:
    return await asyncio.to_thread(_get, workspace_id)


def _delete(workspace_id: int) -> list[int]:
    with get_session() as session:
        workspace = session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(status_code=404, detail="workspace not found")

        active = session.exec(
            select(Job.id).where(
                Job.workspace_id == workspace_id,
                Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
            )
        ).all()
        if active:
            raise HTTPException(
                status_code=409,
                detail="workspace has a job still pending/running - cancel or wait for it to finish first",
            )

        job_ids = session.exec(select(Job.id).where(Job.workspace_id == workspace_id)).all()
        batch_ids = session.exec(
            select(ImportBatch.id).where(ImportBatch.workspace_id == workspace_id)
        ).all()

        if job_ids:
            session.exec(sa_delete(LivenessResult).where(LivenessResult.job_id.in_(job_ids)))
            session.exec(sa_delete(DirsearchResult).where(DirsearchResult.job_id.in_(job_ids)))
            session.exec(sa_delete(GitDumpResult).where(GitDumpResult.job_id.in_(job_ids)))
            session.exec(sa_delete(WhatwebResult).where(WhatwebResult.job_id.in_(job_ids)))
            session.exec(sa_delete(JobLog).where(JobLog.job_id.in_(job_ids)))
        if batch_ids:
            session.exec(sa_delete(ImportRow).where(ImportRow.batch_id.in_(batch_ids)))

        session.exec(sa_delete(Job).where(Job.workspace_id == workspace_id))
        session.exec(sa_delete(Asset).where(Asset.workspace_id == workspace_id))
        session.exec(sa_delete(ImportBatch).where(ImportBatch.workspace_id == workspace_id))
        session.delete(workspace)
        session.commit()
        return job_ids


@router.delete("/{workspace_id}")
async def delete_workspace(workspace_id: int) -> dict:
    job_ids = await asyncio.to_thread(_delete, workspace_id)
    # Best-effort: remove any on-disk git-dump artifacts for this workspace's jobs.
    for job_id in job_ids:
        shutil.rmtree(os.path.join(DATA_DIR, "git_dumps", str(job_id)), ignore_errors=True)
    return {"deleted": True}
