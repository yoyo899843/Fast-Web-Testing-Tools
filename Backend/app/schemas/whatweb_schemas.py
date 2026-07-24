from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class WhatwebJobRequest(BaseModel):
    asset_ids: list[int]
    target_concurrency: int = 5
    aggression: int = 1


class WhatwebResultResponse(BaseModel):
    asset_id: int
    target_url: str
    http_status: Optional[int]
    plugins: dict
    error_message: Optional[str]
    checked_at: datetime
