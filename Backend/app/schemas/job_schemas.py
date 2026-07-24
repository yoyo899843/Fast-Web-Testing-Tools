from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class LivenessJobRequest(BaseModel):
    asset_ids: list[int]
    concurrency: int = 10
    timeout: float = 10.0
    retries: int = 0
    rps: float = 5.0


class JobResponse(BaseModel):
    id: int
    type: str
    status: str
    progress_total: int
    progress_done: int
    progress_success: int
    progress_fail: int
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    error_message: Optional[str]


class LivenessResultResponse(BaseModel):
    asset_id: int
    url: str
    reachable: bool
    status_code: Optional[int]
    page_title: Optional[str]
    tls_error: Optional[str]
    error_message: Optional[str]
    checked_at: datetime
    attempt_count: int
