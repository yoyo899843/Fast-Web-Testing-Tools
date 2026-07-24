from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class WhatwebResult(SQLModel, table=True):
    __tablename__ = "whatweb_results"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="jobs.id", index=True)
    asset_id: int = Field(foreign_key="assets.id", index=True)
    http_status: Optional[int] = None
    plugins_json: str = Field(default="{}")
    error_message: Optional[str] = None
    checked_at: datetime = Field(default_factory=datetime.utcnow)
