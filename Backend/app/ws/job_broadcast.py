import asyncio
from collections import defaultdict
from typing import Any

_QUEUE_MAXSIZE = 200

_subscribers: dict[int, list[asyncio.Queue]] = defaultdict(list)


def subscribe(job_id: int) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _subscribers[job_id].append(queue)
    return queue


def unsubscribe(job_id: int, queue: asyncio.Queue) -> None:
    subs = _subscribers.get(job_id)
    if not subs:
        return
    if queue in subs:
        subs.remove(queue)
    if not subs:
        _subscribers.pop(job_id, None)


def publish(job_id: int, message: dict[str, Any]) -> None:
    for queue in list(_subscribers.get(job_id, [])):
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            # Live log is best-effort; the DB (job_logs / results tables) is the source of
            # truth. Drop the oldest buffered message to make room rather than block the
            # publisher or grow unbounded.
            try:
                queue.get_nowait()
                queue.put_nowait(message)
            except asyncio.QueueEmpty:
                pass
