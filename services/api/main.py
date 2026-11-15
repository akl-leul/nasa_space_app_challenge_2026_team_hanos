import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .clients.http import UpstreamError
from .config import CORS_ORIGINS, HEAVY_PER_MIN, IS_DEVELOPMENT, LOG_LEVEL, RATE_PER_MIN
from .routers import (
    context,
    detectors,
    difference,
    frame,
    health,
    moving,
    observations,
    overlays,
    releases,
    resolve,
    spectrum,
    stack,
    track,
)
from .security import RateLimitMiddleware, SecurityHeadersMiddleware, client_ip
from .longjobs import Pending
from .tracking import TooBusy

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("hanos.api")

app = FastAPI(
    title="HANOS SPHEREx Scientific Analysis API",
    description="Real SPHEREx data from NASA/IPAC IRSA: observations, frames, tracking, spectra, overlays.",
    version="2.0.0",
    # the interactive docs are for developers; a public deployment does not expose them
    docs_url="/api/docs" if IS_DEVELOPMENT else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if IS_DEVELOPMENT else None,
)

# Outermost last: security headers wrap everything, then the rate limit, then CORS (only if origins were configured).
if CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])
app.add_middleware(RateLimitMiddleware, per_minute=RATE_PER_MIN, heavy_per_minute=HEAVY_PER_MIN)
app.add_middleware(SecurityHeadersMiddleware)


@app.middleware("http")
async def access_log(request: Request, call_next):
    started = time.perf_counter()
    rid = uuid.uuid4().hex[:12]
    response = await call_next(request)
    response.headers["X-Request-Id"] = rid
    if request.url.path != "/api/healthz":
        log.info("%s %s %s %s %.0fms ip=%s", rid, request.method, request.url.path, response.status_code,
                 (time.perf_counter() - started) * 1000, client_ip(request))
    return response


@app.get("/api/healthz", tags=["health"], include_in_schema=False)
async def healthz():
    """Liveness for the platform: answers at once and touches no archive. (/api/health makes live archive requests.)"""
    return {"status": "ok"}


@app.exception_handler(UpstreamError)
async def upstream_error(_: Request, exc: UpstreamError):
    return JSONResponse(status_code=503, content={"detail": f"An archive is busy: {exc}. Retry in a moment."})


@app.exception_handler(TooBusy)
async def too_busy(_: Request, exc: TooBusy):
    return JSONResponse(status_code=503, headers={"Retry-After": "15"},
                        content={"detail": "The measurement service is busy. Retry in a few seconds."})


@app.exception_handler(Pending)
async def pending(_: Request, exc: Pending):
    # still working: nothing is invented meanwhile; the same request, repeated, is answered from the finished task
    return JSONResponse(status_code=202, headers={"Retry-After": str(exc.retry_after)},
                        content={"status": "running", "retry_after_s": exc.retry_after})


@app.exception_handler(Exception)
async def unexpected(request: Request, exc: Exception):
    # the cause goes to the log with the request id; the caller only learns that it was not their mistake
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Retry in a moment."})


for r in (health, releases, resolve, observations, frame, track, spectrum, stack, difference, overlays,
          detectors, moving, context):
    app.include_router(r.router)

if __name__ == "__main__":
    import uvicorn

    import os

    uvicorn.run("services.api.main:app", host=os.environ.get("HANOS_HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8000")), reload=False)
