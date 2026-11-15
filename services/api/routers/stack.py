import asyncio
from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Response

from ..astro.coordinates import propagate_proper_motion, validate_ra_dec
from ..astro.render import common_grid, render_png, reproject_frame, robust_stats, subtract_background
from ..clients.http import UpstreamError
from ..clients.irsa_cutout import get_cutout
from ..clients.observations import get_observations
from ..longjobs import run_or_pending

router = APIRouter(tags=["stack"])


def _stack(arrays, weights):
    acc = np.zeros_like(arrays[0], dtype=np.float64)
    wsum = np.zeros_like(acc)
    for a, w in zip(arrays, weights):
        ok = np.isfinite(a)
        acc[ok] += a[ok] * w
        wsum[ok] += w
    out = np.full(acc.shape, np.nan, dtype=np.float32)
    good = wsum > 0
    out[good] = (acc[good] / wsum[good]).astype(np.float32)
    return out


@router.get("/api/stack")
async def stack(
    ra: float = Query(...), dec: float = Query(...),
    size: float = Query(0.1, ge=0.04, le=0.3),
    detector: int = Query(..., ge=1, le=6, description="One detector array: detectors are never mixed"),
    from_year: Optional[float] = Query(None, description="Start of the time window (decimal year)"),
    to_year: Optional[float] = Query(None, description="End of the time window (decimal year)"),
    follow: bool = Query(False, description="Follow the proper motion (shift and add) instead of the fixed sky"),
    pmra: float = Query(0.0), pmdec: float = Query(0.0), epoch: float = Query(2026.0),
    format: str = Query("png", pattern="^(png|json)$"),
    max_frames: int = Query(40, ge=2, le=120),
):
    """Per-detector stack over a time window: weighted mean of aligned, background-subtracted real frames of ONE
    detector. This is NASA's suggested way to raise the signal-to-noise (add together the data of each detector
    separately). Frames of one detector differ in wavelength; the span is reported."""
    try:
        ra_v, dec_v = validate_ra_dec(ra, dec)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    key = f"stack:{ra_v:.5f}:{dec_v:.5f}:{size}:{detector}:{from_year}:{to_year}:{follow}:{pmra}:{pmdec}:{epoch}:{max_frames}"
    # The json and the png read the same finished result, so the picture is instant once the numbers are ready.
    info, png, headers = await run_or_pending(
        key, lambda: _compute_stack(ra_v, dec_v, size, detector, from_year, to_year, follow, pmra, pmdec, epoch, max_frames))
    if format == "json":
        return info
    return Response(content=png, media_type="image/png", headers=headers)


async def _compute_stack(ra_v, dec_v, size, detector, from_year, to_year, follow, pmra, pmdec, epoch, max_frames):
    """The real work. It runs as a background task (see longjobs) because a stack downloads dozens of frames."""
    try:
        obs = await get_observations(ra_v, dec_v, radius_deg=0.02, detector=detector, budget_s=120.0)
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"The SPHEREx archive is busy: {exc}")
    frames = [o for o in obs["observations"] if o.get("on_detector") and (o.get("distance_to_edge_px") or 0) >= 6
              and o.get("wavelength_um")
              and (from_year is None or o["decimal_year"] >= from_year)
              and (to_year is None or o["decimal_year"] <= to_year)]
    frames.sort(key=lambda o: o["mjd_avg"])
    if len(frames) > max_frames:
        step = len(frames) / max_frames
        frames = [frames[int(i * step)] for i in range(max_frames)]
    if not frames:
        raise HTTPException(status_code=404, detail=f"No detector {detector} frame covers this position in the chosen time window")

    sem = asyncio.Semaphore(5)

    async def one(o):
        try:
            async with sem:
                cut = await get_cutout(o["access_url"], ra_v, dec_v, size)
            if follow:
                cra, cdec = propagate_proper_motion(ra_v, dec_v, pmra, pmdec, epoch, o["decimal_year"])
                grid, shape = common_grid(cra, cdec, size)
            else:
                grid, shape = common_grid(ra_v, dec_v, size)
            arr = await asyncio.to_thread(reproject_frame, cut, grid, shape, True)
            arr = subtract_background(arr)
            return arr, robust_stats(arr)[1], o
        except UpstreamError:
            return None

    res = [r for r in await asyncio.gather(*(one(o) for o in frames)) if r is not None]
    if not res:
        raise HTTPException(status_code=503, detail="No frame could be downloaded from the archive right now. Retry in a moment.")
    out = _stack([r[0] for r in res], [1.0 / max(r[1], 1e-6) ** 2 for r in res])
    wl = [r[2]["wavelength_um"] for r in res]
    yrs = [r[2]["decimal_year"] for r in res]
    info = {
        "detector": detector, "label": "stacked (per-detector, background subtracted)",
        "frames_stacked": len(res), "frames_available": obs["count"],
        "wavelength_span_um": [round(min(wl), 3), round(max(wl), 3)],
        "date_span_years": [round(min(yrs), 3), round(max(yrs), 3)],
        "mode": "follow proper motion (shift and add)" if follow else "fixed sky",
        "noise_single_frame_median_MJy_sr": round(float(np.median([r[1] for r in res])), 5),
        "noise_stack_MJy_sr": round(robust_stats(out)[1], 5),
    }
    png, _ = render_png(out)
    headers = {
        "X-Hanos-Detector": str(detector), "X-Hanos-Frames-Stacked": str(len(res)), "X-Hanos-Label": "stacked",
        "X-Hanos-Wavelength-Span-um": f"{info['wavelength_span_um'][0]}-{info['wavelength_span_um'][1]}",
        "X-Hanos-Mode": "follow" if follow else "fixed"}
    return info, png, headers
