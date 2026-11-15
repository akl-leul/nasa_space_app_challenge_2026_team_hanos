# Deployment (Vercel + Render)

HANOS runs as two parts behind one address, `https://hanos.surf`:

```
Browser ── https://hanos.surf ──► Vercel (the website, Next.js)
                                     └─ /api/*  ──►  Render web service "hanos-api" (science API, Docker)
                                                        └─ Render persistent disk at /data (SQLite cache)
```

- **Website → Vercel.** Built with `npm run build`. The rewrite in `next.config.ts` forwards `/api/*` to the API, so the
  browser only talks to `hanos.surf` (no CORS, no second domain). The security headers (including the
  Content-Security-Policy) come from `deploy/security-headers.json` and apply to production builds only.
- **Science API → Render.** The FastAPI service in `services/api/`, built from `services/api/Dockerfile` and described by
  `render.yaml`. It needs a long-running process, a persistent disk and a few hundred MB of scientific libraries (astropy,
  scipy, reproject), which is why it cannot run as Vercel functions.
- **Cache → the Render disk** mounted at `/data`. It holds the real archive results (SQLite file, cutouts, cubes), so a new
  version of the API starts with everything the previous one stored.

> **What has and has not been verified.** The website build, the production headers, the API tests (offline) and the
> start-up of the API were run locally. Vercel and Render themselves were **not** run from the development machine, so follow
> the checklist at the end of this file on the first deployment.

## Things that must stay true

| Rule | Why |
|---|---|
| One API instance (`numInstances: 1`) and one uvicorn worker. | Tracking jobs, long-job results and the rate limiter live in process memory; the cache is one SQLite file. A Render service with a disk cannot scale out anyway. |
| A paid Render instance with a disk. | The free plan has no persistent disk and sleeps, so every cold start would lose the cache and the demo would be slow. `render.yaml` uses 2 GB of memory; a smaller plan can run out of memory on a stack. |
| `API_BASE_URL` is set in Vercel **before** the first build. | Next.js bakes the rewrite in at build time. The build stops with a clear message on Vercel if it is missing. |
| No mock or sample data is ever added to make a page look full. | Project rule. An empty or slow answer is shown as it is. |

Brief downtime during an API deploy is normal on Render for a service with a disk (the old instance stops before the new one
starts). The website shows "the archive is busy" and retries; stored results are not lost.

## Long requests

Some real archive reads take longer than a web request should last (the first read of a sky position in the All-Sky Cube takes
up to about a minute, a per-detector stack longer). The API therefore never holds a request that long:

1. The first call starts the work as a background task and waits up to 25 s.
2. If the answer is not ready it replies **202** `{"status":"running"}` with `Retry-After`.
3. The website repeats the same call (`src/lib/api/poll.ts`); the repeated call is answered from the finished task.

This applies to `/api/spectrum?source=allsky` and `/api/stack`. `/api/track` and the per-exposure spectrum are polled jobs.
A failure is reported once and never cached, so the next call retries. Keeping every request under about 25 s also keeps
it inside Vercel's proxy limits.

## One-time setup

### 1. The API on Render

1. Push the repository to GitHub (branch `main`).
2. Render dashboard, **New, Blueprint**, choose the repository. Render reads `render.yaml` and creates `hanos-api` with a
   20 GB disk at `/data`. Check the plan (`standard`, 2 GB) and the region; change them in `render.yaml` if you prefer.
3. Wait for the first deploy to finish. Then open `https://<service>.onrender.com/api/healthz`: it must answer
   `{"status":"ok"}`. Note this address.

### 2. The website on Vercel

1. Vercel dashboard, **Add New, Project**, import the same repository. Root Directory `./`, Application Preset **Next.js**.
   `vercel.json` pins the framework. If Vercel still offers "Multiple applications detected" (it notices `services/api` and
   `render.yaml`), import it as a standalone Next.js project and **do not** use the Services option: the API is deployed on
   Render, not on Vercel.
2. Environment variables (Production, and Preview if you want previews to work):

   | Name | Value |
   |---|---|
   | `API_BASE_URL` | `https://<service>.onrender.com` (the address from step 1, no trailing slash) |
   | `NEXT_PUBLIC_SITE_URL` | `https://hanos.surf` |

3. Deploy. A push to `main` now deploys both services automatically (Vercel and Render each watch the branch).

