"""Scanner for the offensive-tools directory.

Each tool is either:
  - a folder containing a `tool.json` manifest (the folder may hold scripts,
    wordlists, or anything the tool needs), or
  - a single script file (`*.py` / `*.sh`) at the top level, optionally with a
    sidecar `<name>.json` manifest for metadata.

Manifest (tool.json) fields:
  name        display name (default: folder/file name)
  description short zh-TW summary shown in the checklist
  dangerous   bool, renders a warning badge in the UI
  command     base command line inserted into the terminal, e.g.
              "sqlmap --batch" or "python3 /opt/tools/foo/foo.py"
  check       argv array used to probe availability (exit 0 = available)
  args        list of {flag, label, placeholder, required, type}
              type "value" (default) renders a text input; "flag" a checkbox
"""

import asyncio
import json
import os
import time
from typing import Any, Optional

TOOLS_DIR = os.environ.get("TOOLS_DIR", "/opt/tools")
_CHECK_TTL_SECONDS = 60
_CHECK_TIMEOUT_SECONDS = 3

# name -> (expires_at, available)
_check_cache: dict[str, tuple[float, bool]] = {}


def _normalize_arg(raw: dict) -> dict:
    return {
        "flag": raw["flag"],
        "label": raw.get("label") or raw["flag"],
        "placeholder": raw.get("placeholder", ""),
        "required": bool(raw.get("required", False)),
        "type": "flag" if raw.get("type") == "flag" else "value",
    }


def _manifest_from_json(path: str, defaults: dict) -> Optional[dict]:
    try:
        with open(path, encoding="utf-8") as f:
            raw: dict[str, Any] = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    if not raw.get("command"):
        return None
    tool = {
        "name": raw.get("name") or defaults["name"],
        "description": raw.get("description", ""),
        "dangerous": bool(raw.get("dangerous", False)),
        "command": raw["command"],
        "check": raw.get("check") if isinstance(raw.get("check"), list) else None,
        "args": [_normalize_arg(a) for a in raw.get("args", []) if isinstance(a, dict) and a.get("flag")],
        "source": defaults["source"],
    }
    return tool


def _auto_manifest_for_file(filename: str) -> dict:
    stem, ext = os.path.splitext(filename)
    full = os.path.join(TOOLS_DIR, filename)
    if ext == ".py":
        command = f"python3 {full}"
    elif ext == ".sh":
        command = f"bash {full}"
    else:
        command = full
    return {
        "name": stem,
        "description": "",
        "dangerous": False,
        "command": command,
        "check": None,
        "args": [],
        "source": filename,
    }


def scan_tools() -> list[dict]:
    """Read the tools directory and return normalized manifests (no availability)."""
    tools: list[dict] = []
    try:
        entries = sorted(os.listdir(TOOLS_DIR))
    except OSError:
        return tools

    for entry in entries:
        if entry.startswith("."):
            continue
        full = os.path.join(TOOLS_DIR, entry)
        if os.path.isdir(full):
            manifest_path = os.path.join(full, "tool.json")
            if not os.path.isfile(manifest_path):
                continue
            tool = _manifest_from_json(
                manifest_path, {"name": entry, "source": f"{entry}/"}
            )
            if tool:
                tools.append(tool)
        elif os.path.isfile(full):
            stem, ext = os.path.splitext(entry)
            if ext not in (".py", ".sh"):
                continue
            sidecar = os.path.join(TOOLS_DIR, f"{stem}.json")
            if os.path.isfile(sidecar):
                tool = _manifest_from_json(sidecar, {"name": stem, "source": entry})
                tools.append(tool if tool else _auto_manifest_for_file(entry))
            else:
                tools.append(_auto_manifest_for_file(entry))
    return tools


async def _probe(check: list[str]) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            *check,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=_CHECK_TIMEOUT_SECONDS)
        return proc.returncode == 0
    except (OSError, asyncio.TimeoutError):
        return False


async def check_availability(tool: dict) -> bool:
    """Run the manifest's check command, cached for _CHECK_TTL_SECONDS."""
    check = tool.get("check")
    if not check:
        # No probe declared: single-file scripts are present by definition;
        # manifest tools without a check are assumed available.
        return True
    cache_key = f"{tool['name']}:{check[0]}"
    now = time.monotonic()
    cached = _check_cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]
    available = await _probe(check)
    _check_cache[cache_key] = (now + _CHECK_TTL_SECONDS, available)
    return available


async def list_tools() -> list[dict]:
    tools = scan_tools()
    availability = await asyncio.gather(*(check_availability(t) for t in tools))
    for tool, available in zip(tools, availability):
        tool["available"] = available
        tool.pop("check", None)
    return tools


def clear_cache() -> None:
    _check_cache.clear()
