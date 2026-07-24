import csv
import io
from dataclasses import dataclass, field
from typing import Optional

from sqlmodel import Session, select

from app.models.assets import Asset
from app.models.imports import ImportBatch, ImportOutcome, ImportRow
from app.services.url_normalize import normalize_url


@dataclass
class ImportRowError:
    row_index: int
    raw_value: str
    error_message: str


@dataclass
class ImportSummary:
    batch_id: int
    total_rows: int
    valid_count: int
    duplicate_count: int
    invalid_count: int
    errors: list[ImportRowError] = field(default_factory=list)


def parse_paste(text: str) -> list[str]:
    return text.splitlines()


def parse_csv(raw_bytes: bytes) -> list[str]:
    text = raw_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = []
    for row in reader:
        if row:
            rows.append(row[0])
    return rows


def run_import(
    session: Session, workspace_id: int, raw_lines: list[str], source: str, filename: Optional[str]
) -> ImportSummary:
    batch = ImportBatch(workspace_id=workspace_id, source=source, filename=filename)
    session.add(batch)
    session.commit()
    session.refresh(batch)

    seen_in_batch: dict[str, int] = {}
    valid_count = duplicate_count = invalid_count = 0
    errors: list[ImportRowError] = []

    for index, raw in enumerate(raw_lines):
        if not raw.strip():
            continue

        result = normalize_url(raw)
        if result.error:
            invalid_count += 1
            errors.append(ImportRowError(row_index=index, raw_value=raw, error_message=result.error))
            session.add(
                ImportRow(
                    batch_id=batch.id,
                    row_index=index,
                    raw_value=raw,
                    outcome=ImportOutcome.INVALID,
                    error_message=result.error,
                )
            )
            continue

        normalized = result.normalized_url

        if normalized in seen_in_batch:
            duplicate_count += 1
            session.add(
                ImportRow(
                    batch_id=batch.id,
                    row_index=index,
                    raw_value=raw,
                    normalized_url=normalized,
                    outcome=ImportOutcome.DUPLICATE_IN_BATCH,
                    asset_id=seen_in_batch[normalized],
                )
            )
            continue

        existing = session.exec(
            select(Asset).where(Asset.workspace_id == workspace_id, Asset.normalized_url == normalized)
        ).first()
        if existing:
            duplicate_count += 1
            seen_in_batch[normalized] = existing.id
            session.add(
                ImportRow(
                    batch_id=batch.id,
                    row_index=index,
                    raw_value=raw,
                    normalized_url=normalized,
                    outcome=ImportOutcome.DUPLICATE_EXISTING,
                    asset_id=existing.id,
                )
            )
            continue

        asset = Asset(
            workspace_id=workspace_id,
            raw_url=raw.strip(),
            normalized_url=normalized,
            scheme=result.scheme,
            host=result.host,
            port=result.port,
            path=result.path,
            first_seen_batch_id=batch.id,
        )
        session.add(asset)
        session.commit()
        session.refresh(asset)
        seen_in_batch[normalized] = asset.id
        valid_count += 1
        session.add(
            ImportRow(
                batch_id=batch.id,
                row_index=index,
                raw_value=raw,
                normalized_url=normalized,
                outcome=ImportOutcome.VALID,
                asset_id=asset.id,
            )
        )

    batch.total_rows = valid_count + duplicate_count + invalid_count
    batch.valid_count = valid_count
    batch.duplicate_count = duplicate_count
    batch.invalid_count = invalid_count
    session.add(batch)
    session.commit()

    return ImportSummary(
        batch_id=batch.id,
        total_rows=batch.total_rows,
        valid_count=valid_count,
        duplicate_count=duplicate_count,
        invalid_count=invalid_count,
        errors=errors,
    )
