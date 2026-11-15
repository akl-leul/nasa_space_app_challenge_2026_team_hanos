# HANOS science API (`services/api/`)

FastAPI service that turns **real SPHEREx data** from NASA/IPAC IRSA into what the explorer shows: observation lists with true per-frame wavelength, aligned frames, measured positions and fluxes, motion and brightness tests, spectra, stacks, differences and catalogue overlays. Nothing is mocked, simulated or defaulted: when an archive cannot answer, the API says so (HTTP 503 "archive is busy") and the last real result is used if one was stored.

## Run

Python 3.11+ (tested with 3.13 on Windows). From the repository root:

```powershell
uv venv services/api/.venv
uv pip install -r services/api/requirements.txt --python services/api/.venv
$env:PYTHONPATH="."
services\api\.venv\Scripts\python.exe -m uvicorn services.api.main:app --host 127.0.0.1 --port 8000
```

```bash
uv venv services/api/.venv && uv pip install -r services/api/requirements.txt --python services/api/.venv
PYTHONPATH=. services/api/.venv/bin/python -m uvicorn services.api.main:app --host 127.0.0.1 --port 8000
```

`npm run dev:all` starts the API and Next.js together. Next.js proxies `/api/*` to `API_BASE_URL` (default `http://127.0.0.1:8000`).

## Production

Container: `docker build -f services/api/Dockerfile -t hanos-api .` from the repository root, then `docker run -p 8000:8000 -v hanos-cache:/data hanos-api`. It runs as a non-root user, one uvicorn worker, with `HANOS_ENV=production` (no `/api/docs`, CORS closed, generic 500 messages, security headers, per-client rate limits, a request id on every answer). Liveness is `GET /api/healthz` (touches no archive). Run **one instance only**: jobs and the rate limiter are in memory and the cache is one SQLite file. Settings are environment variables (`HANOS_*`, listed at the top of `config.py`). It is deployed on Render from `render.yaml`; the full procedure is in `docs/DEPLOYMENT.md`. The container starts as root only to make the mounted disk writable, then runs as an unprivileged user (`entrypoint.sh`); it listens on `$PORT` (8000 if unset).

Slow reads (`/api/spectrum?source=allsky`, `/api/stack`) run as background tasks (`longjobs.py`): a call waits up to 25 s, otherwise answers **202** `{"status":"running"}` with `Retry-After`; the same call repeated returns the finished real result.

Tests: `PYTHONPATH=. python -m pytest services/api/tests -m "not live"` (offline, uses real bytes saved in `tests/fixtures`), and `-m live` for the tests that call the public archives.

## Endpoints

| Endpoint | What it returns |
|---|---|
| `GET /api/health` | Live probes of every archive (IRSA SIA2, S3 mirror, HiPS, SIMBAD, Gaia, IRSA TAP, CADC, SkyView) and cache statistics. Nothing is reported "verified" without a request. |
| `GET /api/releases` | SPHEREx collections discovered from IRSA (`Irsa.list_collections`), release labels, the DR1 DOIs, the required acknowledgement text and the release timeline. |
| `GET /api/resolve?name=` | SIMBAD (runtime) coordinates with proper motion, propagated to an epoch; typed RA/Dec are parsed. WISE 0855: NASA's published position is only a cross-check, its epoch is derived. |
| `GET /api/observations?ra&dec&radius&detector&deep` | Real SPHEREx frames whose footprint touches the position (SIA2 on `spherex_dr1`, `spherex_qr3`, ...), time ordered, each with true wavelength at the target, date, pixel position and flag counts (from two small range reads of the real file). |
| `GET /api/track?ra&dec&size&detector&pmra&pmdec` | Background job: every frame of one detector is downloaded, aligned, measured (flux, centroid), checked against Gaia reference stars; returns the per-frame list, a motion fit, a brightness test, a light curve and an Evidence Card. Poll until `status` is `done`. |
| `GET /api/frame.png?url&ra&dec&size` | One real frame on the common sky grid (north up, east left) with a documented asinh stretch. |
| `GET /api/spectrum?ra&dec&source=allsky\|exposures` | `allsky`: the 102-channel quick-look spectrum read with range requests from the DR1 All-Sky Cube plus AllWISE W1/W2 as an independent check. `exposures`: one point per real frame, all six detectors, dates kept. |
| `GET /api/stack?detector&...` | Per-detector stack over a time window (never mixes detectors); optional shift-and-add that follows the proper motion. |
| `GET /api/difference?a&b&...` | A-B, B-A or A+B of two aligned frames, with a wavelength-match warning. |
| `GET /api/overlays?ra&dec&size&epoch` | Gaia DR3 (proper motion propagated) and AllWISE sources with pixel positions on the frame grid. |
| `GET /api/detectors?ra&dec` | Which of the six detector arrays have frames at the position, with the wavelengths and dates actually observed. |
| `GET /api/moving?name=` | IRSA MOST: real SPHEREx frames that contain a named asteroid, comet or planet, with its predicted position in each. |
| `GET /api/context/dss.png`, `/dss`, `/neossat`, `/ssois` | Optional context from other missions (DSS2 via SkyView, NEOSSat via CADC TAP) and the SSOIS link. Never SPHEREx data. |

