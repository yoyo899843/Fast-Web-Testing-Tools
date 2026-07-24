from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class GitDumpResult(SQLModel, table=True):
    __tablename__ = "git_dump_results"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="jobs.id", index=True)
    asset_id: int = Field(foreign_key="assets.id", index=True)
    exposed: bool
    dump_path: Optional[str] = None
    file_count: Optional[int] = None
    dump_size_bytes: Optional[int] = None
    error_message: Optional[str] = None
    checked_at: datetime = Field(default_factory=datetime.utcnow)
