from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DirsearchJobRequest(BaseModel):
    asset_ids: list[int]
    target_concurrency: int = 2
    threads: int = 25
    exclude_status: str = "403,500"


class DirsearchResultResponse(BaseModel):
    asset_id: int
    target_url: str
    url: str
    path: str
    status_code: int
    content_length: Optional[int]
    content_type: Optional[str]
    redirect: Optional[str]
    found_at: datetime
