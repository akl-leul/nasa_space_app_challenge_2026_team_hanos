"""Resilient HTTP helper shared by every archive client.

Rules enforced here (they exist because the first version of this service silently
turned archive timeouts and 502s into empty results and then cached them):

* Transient failures (timeouts, connection errors, HTTP 429/5xx, HTML error pages
  served with status 200) are retried with exponential backoff and jitter.
* After the last retry an ``UpstreamError`` is raised. Callers must never convert it
  into an empty result and must never cache it.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any, Callable, Dict, Optional

import httpx

USER_AGENT = "HANOS-SpaceApps/1.0 (NASA Space Apps 2026 challenge prototype)"
RETRY_STATUS = {408, 425, 429, 500, 502, 503, 504}


class UpstreamError(RuntimeError):
    """An archive could not give a valid answer after all retries."""

    def __init__(self, message: str, *, status: Optional[int] = None, url: str = ""):
        super().__init__(message)
        self.status = status
        self.url = url


_client: Optional[httpx.AsyncClient] = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
            limits=httpx.Limits(max_connections=24, max_keepalive_connections=12),
        )
    return _client


def looks_like_html_error(resp: httpx.Response) -> bool:
    head = resp.content[:200].lstrip().lower()
    return head.startswith((b"<!doctype html", b"<html", b"<!doctype"))


async def fetch(
    url: str,
    *,
    method: str = "GET",
    params: Optional[Dict[str, Any]] = None,
    data: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: float = 90.0,
    tries: int = 5,
    ok_status: tuple = (200,),
    validate: Optional[Callable[[httpx.Response], bool]] = None,
    allow_html: bool = False,
) -> httpx.Response:
    """GET/POST with retries. Raises UpstreamError when no valid answer arrives."""
    client = get_client()
    last = "no attempt made"
    status: Optional[int] = None
    for attempt in range(tries):
        try:
            resp = await client.request(
                method, url, params=params, data=data, headers=headers, timeout=timeout
            )
            status = resp.status_code
            if resp.status_code in ok_status:
                if not allow_html and looks_like_html_error(resp):
                    last = f"HTML error page served with HTTP {resp.status_code}"
                elif validate is not None and not validate(resp):
                    last = "response failed validation"
                else:
                    return resp
            elif resp.status_code in RETRY_STATUS:
                last = f"HTTP {resp.status_code}"
            else:
                # Non-transient (404, 400, ...): do not hammer the archive.
                raise UpstreamError(
                    f"HTTP {resp.status_code} from archive", status=resp.status_code, url=url
                )
        except UpstreamError:
            raise
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last = f"{type(exc).__name__}: {exc}"
        if attempt < tries - 1:
            await asyncio.sleep(min(20.0, (2.0**attempt) * 1.0) + random.uniform(0, 0.8))
    raise UpstreamError(f"Archive did not answer after {tries} tries ({last})", status=status, url=url)
