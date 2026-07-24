import asyncio
import json
import os
import shutil
import tempfile

from app.db import get_session
from app.models.jobs import Job
from app.models.sqlmap import SqlmapFinding
from app.services.http_request_parse import parse_get_url, parse_raw_request
from app.services.job_engine import JobContext
from app.services.job_handlers import register_job_handler
from app.services.sqlmap_log_parse import parse_findings
from app.services.subprocess_job import run_subprocess


def _find_log_file(output_dir: str) -> str | None:
    for root, _dirs, files in os.walk(output_dir):
        if "log" in files:
            return os.path.join(root, "log")
    return None


def _persist_findings(job_id: int, findings: list[dict]) -> None:
    if not findings:
        return
    with get_session() as session:
        for f in findings:
            session.add(SqlmapFinding(job_id=job_id, **f))
        session.commit()


@register_job_handler("sqlmap")
async def run_sqlmap_job(job: Job, ctx: JobContext) -> None:
    params = json.loads(job.params_json)
    mode = params.get("mode", "get")
    raw = params.get("raw", "")
    selected_params = params.get("params", [])
    risk = int(params.get("risk", 1))
    level = int(params.get("level", 1))
    https = bool(params.get("https", False))

    output_dir = tempfile.mkdtemp(prefix=f"sqlmap_{job.id}_")
    req_file = None

    try:
        cmd = ["sqlmap", "--batch", "--disable-coloring", "--output-dir", output_dir]

        if mode == "get":
            target = parse_get_url(raw)["url"]
            cmd += ["-u", target]
            await ctx.log(f"SQLMap targeting URL: {target}")
        else:
            parsed = parse_raw_request(raw)
            fd, req_file = tempfile.mkstemp(suffix=".req", prefix=f"sqlmap_{job.id}_")
            with os.fdopen(fd, "w") as f:
                f.write(raw.strip("\n") + "\n")
            cmd += ["-r", req_file]
            if https:
                cmd += ["--force-ssl"]
            await ctx.log(f"SQLMap targeting raw request: {parsed['method']} {parsed['path']}")

        cmd += ["-p", ",".join(selected_params), "--risk", str(risk), "--level", str(level)]

        await ctx.log(f"Testing parameter(s): {', '.join(selected_params)}")
        returncode = await run_subprocess(cmd, ctx, "sqlmap")

        log_path = _find_log_file(output_dir)
        log_text = await asyncio.to_thread(lambda: open(log_path).read()) if log_path else ""
        findings = parse_findings(log_text)
        await ctx.log(f"{len(findings)} injection technique(s) identified" if findings else "No injectable parameters found")
        await asyncio.to_thread(_persist_findings, job.id, findings)

        if returncode not in (0, 1):
            # sqlmap exits 1 when the target simply isn't injectable - that is
            # a normal, successful scan outcome, not a job failure. Anything
            # else (bad args, crash, aborted connection) is worth flagging.
            await ctx.log(f"sqlmap exited with code {returncode}", level="warn")
    finally:
        shutil.rmtree(output_dir, ignore_errors=True)
        if req_file:
            try:
                os.remove(req_file)
            except OSError:
                pass
