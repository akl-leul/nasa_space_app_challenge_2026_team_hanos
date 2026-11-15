#!/bin/sh
# Starts as root only to make the cache disk writable (a freshly mounted disk belongs to root), then drops to the
# unprivileged "hanos" user (uid 10001) for everything that follows, including a command given on the command line:
#
#   /app/services/api/entrypoint.sh python scripts/prewarm_targets.py
set -e

CACHE="${HANOS_CACHE_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$CACHE"
  chown hanos:hanos "$CACHE"
  # only what is not already ours, so a restart with a large cache stays fast
  find "$CACHE" ! -user hanos -exec chown hanos:hanos {} + 2>/dev/null || true
  # setpriv does not change HOME, and astropy / astroquery write their config and cache under it
  export HOME=/home/hanos
  exec setpriv --reuid=10001 --regid=10001 --init-groups "$@"
fi

exec "$@"
