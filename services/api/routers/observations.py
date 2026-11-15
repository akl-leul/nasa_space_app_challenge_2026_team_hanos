from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..astro.coordinates import validate_ra_dec
from ..clients.http import UpstreamError
from ..clients.observations import get_observations

router = APIRouter(tags=["observations"])


@router.get("/api/observations")
async def observations(
    ra: float = Query(..., description="Right Ascension in degrees [0, 360)"),
    dec: float = Query(..., description="Declination in degrees [-90, +90]"),
    radius: float = Query(0.02, ge=0.001, le=1.0, description="Search radius in degrees (frames whose footprint touches the circle)"),
    detector: Optional[int] = Query(None, ge=1, le=6, description="Only this detector array (1-6)"),
    deep: bool = Query(False, description="Also search the deep-field collections"),
    collections: Optional[str] = Query(None, description="Comma separated collection names (default: all current wide-survey collections)"),
    budget: float = Query(25.0, ge=1.0, le=120.0, description="Seconds to wait for per-frame metadata before returning partial results"),
):
    """Real SPHEREx spectral images covering the position, time ordered, with true per-frame wavelength."""
    try:
        ra_v, dec_v = validate_ra_dec(ra, dec)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    cols = [c.strip() for c in collections.split(",") if c.strip()] if collections else None
    try:
        return await get_observations(
            ra_v, dec_v, radius_deg=radius, collections=cols, include_deep=deep, detector=detector, budget_s=budget
        )
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"The SPHEREx archive is busy: {exc}. Retry in a moment.")
