"""Production behaviour: liveness, headers, rate limits, job caps, CORS defaults, no docs in production. Offline."""

import pytest
from fastapi.testclient import TestClient

from services.api import tracking
from services.api.main import app
from services.api.security import SlidingWindow, client_ip

client = TestClient(app)


def test_liveness_answers_without_touching_any_archive():
    r = client.get("/api/healthz")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_every_answer_carries_security_headers_and_a_request_id():
    r = client.get("/api/healthz")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["cache-control"] == "no-store"
    assert len(r.headers["x-request-id"]) == 12


def test_the_interactive_docs_are_not_public_in_production():
    assert client.get("/api/docs").status_code == 404
    assert client.get("/api/openapi.json").status_code == 404


def test_cors_is_closed_by_default_in_production():
    r = client.get("/api/healthz", headers={"Origin": "https://example.org"})
    assert "access-control-allow-origin" not in r.headers


def test_invalid_input_is_a_400_not_a_crash():
    r = client.get("/api/observations", params={"ra": 10, "dec": 95})
    assert r.status_code == 400


def test_sliding_window_blocks_the_next_hit_and_recovers():
    w = SlidingWindow(limit=3, window=60)
    assert [w.check("a", now=t)[0] for t in (0, 1, 2)] == [True, True, True]
    ok, wait = w.check("a", now=3)
    assert ok is False and 56 < wait <= 57
    assert w.check("b", now=3)[0] is True  # another client is not affected
    assert w.check("a", now=61)[0] is True  # the first hit has left the window


def test_client_address_comes_from_the_forwarded_header_behind_a_proxy():
    class R:
        headers = {"x-forwarded-for": "203.0.113.7, 10.0.0.2"}
        client = None

    assert client_ip(R()) == "203.0.113.7"


def test_the_rate_limit_answers_429_with_retry_after():
    from services.api.security import RateLimitMiddleware
    from fastapi import FastAPI

    tiny = FastAPI()
    tiny.add_middleware(RateLimitMiddleware, per_minute=2, heavy_per_minute=1)

    @tiny.get("/api/ping")
    async def ping():
        return {"ok": True}

    @tiny.get("/api/spectrum")
    async def heavy():
        return {"ok": True}

    c = TestClient(tiny)
    assert c.get("/api/ping").status_code == 200
    assert c.get("/api/ping").status_code == 200
    blocked = c.get("/api/ping")
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) >= 1
    assert c.get("/api/spectrum").status_code == 200
    assert c.get("/api/spectrum").status_code == 429  # the expensive group has its own, smaller allowance


def test_too_many_running_measurements_are_refused_not_queued(monkeypatch):
    monkeypatch.setattr(tracking, "MAX_RUNNING_JOBS", 0)
    p = tracking.TrackParams(ra=10.0, dec=10.0, size_deg=0.1, detector=1)
    with pytest.raises(tracking.TooBusy):
        tracking.start_job(p)


def test_finished_jobs_are_forgotten_so_memory_cannot_grow_forever(monkeypatch):
    monkeypatch.setattr(tracking, "MAX_STORED_JOBS", 10)
    tracking._jobs.clear()
    for i in range(10):
        j = tracking.TrackJob(params=tracking.TrackParams(ra=float(i), dec=0.0, size_deg=0.1, detector=1), id=f"k{i}")
        j.status, j.finished = "done", float(i)
        tracking._jobs[j.id] = j
    tracking._evict_old_jobs()
    assert len(tracking._jobs) < 10
    assert "k0" not in tracking._jobs  # the oldest finished job went first
    tracking._jobs.clear()


def test_a_visitor_opening_many_regions_is_queued_not_refused(monkeypatch):
    """Six detectors for the per-exposure spectrum plus several hovered regions must all start (the old cap of 4 refused them)."""
    import asyncio

    async def go():
        async def idle(job):  # the real work needs the archives; only the admission rule is under test
            await asyncio.sleep(0)
            job.status = "done"

        monkeypatch.setattr(tracking, "_run", idle)
        tracking._jobs.clear()
        for i in range(12):
            tracking.start_job(tracking.TrackParams(ra=float(i), dec=1.0, size_deg=0.1, detector=1 + i % 6))
        assert len(tracking._jobs) == 12
        await asyncio.sleep(0.05)

    asyncio.run(go())
    tracking._jobs.clear()


def test_frame_downloads_share_a_bounded_pool(monkeypatch):
    import asyncio

    monkeypatch.setattr(tracking, "FRAME_SLOTS", 3)
    tracking._slots.clear()

    async def go():
        active = peak = 0

        async def one():
            nonlocal active, peak
            async with tracking._frame_slots():
                active += 1
                peak = max(peak, active)
                await asyncio.sleep(0.01)
                active -= 1

        await asyncio.gather(*(one() for _ in range(20)))
        return peak

    assert asyncio.run(go()) == 3
    tracking._slots.clear()


def test_measurement_polling_and_frame_images_use_the_ordinary_allowance():
    from services.api.security import HEAVY_PREFIXES

    assert not "/api/track".startswith(HEAVY_PREFIXES)
    assert not "/api/frame.png".startswith(HEAVY_PREFIXES)
    assert "/api/spectrum".startswith(HEAVY_PREFIXES)
