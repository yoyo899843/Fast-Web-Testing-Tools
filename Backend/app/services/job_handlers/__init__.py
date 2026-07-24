import importlib
import pkgutil
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.jobs import Job
    from app.services.job_engine import JobContext

JobHandler = Callable[["Job", "JobContext"], Awaitable[None]]

JOB_HANDLERS: dict[str, JobHandler] = {}


def register_job_handler(job_type: str):
    def decorator(fn: JobHandler) -> JobHandler:
        JOB_HANDLERS[job_type] = fn
        return fn

    return decorator


def load_all_handlers() -> None:
    """Import every module in this package so its @register_job_handler runs.

    Adding a new job type only requires dropping a new module in this
    package - no other file needs to change to make it discoverable.
    """
    for _, module_name, _ in pkgutil.iter_modules(__path__):
        importlib.import_module(f"{__name__}.{module_name}")
