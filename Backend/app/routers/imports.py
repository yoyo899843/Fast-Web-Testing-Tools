import asyncio
from typing import Optional

from fastapi import APIRouter, File, UploadFile

from app.db import get_session
from app.schemas.import_schemas import ImportSummaryResponse, PasteImportRequest
from app.services.importer import parse_csv, parse_paste, run_import

router = APIRouter(prefix="/workspaces/{workspace_id}/assets/import", tags=["imports"])


def _run_import_sync(workspace_id: int, lines: list[str], source: str, filename: Optional[str]):
    with get_session() as session:
        return run_import(session, workspace_id, lines, source, filename)


@router.post("/paste", response_model=ImportSummaryResponse)
async def import_paste(workspace_id: int, payload: PasteImportRequest) -> ImportSummaryResponse:
    lines = parse_paste(payload.text)
    summary = await asyncio.to_thread(_run_import_sync, workspace_id, lines, "paste", None)
    return ImportSummaryResponse.from_summary(summary)


@router.post("/file", response_model=ImportSummaryResponse)
async def import_file(workspace_id: int, file: UploadFile = File(...)) -> ImportSummaryResponse:
    raw_bytes = await file.read()
    filename = file.filename or "upload"
    if filename.lower().endswith(".csv"):
        lines = parse_csv(raw_bytes)
        source = "file:csv"
    else:
        lines = raw_bytes.decode("utf-8", errors="replace").splitlines()
        source = "file:txt"
    summary = await asyncio.to_thread(_run_import_sync, workspace_id, lines, source, filename)
    return ImportSummaryResponse.from_summary(summary)
