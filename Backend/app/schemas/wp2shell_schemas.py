from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class Wp2shellJobRequest(BaseModel):
    url: str
    mode: Literal["test", "bash"] = "test"
    command: Optional[str] = None
    insecure: bool = False


class Wp2shellResultResponse(BaseModel):
    url: str
    mode: str
    vulnerable: bool
    username: Optional[str]
    password: Optional[str]
    command: Optional[str]
    command_output: Optional[str]
    error: Optional[str]
    created_at: datetime


class Wp2shellResultsResponse(BaseModel):
    target: str
    mode: str
    result: Optional[Wp2shellResultResponse] = None
    error_message: Optional[str] = None
