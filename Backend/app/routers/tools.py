from fastapi import APIRouter

from app.services import tools_registry

router = APIRouter(tags=["tools"])


@router.get("/tools")
async def list_tools() -> list[dict]:
    return await tools_registry.list_tools()


@router.post("/tools/refresh")
async def refresh_tools() -> list[dict]:
    tools_registry.clear_cache()
    return await tools_registry.list_tools()
