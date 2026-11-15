import math
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from ..astro.coordinates import propagate_proper_motion, validate_ra_dec
from ..astro.spectra import SPECTRAL_MARKERS
from ..clients.allsky_cube import extract_spectrum
from ..clients.http import UpstreamError
from ..clients.wise import query_wise_sources
from ..longjobs import run_or_pending
from ..tracking import TrackParams, snapshot, start_job

router = APIRouter(tags=["spectrum"])

# AllWISE magnitude -> flux density (Wright et al. 2010 / IPAC explanatory supplement zero points, Vega system)
WISE_BANDS = [("w1_mag", "w1_err", 3.3526, 309.540), ("w2_mag", "w2_err", 4.6028, 171.787),
              ("w3_mag", None, 11.5608, 31.674), ("w4_mag", None, 22.0883, 8.363)]


async def wise_reference(ra: float, dec: float, pmra: float, pmdec: float, epoch: float) -> Dict[str, Any]:
    """Independent AllWISE photometry of the nearest catalogue source to the target (mean epoch about 2010.5)."""
    ra10, dec10 = propagate_proper_motion(ra, dec, pmra, pmdec, epoch, 2010.5)
    try:
        srcs = await query_wise_sources(ra10, dec10, radius_deg=8.0 / 3600.0, max_rows=10)
    except UpstreamError as exc:
        return {"available": False, "reason": f"AllWISE did not answer: {exc}"}
    if not srcs:
        return {"available": False, "reason": "No AllWISE source within 8 arcsec of the position at epoch 2010.5"}
    cosd = math.cos(math.radians(dec10))
    best = min(srcs, key=lambda s: math.hypot((s["ra"] - ra10) * cosd, s["dec"] - dec10))
    pts = []
    for mkey, ekey, wl, zp in WISE_BANDS:
        m = best.get(mkey)
        if m is None:
            continue
        flux = zp * 10 ** (-0.4 * m) * 1e6  # uJy
        err = flux * 0.4 * math.log(10) * best[ekey] if ekey and best.get(ekey) is not None else None
        pts.append({"band": mkey[:2].upper(), "wavelength_um": wl, "flux_ujy": round(flux, 1),
                    "error_ujy": round(err, 1) if err is not None else None, "magnitude": m})
    return {"available": True, "designation": best["designation"], "epoch": 2010.5, "points": pts,
            "catalogue": "AllWISE (NASA/IPAC IRSA)",
            "note": "Independent cross-check from a different mission and epoch; the object may be variable."}


async def _allsky(ra_v: float, dec_v: float, pmra: float, pmdec: float, epoch: float) -> Dict[str, Any]:
    try:
        cube = dict(await extract_spectrum(ra_v, dec_v))
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"The SPHEREx archive is busy: {exc}")
    cube["warnings"] = list(cube.get("warnings", []))
    cube["reference_photometry"] = await wise_reference(ra_v, dec_v, pmra, pmdec, epoch)
    cube["markers"] = SPECTRAL_MARKERS
    motion = math.hypot(pmra, pmdec) / 1000.0
    if motion * 1.0 > 6.0:
        cube["warnings"].append(
            f"This object moves about {motion:.1f} arcsec per year, so over the survey it smears across "
            "several cube pixels; its stacked spectrum is unreliable. Use the per-exposure spectrum.")
    cube["valid_note"] = f"{cube['valid_channels']} of 102 channels have valid data at this position."
    return cube


@router.get("/api/spectrum")
async def spectrum(
    ra: float = Query(..., description="Position at `epoch`"),
    dec: float = Query(...),
    source: str = Query("allsky", pattern="^(allsky|exposures)$"),
    pmra: float = Query(0.0, description="mas/yr incl. cos(dec)"),
    pmdec: float = Query(0.0),
    epoch: float = Query(2026.0),
    size: float = Query(0.1, ge=0.04, le=0.3, description="Cutout size for source=exposures"),
):
    try:
        ra_v, dec_v = validate_ra_dec(ra, dec)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if source == "allsky":
        # The first read of a position can take about a minute, longer than a platform allows one request to last,
        # so it runs as a background task and a repeated call picks up the finished answer (202 while it runs).
        key = f"spectrum:{ra_v:.5f}:{dec_v:.5f}:{pmra}:{pmdec}:{epoch}"
        return await run_or_pending(key, lambda: _allsky(ra_v, dec_v, pmra, pmdec, epoch))

    # per-exposure spectrum: one real measurement per frame, all six detectors, dates preserved
    jobs = [start_job(TrackParams(ra=ra_v, dec=dec_v, size_deg=size, detector=d, pmra=pmra, pmdec=pmdec,
                                  pos_epoch=epoch)) for d in range(1, 7)]
    snaps = [snapshot(j, include_frames=True) for j in jobs]
    total = sum(s["total"] for s in snaps)
    done = sum(s["done"] for s in snaps)
    points: List[Dict[str, Any]] = []
    for s in snaps:
        for f in s["frames"]:
            m = f.get("measurement") or {}
            if f["status"] == "ok" and m.get("usable"):
                points.append({"wavelength_um": f["wavelength_um"], "detector": f["detector"], "date_utc": f["date_utc"],
                               "month_label": f["month_label"], "release": f["release"], "decimal_year": f["decimal_year"],
                               "flux_ujy": round(m["flux_ujy"], 2), "error_ujy": round(m["flux_error_ujy"], 2),
                               "detected": m["detected"], "is_lower_limit": m["flux_is_lower_limit"],
                               "upper_limit_3sigma_ujy": round(m["upper_limit_3sigma_ujy"], 2)})
    points.sort(key=lambda p: p["wavelength_um"])
    states = {s["status"] for s in snaps}
    status = "done" if states <= {"done"} else ("error" if "error" in states and not (states & {"running", "starting"}) else "running")
    return {
        "source": "exposures", "status": status, "frames_total": total, "frames_done": done,
        "detectors": {s["params"]["detector"]: {"status": s["status"], "done": s["done"], "total": s["total"],
                                                "error": s["error"]} for s in snaps},
        "points": points, "units": "uJy", "markers": SPECTRAL_MARKERS,
        "label": "single exposures: every point is one real frame with its own date",
        "warnings": ["Points come from exposures taken at different times; a source that varies can show scatter "
                     "that is not a real spectral feature.",
                     "Flux is an aperture flux corrected with the ePSF enclosed fraction; saturated stars are lower limits."],
        "reference_photometry": await wise_reference(ra_v, dec_v, pmra, pmdec, epoch),
    }
