from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel, UniqueConstraint


class Asset(SQLModel, table=True):
    __tablename__ = "assets"
    __table_args__ = (UniqueConstraint("workspace_id", "normalized_url"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(foreign_key="workspaces.id", index=True)
    raw_url: str
    normalized_url: str = Field(index=True)
    scheme: str
    host: str
    port: Optional[int] = None
    path: str = Field(default="/")
    first_seen_batch_id: Optional[int] = Field(default=None, foreign_key="import_batches.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_liveness_job_id: Optional[int] = Field(default=None, foreign_key="jobs.id")
    last_alive: Optional[bool] = None
    last_checked_at: Optional[datetime] = None
