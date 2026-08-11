import asyncio
import json
import os
import sys
import tempfile

from app.db import get_session
from app.models.jobs import Job
from app.models.wp2shell import Wp2shellResult
from app.services.job_engine import JobContext
from app.services.job_handlers import register_job_handler
from app.services.subprocess_job import run_subprocess

SCRIPT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "wp2shell.py")


def _persist_result(result: Wp2shellResult) -> None:
    with get_session() as session:
        session.add(result)
        session.commit()


@register_job_handler("wp2shell")
async def run_wp2shell_job(job: Job, ctx: JobContext) -> None:
    params = json.loads(job.params_json)
    url = params.get("url", "")
    mode = params.get("mode", "test")
    command = params.get("command", "")
    insecure = bool(params.get("insecure", False))

    fd, output_path = tempfile.mkstemp(suffix=".json", prefix=f"wp2shell_{job.id}_")
    os.close(fd)

    try:
        # sys.executable is the interpreter running uvicorn - the script only
        # needs the stdlib, so no extra tooling is required in the image.
        cmd = [sys.executable, SCRIPT_PATH, "--url", url, "--output", output_path]
        if mode == "bash":
            cmd += ["--bash", "--command", command]
        else:
            cmd += ["--test"]
        if insecure:
            cmd += ["--insecure"]

        await ctx.log(f"wp2shell mode={mode} target={url}")
        if mode == "bash":
            await ctx.log(
                "bash mode creates a real admin account and uploads a plugin on the target",
                level="warn",
            )
        returncode = await run_subprocess(cmd, ctx, "wp2shell")

        data = {}
        try:
            with open(output_path) as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            await ctx.log("wp2shell produced no structured result", level="warn")

        vulnerable = bool(data.get("vulnerable", False))
        error = data.get("error")
        result = Wp2shellResult(
            job_id=job.id,
            url=url,
            mode=mode,
            vulnerable=vulnerable,
            username=data.get("username"),
            password=data.get("password"),
            command=data.get("command"),
            command_output=data.get("command_output"),
            error=error,
        )
        await asyncio.to_thread(_persist_result, result)

        # NOTE: read from local vars, not the ORM object - commit() expires its
        # attributes, and touching them after the session closed would raise.
        if vulnerable:
            await ctx.log("Target is vulnerable")
        elif error:
            await ctx.log(f"wp2shell: {error}", level="warn")
        if returncode != 0:
            await ctx.log(f"wp2shell exited with code {returncode}", level="warn")
    finally:
        try:
            os.remove(output_path)
        except OSError:
            pass
