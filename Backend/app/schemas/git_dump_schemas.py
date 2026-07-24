from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class GitDumpJobRequest(BaseModel):
    asset_ids: list[int]
    target_concurrency: int = 2


class GitDumpResultResponse(BaseModel):
    asset_id: int
    target_url: str
    exposed: bool
    dump_path: Optional[str]
    file_count: Optional[int]
    dump_size_bytes: Optional[int]
    error_message: Optional[str]
    checked_at: datetime