### 3. Domain

In the Vercel project, *Settings, Domains*: add `hanos.surf` and `www.hanos.surf` and create the DNS records Vercel shows.
Vercel issues and renews the certificate. `public/robots.txt`, `public/sitemap.xml`, the canonical URLs and the share links
already use `https://hanos.surf`.

### 4. Fill the cache (the five required targets)

The live demo must not depend on network speed, so pre-compute the real results once after the first deployment (and again
after a cache wipe). It downloads and measures real frames and can take a long time. In the Render dashboard open the
service, **Shell**, and run:

```bash
/app/services/api/entrypoint.sh python scripts/prewarm_targets.py
# then the table that docs/01-project/test-matrix.md is built from:
/app/services/api/entrypoint.sh python scripts/build_test_matrix.py
```

The entrypoint makes the disk writable and runs the command as the same unprivileged user as the API, so the files it writes
are the ones the API reads. Pass target names or `--detectors 4,1,2,3,5,6` to limit the work. Results survive new versions.

## Settings reference

API (environment variables on the Render service; `render.yaml` already sets the production values):

| Variable | Default | Meaning |
|---|---|---|
| `HANOS_ENV` | `production` | `development` turns on `/api/docs` and the local CORS origins. |
| `HANOS_CACHE_DIR` | `services/api/cache` | Where the cache lives. `/data` in the container. |
| `HANOS_SQLITE_WAL` | `1` | Keep `1` on a local disk (Render). Set `0` only if the cache is on a network share. |
| `HANOS_CORS_ORIGINS` | empty | Comma separated origins, only if another site calls the API directly. |
| `HANOS_RATE_PER_MIN` / `HANOS_HEAVY_PER_MIN` | `240` / `40` | Requests per minute per client (ordinary / archive-reading endpoints). |
| `HANOS_MAX_JOBS` | `4` | Tracking jobs running at once; more are refused with 503 and `Retry-After`. |
| `HANOS_LOG_LEVEL` | `INFO` | |
| `PORT` | `8000` | Set by Render; the container listens on it. |

Website (Vercel environment variables): `API_BASE_URL` (required on Vercel), `NEXT_PUBLIC_SITE_URL` (default `https://hanos.surf`).

The rate limiter identifies a visitor by the first address in `X-Forwarded-For`. Vercel sets that header to the visitor's
address when it forwards `/api/*`; check in the Render logs (`ip=` on each request line) that you see visitor addresses and
not a single Vercel address, because otherwise all visitors would share one allowance.

## Everyday operations

| Task | How |
|---|---|
| Release | Merge to `main`. CI runs on the pull request; Vercel and Render deploy from `main`. |
| Roll back the website | Vercel, *Deployments*, pick an earlier one, **Promote to Production**. |
| Roll back the API | Render, *Events* (or *Deploys*), **Rollback** to an earlier deploy. |
| Liveness | `GET /api/healthz` (answers at once; Render uses it as the health check). `GET /api/health` makes live archive requests, so it is slower and is not a probe. |
| Logs | Render, *Logs*. Each request line has a request id that is also returned as the `X-Request-Id` header. |
| Wipe the cache | Render Shell: `rm -rf /data/*`, restart the service, then run step 4 again. |

## Checklist for the first deployment

- [ ] `https://hanos.surf/` loads, the hero and the three fonts render, SKY MAP opens `/explore`.
- [ ] `https://hanos.surf/api/healthz` returns `{"status":"ok"}` (this proves the Vercel rewrite reaches Render).
- [ ] `https://hanos.surf/api/health` shows the archives reachable.
- [ ] In `/explore`: search "Barnard's Star", open Spectra (the first call may take a minute and shows progress, then the real spectrum).
- [ ] Browser console on `/`, `/challenge`, `/explore` has no Content-Security-Policy violations (sky dome, Cosmic Sound pop-up, share card).
- [ ] Share a card: the QR code and link point to `https://hanos.surf/...`.
- [ ] `robots.txt`, `sitemap.xml`, `manifest.webmanifest` answer and the social preview image loads.
- [ ] Render logs show visitor addresses in `ip=` (see the rate-limit note above).
- [ ] Step 4 finished and `docs/01-project/test-matrix.md` shows the five targets.
- [ ] The Render service shows exactly one instance, and after a restart the cached results are still there.
