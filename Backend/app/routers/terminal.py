import asyncio
import base64
import fcntl
import json
import os
import pty
import signal
import struct
import termios
import time
from typing import Optional

from fastapi import APIRouter, WebSocket

router = APIRouter(tags=["terminal"])

# Soft cap: this endpoint is an unauthenticated shell into the app container,
# trusted only because the port is loopback-only. Nothing else stops a
# careless client from opening many connections and leaking PTYs/processes.
_MAX_CONCURRENT_TERMINALS = 5
_active_terminals = 0
_active_lock = asyncio.Lock()


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)


def _spawn_shell() -> tuple[int, int]:
    # pty.fork() makes the child a session leader with the pty as its
    # controlling terminal (os.setsid() included) - required for bash job
    # control to work correctly.
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("/bin/bash", ["/bin/bash"])
    return pid, fd


def _read_pty(fd: int, size: int = 4096) -> Optional[bytes]:
    try:
        return os.read(fd, size)
    except OSError:
        # Closed fd or child exited (EIO on Linux PTYs) - treat as EOF.
        return None


def _wait_exited(pid: int, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            reaped_pid, _ = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            return True
        if reaped_pid == pid:
            return True
        time.sleep(0.05)
    return False


def _reap(pid: int, fd: int) -> None:
    try:
        os.close(fd)
    except OSError:
        pass

    try:
        pgid = os.getpgid(pid)
    except ProcessLookupError:
        return

    # Escalate rather than trust a single signal: an interactive bash session
    # attached to a controlling terminal is not guaranteed to act on SIGTERM
    # (observed in practice - it can sit there ignoring it), so fall through
    # to SIGKILL, which cannot be ignored, if the process is still alive.
    for sig, wait_s in ((signal.SIGHUP, 0.5), (signal.SIGTERM, 0.5), (signal.SIGKILL, 1.0)):
        try:
            os.killpg(pgid, sig)
        except ProcessLookupError:
            break
        if _wait_exited(pid, wait_s):
            break

    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass


@router.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket) -> None:
    global _active_terminals

    async with _active_lock:
        if _active_terminals >= _MAX_CONCURRENT_TERMINALS:
            await websocket.close(code=4429)
            return
        _active_terminals += 1

    await websocket.accept()
    pid, fd = await asyncio.to_thread(_spawn_shell)
    loop = asyncio.get_event_loop()

    async def pty_to_ws() -> None:
        while True:
            data = await loop.run_in_executor(None, _read_pty, fd)
            if not data:
                break
            await websocket.send_json(
                {"type": "data", "payload": base64.b64encode(data).decode("ascii")}
            )

    async def ws_to_pty() -> None:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg_type = message.get("type")
            if msg_type == "data":
                payload = message.get("payload", "")
                os.write(fd, payload.encode("utf-8", errors="replace"))
            elif msg_type == "resize":
                _set_winsize(fd, int(message.get("rows", 24)), int(message.get("cols", 80)))

    reader_task = asyncio.create_task(pty_to_ws())
    writer_task = asyncio.create_task(ws_to_pty())

    try:
        await asyncio.wait({reader_task, writer_task}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        writer_task.cancel()
        # Closing the fd and signalling the process group is what actually
        # unblocks the reader's blocking os.read() in its worker thread -
        # cancelling that task alone would not stop it, since a thread
        # already running os.read() cannot be interrupted from outside.
        await asyncio.to_thread(_reap, pid, fd)
        await asyncio.gather(reader_task, writer_task, return_exceptions=True)
        async with _active_lock:
            _active_terminals -= 1
