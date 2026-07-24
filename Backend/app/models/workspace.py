from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Workspace(SQLModel, table=True):
    __tablename__ = "workspaces"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
