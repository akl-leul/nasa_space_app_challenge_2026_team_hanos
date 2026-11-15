"""Request protection for a public deployment: per-client rate limits and response headers.

The limiter is in memory. That is correct here because the API runs as ONE process (its tracking jobs and the SQLite
cache are single-process by design), so every request passes the same counters.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# endpoints that read an archive or run image processing: much more expensive than a lookup
HEAVY_PREFIXES = (
    "/api/track", "/api/spectrum", "/api/stack", "/api/difference", "/api/frame.png",
    "/api/observations", "/api/overlays", "/api/detectors", "/api/moving", "/api/context",
)
EXEMPT = ("/api/healthz",)


def client_ip(request: Request) -> str:
    """The caller's address. Behind the Vercel rewrite and Render's router it is the first X-Forwarded-For entry."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class SlidingWindow:
    """At most `limit` hits per `window` seconds for each key."""

    def __init__(self, limit: int, window: float = 60.0):
        self.limit = limit
        self.window = window
        self.hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._last_sweep = time.monotonic()

    def check(self, key: str, now: float | None = None) -> Tuple[bool, float]:
        """Returns (allowed, seconds until the next hit would be allowed)."""
        now = time.monotonic() if now is None else now
        q = self.hits[key]
        while q and now - q[0] >= self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False, max(0.0, self.window - (now - q[0]))
        q.append(now)
        if now - self._last_sweep > 300:  # forget clients that went quiet, so the table cannot grow forever
            self._last_sweep = now
            for k in [k for k, v in self.hits.items() if not v or now - v[-1] >= self.window]:
                self.hits.pop(k, None)
        return True, 0.0


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, per_minute: int, heavy_per_minute: int):
        super().__init__(app)
        self.normal = SlidingWindow(per_minute)
        self.heavy = SlidingWindow(heavy_per_minute)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in EXEMPT or request.method == "OPTIONS":
            return await call_next(request)
        ip = client_ip(request)
        limiter = self.heavy if path.startswith(HEAVY_PREFIXES) else self.normal
        ok, wait = limiter.check(ip)
        if not ok:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(int(wait) + 1)},
                content={"detail": "Too many requests. Wait a moment and try again."},
            )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Headers every API answer carries. JSON is never cached by a shared cache; images are cached briefly."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        if "cache-control" not in response.headers:
            ctype = response.headers.get("content-type", "")
            response.headers["Cache-Control"] = "public, max-age=3600" if ctype.startswith("image/") else "no-store"
        return response
