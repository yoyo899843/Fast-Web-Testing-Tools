from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AssetResponse(BaseModel):
    id: int
    raw_url: str
    normalized_url: str
    scheme: str
    host: str
    port: Optional[int]
    path: str
    created_at: datetime
    last_alive: Optional[bool]
    last_checked_at: Optional[datetime]
