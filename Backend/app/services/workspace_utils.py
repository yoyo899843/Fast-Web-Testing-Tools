from fastapi import HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models.assets import Asset
from app.services import job_engine


def ensure_assets_in_workspace(session: Session, workspace_id: int, asset_ids: list[int]) -> None:
    found = session.exec(
        select(Asset.id).where(Asset.workspace_id == workspace_id, Asset.id.in_(asset_ids))
    ).all()
    if len(set(found)) != len(set(asset_ids)):
        raise HTTPException(
            status_code=400, detail="one or more asset_ids do not belong to this workspace"
        )


def create_scoped_job(workspace_id: int, job_type: str, params: dict, asset_ids: list[int]) -> int:
    """Validate that asset_ids belong to workspace_id, then create the job.

    Shared by every job-creation endpoint (liveness/dirsearch/git-dump/whatweb)
    so the "don't let a client create a job against another workspace's
    assets" check only has to be right in one place.
    """
    with get_session() as session:
        ensure_assets_in_workspace(session, workspace_id, asset_ids)
    return job_engine.create_job(workspace_id, job_type, params, asset_ids)
