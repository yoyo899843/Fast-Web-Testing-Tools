import json
from urllib.parse import parse_qsl, urlsplit


def parse_get_url(raw: str) -> dict:
    """Parse a bare URL (GET mode) into its target and queryable parameter names."""
    url = raw.strip()
    query = urlsplit(url).query
    params = [k for k, _ in parse_qsl(query, keep_blank_values=True)]
    return {"url": url, "params": list(dict.fromkeys(params))}


def parse_raw_request(raw: str) -> dict:
    """Parse a pasted raw HTTP request (POST mode) into method/path/headers/body/params.

    Mirrors what sqlmap's own -r request-file parser expects, so the same
    pasted text can be handed to sqlmap unmodified while we surface
    candidate parameter names (query string + body) for the user to pick
    which ones to test.
    """
    normalized = raw.replace("\r\n", "\n").strip("\n")
    lines = normalized.split("\n")

    request_line = lines[0].strip() if lines else ""
    parts = request_line.split(" ")
    method = parts[0].upper() if parts and parts[0] else "GET"
    path = parts[1] if len(parts) > 1 else "/"

    idx = 1
    header_lines = []
    while idx < len(lines) and lines[idx].strip() != "":
        header_lines.append(lines[idx])
        idx += 1

    headers = {}
    for line in header_lines:
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip()] = value.strip()

    body = "\n".join(lines[idx + 1 :]).strip("\n") if idx < len(lines) else ""

    query_params = [k for k, _ in parse_qsl(urlsplit(path).query, keep_blank_values=True)]

    content_type = headers.get("Content-Type", "")
    body_params: list[str] = []
    if body:
        if "application/json" in content_type or (not content_type and body.lstrip().startswith("{")):
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                data = None
            if isinstance(data, dict):
                body_params = [str(k) for k in data.keys()]
        else:
            body_params = [k for k, _ in parse_qsl(body, keep_blank_values=True)]

    params = list(dict.fromkeys(query_params + body_params))

    return {
        "method": method,
        "path": path,
        "host": headers.get("Host", ""),
        "params": params,
    }