## How the data is handled (and why)

* **Observation search uses SIA2**, not TAP. TAP took 20 s to more than 2 minutes in testing. The first version of this service swallowed the timeout, returned an empty list and cached it, which is why every target once looked like it had "no observations". Failures are now raised, never cached, and retried with backoff. IRSA answers HTTP 502/503 intermittently.
* **Per-frame metadata costs about 70 KB**, not 65 MB: the first 64 KB (headers: detector, dates, WCS, flag counts) and the last 8 KB (the WCS-WAVE lookup table) of each file are range-read from `nasa-irsa-spherex.s3.amazonaws.com`. The wavelength at the target is interpolated from that table; it was checked against the cutout's own spectral WCS (1.09145 vs 1.09145 micron).
* **Cutouts** come from IRSA's cutout service (`?center=RA,Dec&size=DEG`). Each is about 4 MB because it carries the full 441-zone ePSF table (3.84 MB); we keep IMAGE, FLAGS, VARIANCE, ZODI, a per-pixel wavelength map, the full header and the single ePSF zone that applies, about 45 KB.
* **Flags:** bit names come from each file's header. Bit 21 (SOURCE) is never masked. Photometry uses a strict mask; the centroid and the viewer use a relaxed mask so saturated bright stars (Barnard's Star) can still be located; their flux is reported as a lower limit.
* **Photometry:** aperture (2 px) minus an annulus background, the pixel solid angle from the WCS, `uJy = MJy/sr x arcsec^2 x 23.5045`, corrected with the ePSF enclosed fraction; errors from VARIANCE and the annulus scatter. No nominal error is ever assumed.
* **Motion:** each frame's measured centroid is compared with the proper-motion prediction and corrected with the median shift of Gaia reference stars, then a weighted straight line is fitted. If the target is detected in too few frames, the result is `not_detected` rather than a motion.
* **Brightness change** is tested only among frames of nearly the same wavelength, so the spectrum is not mistaken for variability.
* **All-sky cube spectrum:** the cube is stacked and has no time information. Channels 51 and 52 are blank. A channel is reported only if the target pixel has data in that channel.

## Cache

`services/api/cache/` (SQLite plus compact `.npz` cutouts), git-ignored. Only valid archive answers are stored. A schema version removes results produced by older code. `scripts/prewarm_targets.py` fills it with the real results for the five required targets; `scripts/build_test_matrix.py` turns that into `docs/01-project/test-matrix.md`.

## Credits

SPHEREx data: NASA/IPAC IRSA (DOIs 10.26131/IRSA678 spectral images, 10.26131/IRSA679 all-sky cube). Gaia DR3: ESA. WISE/AllWISE: NASA/IPAC IRSA. SIMBAD: CDS. DSS: STScI/Caltech/AAO via NASA SkyView. NEOSSat: CSA/CADC. See `docs/01-project/data-credits.md`.

## Operating notes (learned the hard way)

- **Run the API without `--reload` on Windows.** The reloader leaves an orphan process holding port 8000. `npm run dev:all` is for development; for a demo start `python -m uvicorn services.api.main:app --host 127.0.0.1 --port 8000`.
- **SQLite runs in WAL mode** (set in `cache.py`; `HANOS_SQLITE_WAL=0` switches to the rollback journal for network shares, where WAL is not safe; keep it on for a local disk such as Render's). Without it the pre-compute script (`scripts/prewarm_targets.py`, a second process) could lock the database and freeze every request that touched the cache.
- **AllWISE uses IRSA Gator, not TAP** (see `clients/wise.py`): same catalogue, about 3 s instead of more than 100 s.
- **The Next.js `/api` rewrite proxy is cut off after 30 s by default.** `next.config.ts` raises `experimental.proxyTimeout` to 180 s, because the first all-sky cube tile or a stack can take longer.
- **Claims are gated on real detections.** Peaks at S/N >= 5 that do not follow a well known fast motion are reported as "not reliably detected" (WISE 0855 on detectors 1 to 3 is the example), and the brightness test only uses S/N >= 5 frames. Tests: `tests/test_science_core.py`.
