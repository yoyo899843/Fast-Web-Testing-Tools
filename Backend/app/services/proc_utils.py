import asyncio
import os
import signal


async def terminate_process_group(pid: int, grace_seconds: float = 2.0) -> None:
    """Escalate SIGTERM -> SIGKILL against a whole process group.

    Do not assume SIGTERM alone is enough - observed in practice (the PTY
    terminal) that an interactive process can simply not act on it. Uses a
    signal-0 probe (os.kill(pid, 0)) to check liveness rather than waitpid:
    asyncio owns reaping for its own subprocesses via proc.wait(), and
    calling waitpid ourselves here would race with that.
    """
    try:
        pgid = os.getpgid(pid)
    except ProcessLookupError:
        return

    for sig, wait_s in ((signal.SIGTERM, grace_seconds), (signal.SIGKILL, None)):
        try:
            os.killpg(pgid, sig)
        except ProcessLookupError:
            return
        if wait_s is None:
            return
        deadline = asyncio.get_event_loop().time() + wait_s
        while asyncio.get_event_loop().time() < deadline:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return
            await asyncio.sleep(0.1)
