"""Long archive reads run as background tasks: a slow answer is a 202, a repeated call gets the finished result."""

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.api import longjobs
from services.api.longjobs import Pending, run_or_pending


@pytest.fixture(autouse=True)
def _clean():
    longjobs.reset()
    yield
    longjobs.reset()


def test_a_quick_job_returns_its_result():
    async def go():
        async def work():
            return 42

        return await run_or_pending("k", work, wait=2)

    assert asyncio.run(go()) == 42


def test_a_slow_job_is_pending_then_finishes_and_runs_only_once():
    calls = {"n": 0}

    async def go():
        async def work():
            calls["n"] += 1
            await asyncio.sleep(0.3)
            return "done"

        with pytest.raises(Pending):
            await run_or_pending("slow", work, wait=0.05)
        # the same call again: the task kept running, it is not started a second time
        with pytest.raises(Pending):
            await run_or_pending("slow", work, wait=0.05)
        await asyncio.sleep(0.4)
        return await run_or_pending("slow", work, wait=1)

    assert asyncio.run(go()) == "done"
    assert calls["n"] == 1


def test_a_failure_is_raised_and_not_replayed():
    calls = {"n": 0}

    async def go():
        async def work():
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("archive down")
            return "ok"

        with pytest.raises(RuntimeError):
            await run_or_pending("f", work, wait=1)
        return await run_or_pending("f", work, wait=1)  # the next call tries again

    assert asyncio.run(go()) == "ok"


def test_pending_becomes_a_202_with_retry_after():
    from services.api.main import pending

    app = FastAPI()
    app.add_exception_handler(Pending, pending)

    @app.get("/slow")
    async def slow():
        raise Pending(4)

    r = TestClient(app).get("/slow")
    assert r.status_code == 202
    assert r.headers["retry-after"] == "4"
    assert r.json()["status"] == "running"
