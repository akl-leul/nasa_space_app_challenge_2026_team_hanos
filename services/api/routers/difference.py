import asyncio

from fastapi import APIRouter, HTTPException, Query, Response

from ..astro.render import common_grid, render_signed_png, reproject_frame, robust_stats, subtract_background
from ..clients.http import UpstreamError
from ..clients.irsa_cutout import get_cutout
from .frame import ALLOWED_PREFIX

router = APIRouter(tags=["difference"])


@router.get("/api/difference")
async def difference(
    a: str = Query(..., description="access_url of frame A"),
    b: str = Query(..., description="access_url of frame B"),
    ra: float = Query(...), dec: float = Query(...),
    size: float = Query(0.1, ge=0.04, le=0.3),
    mode: str = Query("subtract", pattern="^(subtract|reverse_subtract|add)$"),
    format: str = Query("png", pattern="^(png|json)$"),
):
    """A-B, B-A or A+B of two real frames aligned on the sky. Each frame has its local background removed first.
    If the frames are not wavelength matched the response says so: a difference can then come from wavelength."""
    for u in (a, b):
        if not u.startswith(ALLOWED_PREFIX):
            raise HTTPException(status_code=400, detail="Only IRSA SPHEREx image URLs are accepted")
    try:
        ca, cb = await asyncio.gather(get_cutout(a, ra, dec, size), get_cutout(b, ra, dec, size))
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"The SPHEREx archive is busy: {exc}")
    grid, shape = common_grid(ra, dec, size)
    ia, ib = await asyncio.gather(asyncio.to_thread(reproject_frame, ca, grid, shape, True),
                                  asyncio.to_thread(reproject_frame, cb, grid, shape, True))
    ia, ib = subtract_background(ia), subtract_background(ib)
    ma, mb = ca["meta"], cb["meta"]
    dl = abs(ma["wavelength_um"] - mb["wavelength_um"]) / ma["wavelength_um"]
    matched = ma["detector"] == mb["detector"] and dl < 0.03
    warning = None if matched else (
        f"Frames are not wavelength matched (A: detector {ma['detector']} at {ma['wavelength_um']:.3f} micron, "
        f"B: detector {mb['detector']} at {mb['wavelength_um']:.3f} micron). A difference can come from the "
        "spectrum of the objects and not from real change.")
    if mode == "add":
        out, label = ia + ib, "A + B"
    elif mode == "reverse_subtract":
        out, label = ib - ia, "B - A"
    else:
        out, label = ia - ib, "A - B"
    info = {"label": label, "wavelength_matched": matched, "warning": warning,
            "frame_a": {"date": ma["date_obs"], "detector": ma["detector"], "wavelength_um": ma["wavelength_um"]},
            "frame_b": {"date": mb["date_obs"], "detector": mb["detector"], "wavelength_um": mb["wavelength_um"]},
            "noise_sigma_MJy_sr": round(robust_stats(out)[1], 5),
            "note": "Both frames are aligned on the sky and background-subtracted before the arithmetic."}
    if format == "json":
        return info
    png, _ = render_signed_png(out)
    return Response(content=png, media_type="image/png", headers={
        "X-Hanos-Label": label, "X-Hanos-Wavelength-Matched": str(matched).lower(),
        "X-Hanos-Warning": (warning or "none")[:240]})
