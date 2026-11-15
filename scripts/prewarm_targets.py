"""Fill the cache with REAL results for the five required targets, so the pitch works if the network is slow.

For every target this runs the same code the API runs: SIMBAD resolution, the SPHEREx observation search,
the per-detector tracking jobs (downloads the real cutouts, measures every frame), the all-sky cube spectrum
and the Gaia / AllWISE overlays. Nothing synthetic is ever stored. A summary of what was really obtained is
written to services/api/cache/prewarm_status.json and is what docs/01-project/test-matrix.md is built from.

Run from the repository root:
    PYTHONPATH=. services/api/.venv/Scripts/python.exe scripts/prewarm_targets.py [target ...] [--detectors 1,2,3,4,5,6]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

from services.api.clients.allsky_cube import extract_spectrum
from services.api.clients.gaia import query_gaia_sources
from services.api.clients.http import UpstreamError
from services.api.clients.observations import get_observations
from services.api.clients.simbad import resolve_target
from services.api.clients.wise import query_wise_sources
from services.api.config import CACHE_DIR
from services.api.tracking import TrackParams, snapshot, start_job

TARGETS = ["Barnard's Star", "Epsilon Indi B", "WISE 0855", "RW Aurigae", "R Draconis"]
STATUS = CACHE_DIR / "prewarm_status.json"


def load() -> dict:
    return json.loads(STATUS.read_text()) if STATUS.exists() else {}


def save(data: dict) -> None:
    STATUS.write_text(json.dumps(data, indent=2))


async def step(label: str, coro):
    t = time.time()
    try:
        res = await coro
        print(f"  ok   {label} ({time.time() - t:.0f}s)", flush=True)
        return res, None
    except (UpstreamError, ValueError) as exc:
        print(f"  FAIL {label}: {exc}", flush=True)
        return None, str(exc)


async def run_target(name: str, detectors, state: dict) -> None:
    print(f"\n=== {name}", flush=True)
    rec = state.setdefault(name, {})
    res, err = await step("resolve (SIMBAD)", resolve_target(name, 2026.0))
    if not res:
        rec["resolve"] = {"ok": False, "error": err}
        return
    rec["resolve"] = {"ok": True, "name": res["name"], "ra_j2000": res["ra_j2000"], "dec_j2000": res["dec_j2000"],
                      "ra_2026": res["ra"], "dec_2026": res["dec"], "pmra": res["pmra_cosdec"], "pmdec": res["pmdec"],
                      "parallax": res["parallax"], "nasa_reference": res.get("nasa_reference")}
    ra, dec, pmra, pmdec = res["ra"], res["dec"], res["pmra_cosdec"] or 0.0, res["pmdec"] or 0.0

    obs, err = await step("observations (SIA2 + headers)", get_observations(ra, dec, 0.02, budget_s=180.0))
    if obs:
        rec["observations"] = {"ok": True, "count": obs["count"], "by_detector": obs["count_by_detector"],
                               "span_days": obs["span_days"], "collections": obs["collections"],
                               "first": obs["observations"][0]["date_utc"] if obs["observations"] else None,
                               "last": obs["observations"][-1]["date_utc"] if obs["observations"] else None}
    else:
        rec["observations"] = {"ok": False, "error": err}
    save(state)

    rec.setdefault("tracking", {})
    for d in detectors:
        p = TrackParams(ra=ra, dec=dec, size_deg=0.1, detector=d, pmra=pmra, pmdec=pmdec, pos_epoch=2026.0, name=name)
        job = start_job(p)
        t0 = time.time()
        while job.status in ("starting", "running"):
            await asyncio.sleep(10)
            print(f"    detector {d}: {job.done}/{job.total} frames (failed {job.failed}) {time.time() - t0:.0f}s", flush=True)
        s = snapshot(job, include_frames=False)
        rec["tracking"][str(d)] = {"status": s["status"], "error": s["error"], "frames": s["total"], "failed": s["failed"],
                                   "motion": {k: v for k, v in s["motion"].items() if k != "points"},
                                   "brightness_status": s["brightness"].get("status"),
                                   "claim_level": s["evidence_card"]["claim_level"], "elapsed_s": s["elapsed_s"]}
        print(f"  detector {d}: {s['status']} frames={s['total']} failed={s['failed']} claim={s['evidence_card']['claim_level']}", flush=True)
        save(state)

    cube, err = await step("all-sky cube spectrum", extract_spectrum(ra, dec))
    rec["allsky_spectrum"] = ({"ok": True, "valid_channels": cube["valid_channels"], "tile": cube["tile"]["nested_index"]}
                              if cube else {"ok": False, "error": err})
    gaia, err = await step("Gaia DR3 sources", query_gaia_sources(ra, dec, 0.075, 2026.0, 500, 18.0))
    rec["gaia"] = {"ok": gaia is not None, "count": len(gaia) if gaia else 0, "error": err}
    wise, err = await step("AllWISE sources", query_wise_sources(ra, dec, 0.075, 200))
    rec["allwise"] = {"ok": wise is not None, "count": len(wise) if wise else 0, "error": err}
    rec["finished_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save(state)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="*", default=TARGETS)
    ap.add_argument("--detectors", default="1,2,3,4,5,6")
    a = ap.parse_args()
    dets = [int(x) for x in a.detectors.split(",")]
    state = load()
    for t in a.targets:
        await run_target(t, dets, state)
    print("\nDone. Summary written to", STATUS)


if __name__ == "__main__":
    asyncio.run(main())
