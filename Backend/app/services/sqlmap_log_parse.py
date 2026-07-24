import re

# sqlmap's own report format, stable across versions and identical whether
# read from stdout or from the "log" file it writes under --output-dir:
#
#   Parameter: id (GET)
#       Type: boolean-based blind
#       Title: AND boolean-based blind - WHERE or HAVING clause
#       Payload: id=1 AND 4531=4531
#
#       Type: error-based
#       ...
_PARAM_BLOCK_RE = re.compile(
    r"Parameter:\s*(?P<param>\S+)\s*\((?P<place>[^)]+)\)\n(?P<body>(?:(?!Parameter:).)*)",
    re.DOTALL,
)
_TECHNIQUE_RE = re.compile(
    r"Type:\s*(?P<type>.+?)\s*\n\s*Title:\s*(?P<title>.+?)\s*\n\s*Payload:\s*(?P<payload>.+?)\s*\n"
)


def parse_findings(log_text: str) -> list[dict]:
    findings = []
    for block in _PARAM_BLOCK_RE.finditer(log_text):
        param = block.group("param")
        place = block.group("place")
        for type_, title, payload in _TECHNIQUE_RE.findall(block.group("body")):
            findings.append(
                {
                    "parameter": param,
                    "place": place,
                    "type": type_.strip(),
                    "title": title.strip(),
                    "payload": payload.strip(),
                }
            )
    return findings
