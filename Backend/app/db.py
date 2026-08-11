import os
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

DATABASE_PATH = os.environ.get("DATABASE_PATH", "./data/app.db")
os.makedirs(os.path.dirname(DATABASE_PATH) or ".", exist_ok=True)

# Same persisted volume as the DB - job modules that produce files on disk
# (e.g. git-dump) write under here so the output survives container restarts.
DATA_DIR = os.path.dirname(DATABASE_PATH) or "."

engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def init_db() -> None:
    # Import models so their tables are registered on SQLModel.metadata before create_all.
    from app.models import assets, dirsearch, git_dump, imports, jobs, liveness, sqlmap, whatweb, wp2shell, workspace  # noqa: F401

    SQLModel.metadata.create_all(engine)


@contextmanager
def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
