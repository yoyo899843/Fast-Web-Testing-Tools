from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel, UniqueConstraint


class LivenessResult(SQLModel, table=True):
    __tablename__ = "liveness_results"
    __table_args__ = (UniqueConstraint("job_id", "asset_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="jobs.id", index=True)
    asset_id: int = Field(foreign_key="assets.id")
    reachable: bool
    status_code: Optional[int] = None
    page_title: Optional[str] = None
    tls_error: Optional[str] = None
    error_message: Optional[str] = None
    checked_at: datetime = Field(default_factory=datetime.utcnow)
    attempt_count: int = Field(default=1)
