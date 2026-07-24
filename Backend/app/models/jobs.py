from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class JobStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    INTERRUPTED = "interrupted"


class Job(SQLModel, table=True):
    __tablename__ = "jobs"

    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(foreign_key="workspaces.id", index=True)
    type: str = Field(index=True)
    status: str = Field(default=JobStatus.PENDING, index=True)
    params_json: str
    target_asset_ids_json: Optional[str] = None
    progress_total: int = Field(default=0)
    progress_done: int = Field(default=0)
    progress_success: int = Field(default=0)
    progress_fail: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error_message: Optional[str] = None


class JobLog(SQLModel, table=True):
    __tablename__ = "job_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="jobs.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow)
    level: str = Field(default="info")
    message: str
