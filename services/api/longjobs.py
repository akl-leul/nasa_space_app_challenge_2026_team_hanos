"""Long archive reads without long requests.

A platform in front of the API (Vercel's proxy, Render's router) cuts off requests that last too long,
and a browser that gives up used to cancel the work too. Here the work runs as a background task that outlives the
request: the first call waits up to `wait` seconds, and if the answer is not ready it replies 202 "running". The same
call, repeated, is answered from the finished task. Nothing is invented while waiting; the result is the real one.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from typing import Any, Awaitable, Callable, Dict

MAX_ENTRIES = 64
RESULT_TTL_S = 3600.0
DEFAULT_WAIT_S = 25.0


class Pending(Exception):
    """The work is still running; the caller should ask again shortly."""

    def __init__(self, retry_after: int = 3):
        super().__init__("running")
        self.retry_after = retry_after


class _Entry:
    def __init__(self, task: "asyncio.Task[Any]"):
        self.task = task
        self.created = time.monotonic()


_entries: "OrderedDict[str, _Entry]" = OrderedDict()


def _forget_old() -> None:
    now = time.monotonic()
    for k in [k for k, e in _entries.items() if e.task.done() and now - e.created > RESULT_TTL_S]:
        _entries.pop(k, None)
    while len(_entries) > MAX_ENTRIES:
        # drop the oldest finished entry first; a running one is never dropped
        victim = next((k for k, e in _entries.items() if e.task.done()), None)
        if victim is None:
            break
        _entries.pop(victim, None)


async def run_or_pending(key: str, factory: Callable[[], Awaitable[Any]], wait: float = DEFAULT_WAIT_S) -> Any:
    """Returns the result, raises Pending if it is not ready within `wait` seconds, or re-raises the work's own error
    (which is then forgotten, so the next call tries again instead of replaying a failure)."""
    entry = _entries.get(key)
    if entry is not None and entry.task.done() and (entry.task.cancelled() or entry.task.exception() is not None):
        _entries.pop(key, None)
        entry = None
    if entry is None:
        _forget_old()
        entry = _Entry(asyncio.ensure_future(factory()))
        _entries[key] = entry
    try:
        return await asyncio.wait_for(asyncio.shield(entry.task), timeout=wait)
    except asyncio.TimeoutError:
        raise Pending()
    except BaseException:
        if entry.task.done():
            _entries.pop(key, None)
        raise


def reset() -> None:
    """For tests."""
    for e in _entries.values():
        e.task.cancel()
    _entries.clear()
