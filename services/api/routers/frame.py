import asyncio

from fastapi import APIRouter, HTTPException, Query, Response

from ..astro.render import common_grid, render_png, reproject_frame
from ..clients.http import UpstreamError
from ..clients.irsa_cutout import get_cutout

router = APIRouter(tags=["frames"])

ALLOWED_PREFIX = "https://irsa.ipac.caltech.edu/ibe/data/spherex/"


@router.get("/api/frame.png")
async def frame_png(
    url: str = Query(..., description="Spectral image access_url from /api/observations"),
    ra: float = Query(...),
    dec: float = Query(...),
    size: float = Query(0.1, ge=0.04, le=0.3),
    invert: bool = Query(False, description="Dark objects on a light background"),
):
    """One real frame on the common sky grid (north up, east left), stretched with a documented asinh stretch."""
    if not url.startswith(ALLOWED_PREFIX):
        raise HTTPException(status_code=400, detail="Only IRSA SPHEREx image URLs are accepted")
    try:
        cut = await get_cutout(url, ra, dec, size)
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"The SPHEREx archive is busy: {exc}")
    grid, shape = common_grid(ra, dec, size)
    arr = await asyncio.to_thread(reproject_frame, cut, grid, shape)
    png, info = await asyncio.to_thread(render_png, arr, invert=invert)
    m = cut["meta"]
    headers = {
        "Cache-Control": "public, max-age=86400",
        "X-Hanos-Detector": str(m["detector"]),
        "X-Hanos-Wavelength-um": str(m["wavelength_um"]),
        "X-Hanos-Date-UTC": m["date_obs"],
        "X-Hanos-Stretch": f"asinh; lo={info['lo_sigma']} sigma; hi={info['hi_sigma']} sigma; background-subtracted",
        "X-Hanos-Orientation": info["orientation"],
    }
    return Response(content=png, media_type="image/png", headers=headers)
