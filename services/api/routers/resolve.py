from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..astro.coordinates import parse_coordinate_string
from ..clients.http import UpstreamError
from ..clients.simbad import resolve_target

router = APIRouter(tags=["resolve"])


@router.get("/api/resolve")
async def resolve(
    name: str = Query(..., description="Target name (SIMBAD) or coordinates: '133.8 -7.2' or '08:55:10.8 -07:14:42'"),
    epoch: Optional[float] = Query(2026.0, description="Epoch to which the position is propagated (default 2026.0)"),
):
    """Resolve a name at run time (SIMBAD) with proper motion, or parse typed RA/Dec."""
    clean = name.strip()
    try:
        ra, dec = parse_coordinate_string(clean)
        return {"name": f"RA {ra:.5f}, Dec {dec:+.5f}", "ra": ra, "dec": dec, "ra_j2000": ra, "dec_j2000": dec,
                "target_epoch": epoch, "pmra_cosdec": None, "pmdec": None, "parallax": None,
                "resolved_by": "typed coordinates", "is_direct_coordinate": True,
                "note": "Coordinates were typed; no proper motion is applied."}
    except ValueError as exc:
        if any(ch.isdigit() for ch in clean) and ("," in clean or clean.count(" ") >= 1) and "out of bounds" in str(exc):
            raise HTTPException(status_code=400, detail=str(exc))
    try:
        return await resolve_target(clean, target_epoch=epoch or 2026.0)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"SIMBAD is busy: {exc}")
