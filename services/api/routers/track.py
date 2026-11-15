from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..astro.coordinates import validate_ra_dec
from ..tracking import TrackParams, snapshot, start_job

router = APIRouter(tags=["track"])


@router.get("/api/track")
async def track(
    ra: float = Query(..., description="Cutout centre RA (position at `epoch`)"),
    dec: float = Query(..., description="Cutout centre Dec"),
    size: float = Query(0.1, ge=0.04, le=0.3, description="Cutout side in degrees (0.1 deg = about 58 native pixels)"),
    detector: int = Query(4, ge=1, le=6, description="Detector array 1-6; frames of different detectors are never mixed"),
    pmra: float = Query(0.0, description="Proper motion in RA times cos(dec), mas/yr (from /api/resolve)"),
    pmdec: float = Query(0.0, description="Proper motion in Dec, mas/yr"),
    epoch: float = Query(2026.0, description="Epoch of ra/dec"),
    deep: bool = Query(False, description="Include deep-field frames"),
    name: Optional[str] = Query(None),
    frames: bool = Query(True, description="Include the per-frame list"),
):
    """Start (or join) the background tracking job for this object and detector and return a snapshot.

    Poll the same URL until status is 'done'. Frames arrive progressively; the snapshot always contains
    only frames that were really measured."""
    try:
        ra_v, dec_v = validate_ra_dec(ra, dec)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    job = start_job(TrackParams(ra=ra_v, dec=dec_v, size_deg=round(size, 4), detector=detector, pmra=pmra,
                                pmdec=pmdec, pos_epoch=epoch, include_deep=deep, name=name))
    return snapshot(job, include_frames=frames)
