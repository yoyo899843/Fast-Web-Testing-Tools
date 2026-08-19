import asyncio
from collections.abc import Awaitable, Callable

from app.models.assets import Asset
from app.services.job_engine import JobContext
from app.services.proc_utils import terminate_process_group


async def _stream_subprocess_output(proc: "asyncio.subprocess.Process", ctx: JobContext, label: str) -> None:
    """Forward a subprocess's combined stdout into the job log, line by line.

    Reads raw chunks and splits on "\\r" or "\\n" ourselves rather than
    readline(): some CLI tools (dirsearch) repeat a progress bar over "\\r"
    without ever emitting "\\n", which can exceed asyncio's StreamReader
    line-length limit (64KB) and raise LimitOverrunError - crashing the
    whole job if readline() is used instead. Observed in practice, not a
    hypothetical.
    """
    assert proc.stdout is not None
    buffer = b""
    while True:
        chunk = await proc.stdout.read(4096)
        if not chunk:
            text = buffer.decode(errors="replace").strip()
            if text:
                await ctx.log(f"[{label}] {text}")
            break
        buffer += chunk
        while True:
            positions = [i for i in (buffer.find(b"\n"), buffer.find(b"\r")) if i != -1]
            if not positions:
                break
            idx = min(positions)
            line, buffer = buffer[:idx], buffer[idx + 1 :]
            text = line.decode(errors="replace").strip()
            if text:
                await ctx.log(f"[{label}] {text}")


async def run_subprocess(cmd: list[str], ctx: JobContext, label: str, timeout: float | None = None) -> int:
    """Run one cancellable subprocess, streaming its output into the job log.

    Returns the process's exit code (negative if killed by signal). Respects
    ctx.cancel_event: if set while the subprocess is still running, escalates
    SIGTERM -> SIGKILL against its whole process group (see proc_utils) rather
    than assuming a single signal is enough. If `timeout` elapses before the
    subprocess finishes, it is killed the same way (this is per-invocation,
    not per-job: callers looping over multiple targets - e.g. run_per_target -
    use this to bound a single target's runtime so a hung one doesn't stall
    the rest).
    """
    await ctx.log(f"$ {' '.join(cmd)}")
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        start_new_session=True,  # own process group, so we can cancel cleanly
    )

    stream_task = asyncio.create_task(_stream_subprocess_output(proc, ctx, label))
    wait_task = asyncio.create_task(proc.wait())
    cancel_task = asyncio.create_task(ctx.cancel_event.wait())
    timeout_task = asyncio.create_task(asyncio.sleep(timeout)) if timeout is not None else None

    wait_set = {wait_task, cancel_task} | ({timeout_task} if timeout_task is not None else set())
    await asyncio.wait(wait_set, return_when=asyncio.FIRST_COMPLETED)
    if not wait_task.done():
        if timeout_task is not None and timeout_task.done():
            await ctx.log(f"Timed out after {timeout:.0f}s, skipping: {label}", level="warn")
        else:
            await ctx.log(f"Cancelling: {label}", level="warn")
        await terminate_process_group(proc.pid)
        await wait_task
    else:
        cancel_task.cancel()
        if timeout_task is not None:
            timeout_task.cancel()
    await stream_task

    return proc.returncode


async def run_per_target(
    ctx: JobContext,
    assets: list[Asset],
    target_concurrency: int,
    handle_target: Callable[[Asset], Awaitable[bool]],
) -> None:
    """Drive handle_target(asset) over every asset with bounded concurrency.

    Tracks done/success/fail progress and respects ctx.cancel_event.
    handle_target is responsible for running its own subprocess (via
    run_subprocess) and persisting its own results - this function only owns
    the concurrency and progress bookkeeping shared by every subprocess-based
    job type (dirsearch, git-dump, whatweb, ...).
    """
    total = len(assets)
    await ctx.update_progress(done=0, total=total, success=0, fail=0)

    semaphore = asyncio.Semaphore(target_concurrency)
    counters = {"done": 0, "success": 0, "fail": 0}
    counters_lock = asyncio.Lock()

    async def _worker(asset: Asset) -> None:
        if ctx.cancel_event.is_set():
            return
        async with semaphore:
            if ctx.cancel_event.is_set():
                return
            success = await handle_target(asset)
        async with counters_lock:
            counters["done"] += 1
            if success:
                counters["success"] += 1
            else:
                counters["fail"] += 1
            await ctx.update_progress(
                done=counters["done"], success=counters["success"], fail=counters["fail"]
            )

    await asyncio.gather(*(_worker(asset) for asset in assets))

    if ctx.cancel_event.is_set():
        await ctx.log(f"Stopped early: {counters['done']}/{total} target(s) processed before cancellation")
    else:
        await ctx.log(f"Done: {counters['done']}/{total} target(s) processed")
