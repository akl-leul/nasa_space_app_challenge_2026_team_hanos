"""Settings. Everything that differs between a laptop and production comes from environment variables.

HANOS_ENV            "production" (default) or "development". Development turns on the API docs and the local CORS origins.
HANOS_CACHE_DIR      Where the SQLite cache and the cutouts live. In production this is a persistent disk.
HANOS_CORS_ORIGINS   Comma separated origins allowed to call the API from a browser. Empty (default in production) means
                     same origin only, which is how the site calls it (through its own /api address).
HANOS_SQLITE_WAL     1 (default) uses the SQLite write-ahead log. Set 0 only when HANOS_CACHE_DIR is on a network share.
HANOS_RATE_PER_MIN   Requests per minute per client for ordinary endpoints (default 1200).
HANOS_HEAVY_PER_MIN  Requests per minute per client for the endpoints that start archive reads (default 300).
HANOS_MAX_JOBS       Tracking jobs allowed to run at once (default 32); beyond it new ones get 503 + Retry-After.
HANOS_FRAME_SLOTS    Frames downloaded and measured at once across all jobs (default 10); the rest queue.
HANOS_HIPS_FOLDER    Folder of the All-Sky Cube under dr1/hips5_cube/ on IRSA.
HANOS_LOG_LEVEL      INFO (default), DEBUG, WARNING.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, default)))
    except ValueError:
        return default


ENV = os.environ.get("HANOS_ENV", "production").strip().lower()
IS_DEVELOPMENT = ENV == "development"

CACHE_DIR = Path(os.environ.get("HANOS_CACHE_DIR") or (BASE_DIR / "cache")).expanduser().resolve()
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CUTOUTS_DIR = CACHE_DIR / "cutouts"
CUTOUTS_DIR.mkdir(exist_ok=True)
CUBES_DIR = CACHE_DIR / "cubes"
CUBES_DIR.mkdir(exist_ok=True)
DB_PATH = CACHE_DIR / "hanos_cache.db"

_cors = [o.strip().rstrip("/") for o in os.environ.get("HANOS_CORS_ORIGINS", "").split(",") if o.strip()]
# Only in development, and only when nothing was set, the local site is allowed to call the API directly.
CORS_ORIGINS = _cors or (["http://localhost:3000", "http://127.0.0.1:3000"] if IS_DEVELOPMENT else [])

# SQLite write-ahead log: on for a local disk, off (0) when the cache lives on a network share.
SQLITE_WAL = os.environ.get("HANOS_SQLITE_WAL", "1").strip().lower() not in ("0", "false", "no", "off")

# Per client address. Generous on purpose: visitors at an event often share one Wi-Fi address, and one open region already polls
# its measurement about 24 times a minute.
RATE_PER_MIN = _int("HANOS_RATE_PER_MIN", 1200)
HEAVY_PER_MIN = _int("HANOS_HEAVY_PER_MIN", 300)
# Measurements (one per region or detector the visitor opens) run at the same time; the explorer starts one per region and
# the per-exposure spectrum starts six. This is a memory and abuse guard, not a throttle: the real throttle is FRAME_SLOTS.
MAX_RUNNING_JOBS = _int("HANOS_MAX_JOBS", 32)
# Frame downloads and measurements allowed at once across ALL jobs; further frames wait their turn.
FRAME_SLOTS = _int("HANOS_FRAME_SLOTS", 10)
LOG_LEVEL = os.environ.get("HANOS_LOG_LEVEL", "INFO").upper()

# IRSA Endpoints
IRSA_BASE = "https://irsa.ipac.caltech.edu"
IRSA_SIA2_URL = f"{IRSA_BASE}/SIA"
IRSA_TAP_URL = f"{IRSA_BASE}/TAP/sync"
IRSA_HIPS_PROPERTIES = f"{IRSA_BASE}/data/hips/SPHEREx/spherex_allsky_cube/properties"
IRSA_MOST_URL = f"{IRSA_BASE}/cgi-bin/MOST/nph-most"

# S3 Anonymous Bucket
S3_SPHEREX_BASE = "https://nasa-irsa-spherex.s3.amazonaws.com"

# SIMBAD Endpoints
SIMBAD_HARVARD_TAP = "https://simbad.cfa.harvard.edu/simbad/sim-tap/sync"
SIMBAD_STRASBOURG_SESAME = "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV"

# Gaia & External
GAIA_TAP_URL = "https://gea.esac.esa.int/tap-server/tap/sync"
CADC_TAP_URL = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync"
SKYVIEW_BASE = "https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl"

# SPHEREx Constants
PIXEL_SCALE_ARCSEC = 6.15  # Arcseconds per native pixel
DEFAULT_CUTOUT_SIZE_DEG = 0.02  # ~1.2 arcminutes (approx 12 SPHEREx pixels)
MAX_CUTOUT_SIZE_DEG = 0.2

# Conversions
MJY_SR_TO_UJY_FACTOR = 23.5045  # uJy = MJy/sr * 23.5045 * (solid_angle_arcsec2)

# All-Sky Cube folder under .../dr1/hips5_cube/ (IRSA user guide and tutorials: hips_20261026). Override with HANOS_HIPS_FOLDER.
HIPS_CUBE_FOLDER = os.environ.get("HANOS_HIPS_FOLDER", "hips_20261026")

# Experimental, NOT yet validated against IRSA's cutouts: read frame pixels straight from the S3 mirror (clients/s3_cutout.py).
# Off by default; any failure falls back to the IRSA cutout service. Enable with HANOS_S3_CUTOUTS=1 only after comparing results.
S3_CUTOUTS = os.environ.get("HANOS_S3_CUTOUTS", "0").strip().lower() in ("1", "true", "yes", "on")
