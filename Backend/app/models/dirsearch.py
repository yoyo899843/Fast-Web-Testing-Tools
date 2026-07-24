from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class DirsearchResult(SQLModel, table=True):
    __tablename__ = "dirsearch_results"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="jobs.id", index=True)
    asset_id: int = Field(foreign_key="assets.id", index=True)
    url: str
    path: str
    status_code: int
    content_length: Optional[int] = None
    content_type: Optional[str] = None
    redirect: Optional[str] = None
    found_at: datetime = Field(default_factory=datetime.utcnow)
