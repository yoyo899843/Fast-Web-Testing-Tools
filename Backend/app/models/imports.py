from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ImportOutcome:
    VALID = "valid"
    DUPLICATE_IN_BATCH = "duplicate_in_batch"
    DUPLICATE_EXISTING = "duplicate_existing"
    INVALID = "invalid"


class ImportBatch(SQLModel, table=True):
    __tablename__ = "import_batches"

    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(foreign_key="workspaces.id", index=True)
    source: str  # 'paste' | 'file:txt' | 'file:csv'
    filename: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    total_rows: int = Field(default=0)
    valid_count: int = Field(default=0)
    duplicate_count: int = Field(default=0)
    invalid_count: int = Field(default=0)


class ImportRow(SQLModel, table=True):
    __tablename__ = "import_rows"

    id: Optional[int] = Field(default=None, primary_key=True)
    batch_id: int = Field(foreign_key="import_batches.id", index=True)
    row_index: int
    raw_value: str
    normalized_url: Optional[str] = None
    outcome: str
    error_message: Optional[str] = None
    asset_id: Optional[int] = Field(default=None, foreign_key="assets.id")
