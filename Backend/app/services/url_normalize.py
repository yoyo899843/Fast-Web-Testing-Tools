import ipaddress
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlsplit

_ALLOWED_SCHEMES = {"http", "https"}
_WHITESPACE_RE = re.compile(r"\s")
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$"
)


@dataclass
class NormalizeResult:
    normalized_url: Optional[str]
    scheme: Optional[str]
    host: Optional[str]
    port: Optional[int]
    path: Optional[str]
    error: Optional[str]


def _is_valid_host(host: str) -> bool:
    if not host:
        return False
    candidate = host[1:-1] if host.startswith("[") and host.endswith("]") else host
    try:
        ipaddress.ip_address(candidate)
        return True
    except ValueError:
        pass
    return bool(_HOSTNAME_RE.match(host))


def normalize_url(raw: str) -> NormalizeResult:
    value = raw.strip()
    if not value:
        return NormalizeResult(None, None, None, None, None, "empty value")
    if _WHITESPACE_RE.search(value):
        return NormalizeResult(None, None, None, None, None, "contains whitespace")
    if _CONTROL_CHAR_RE.search(value):
        return NormalizeResult(None, None, None, None, None, "contains control characters")

    candidate = value if "://" in value else f"http://{value}"

    try:
        parts = urlsplit(candidate)
    except ValueError as exc:
        return NormalizeResult(None, None, None, None, None, f"could not parse URL: {exc}")

    scheme = parts.scheme.lower()
    if scheme not in _ALLOWED_SCHEMES:
        return NormalizeResult(None, None, None, None, None, f"unsupported scheme: {scheme}")

    host = parts.hostname
    if not host:
        return NormalizeResult(None, None, None, None, None, "missing host")
    host = host.lower()
    if not _is_valid_host(host):
        return NormalizeResult(None, None, None, None, None, f"invalid host: {host}")

    port = parts.port
    default_port = 80 if scheme == "http" else 443
    display_port = None if port is None or port == default_port else port

    path = parts.path or "/"
    query = f"?{parts.query}" if parts.query else ""

    host_part = f"[{host}]" if ":" in host else host
    authority = f"{host_part}:{display_port}" if display_port else host_part
    normalized = f"{scheme}://{authority}{path}{query}"

    return NormalizeResult(normalized, scheme, host, display_port, path, None)
