import asyncio
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse
from sqlmodel import select

from app.db import get_session
from app.models.assets import Asset
from app.schemas.asset_schemas import AssetResponse

router = APIRouter(prefix="/workspaces/{workspace_id}/assets", tags=["assets"])


def _list_assets(workspace_id: int, alive: Optional[bool]) -> list[Asset]:
    with get_session() as session:
        stmt = select(Asset).where(Asset.workspace_id == workspace_id)
        if alive is not None:
            stmt = stmt.where(Asset.last_alive == alive)
        stmt = stmt.order_by(Asset.id)
        assets = session.exec(stmt).all()
        session.expunge_all()
        return assets


@router.get("", response_model=list[AssetResponse])
async def list_assets(workspace_id: int, alive: Optional[bool] = Query(default=None)) -> list[Asset]:
    return await asyncio.to_thread(_list_assets, workspace_id, alive)


@router.get("/export")
async def export_assets(workspace_id: int, alive: Optional[bool] = Query(default=None)) -> PlainTextResponse:
    assets = await asyncio.to_thread(_list_assets, workspace_id, alive)
    body = "\n".join(asset.normalized_url for asset in assets)
    return PlainTextResponse(body, media_type="text/plain")
