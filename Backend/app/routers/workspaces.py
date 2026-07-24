import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import func, select

from app.db import get_session
from app.models.assets import Asset
from app.models.jobs import Job
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
