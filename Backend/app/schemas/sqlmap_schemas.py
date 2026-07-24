from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class SqlmapParseRequest(BaseModel):
    mode: Literal["get", "post"]
    raw: str


class SqlmapParseResponse(BaseModel):
    method: str
    target: str
    params: list[str]


class SqlmapJobRequest(BaseModel):
    mode: Literal["get", "post"]
    raw: str
    params: list[str]
    risk: int = 1
    level: int = 1
    https: bool = False


class SqlmapFindingResponse(BaseModel):
    parameter: str
    place: str
    type: str
    title: str
    payload: str
    found_at: datetime


class SqlmapResultsResponse(BaseModel):
    target: str
    findings: list[SqlmapFindingResponse]
    error_message: Optional[str] = None
