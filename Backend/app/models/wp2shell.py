from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Wp2shellResult(SQLModel, table=True):
    __tablename__ = "wp2shell_results"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="jobs.id", index=True)
    url: str
    mode: str
    vulnerable: bool = False
    username: Optional[str] = None
    password: Optional[str] = None
    command: Optional[str] = None
    command_output: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
