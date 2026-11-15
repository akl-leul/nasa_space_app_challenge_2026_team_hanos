# HANOS science API: one process, one cache disk.
#
# Build from the REPOSITORY ROOT:   docker build -f services/api/Dockerfile -t hanos-api .
# Run:                              docker run -p 8000:8000 -v hanos-cache:/data hanos-api
#
# It must run as a SINGLE instance (one replica, one worker): its tracking jobs live in memory and its cache is a
# SQLite file on /data. Mount a persistent disk at /data so a restart or a new version keeps the real archive results.
# The listening port is $PORT (Render sets it), 8000 when it is not set.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app \
    HANOS_ENV=production \
    HANOS_CACHE_DIR=/data

WORKDIR /app

RUN useradd --create-home --uid 10001 hanos \
    && mkdir -p /data \
    && chown hanos:hanos /data

COPY services/api/requirements.txt services/api/requirements.txt
RUN pip install -r services/api/requirements.txt

COPY services/api services/api
# the pre-compute command for the five required targets (see docs/DEPLOYMENT.md)
COPY scripts/prewarm_targets.py scripts/build_test_matrix.py scripts/
RUN chmod +x services/api/entrypoint.sh

EXPOSE 8000
VOLUME ["/data"]

# liveness only: answers at once and touches no archive
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import os, sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/api/healthz' % os.environ.get('PORT', '8000'), timeout=4).status == 200 else 1)"

# The entrypoint fixes the ownership of the mounted disk, then runs the command as the unprivileged user.
ENTRYPOINT ["/app/services/api/entrypoint.sh"]
CMD ["sh", "-c", "exec python -m uvicorn services.api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips '*' --no-server-header"]
