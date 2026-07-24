from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class SqlmapFinding(SQLModel, table=True):
    __tablename__ = "sqlmap_findings"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="jobs.id", index=True)
    parameter: str
    place: str
    type: str
    title: str
    payload: str
    found_at: datetime = Field(default_factory=datetime.utcnow)
