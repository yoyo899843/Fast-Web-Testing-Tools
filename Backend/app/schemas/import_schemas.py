from pydantic import BaseModel

from app.services.importer import ImportSummary


class PasteImportRequest(BaseModel):
    text: str


class ImportRowErrorResponse(BaseModel):
    row_index: int
    raw_value: str
    error_message: str


class ImportSummaryResponse(BaseModel):
    batch_id: int
    total_rows: int
    valid_count: int
    duplicate_count: int
    invalid_count: int
    errors: list[ImportRowErrorResponse]

    @classmethod
    def from_summary(cls, summary: ImportSummary) -> "ImportSummaryResponse":
        return cls(
            batch_id=summary.batch_id,
            total_rows=summary.total_rows,
            valid_count=summary.valid_count,
            duplicate_count=summary.duplicate_count,
            invalid_count=summary.invalid_count,
            errors=[ImportRowErrorResponse(**vars(e)) for e in summary.errors],
        )
