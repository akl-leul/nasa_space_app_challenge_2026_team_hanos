from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query

from ..astro.coordinates import validate_ra_dec
from ..clients.http import UpstreamError
from ..clients.observations import get_observations

router = APIRouter(tags=["detectors"])

# Band ranges and resolving powers: SPHEREx Archive at IRSA User Guide (data products page).
BANDS = {
    1: (0.75, 1.09, 39), 2: (1.10, 1.62, 41), 3: (1.63, 2.41, 41),
    4: (2.42, 3.82, 35), 5: (3.83, 4.41, 112), 6: (4.42, 5.00, 128),
}


@router.get("/api/detectors")
async def detectors(ra: float = Query(...), dec: float = Query(...),
                    radius: float = Query(0.02, ge=0.001, le=0.5)):
    """Which of the six detector arrays have real frames at this position, with the wavelengths actually
    observed there and the dates."""
    try:
        ra_v, dec_v = validate_ra_dec(ra, dec)
        obs = await get_observations(ra_v, dec_v, radius_deg=radius, budget_s=90.0)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"The SPHEREx archive is busy: {exc}")
    out: List[Dict[str, Any]] = []
    for d in range(1, 7):
        fr = [o for o in obs["observations"] if o["detector"] == d and o.get("on_detector")]
        wl = [o["wavelength_um"] for o in fr if o.get("wavelength_um")]
        yrs = [o["decimal_year"] for o in fr]
        lo, hi, r = BANDS[d]
        out.append({
            "detector": d, "documented_band_um": [lo, hi], "documented_resolving_power": r,
            "frames": len(fr), "has_coverage": bool(fr),
            "wavelength_observed_um": [round(min(wl), 3), round(max(wl), 3)] if wl else None,
            "first_date": min((o["date_utc"] for o in fr), default=None),
            "last_date": max((o["date_utc"] for o in fr), default=None),
            "releases": sorted({o["release"] for o in fr}),
            "years": [round(min(yrs), 3), round(max(yrs), 3)] if yrs else None,
        })
    return {"ra": ra_v, "dec": dec_v, "total_frames": obs["count"], "detectors": out,
            "source": "IRSA SIA2 plus per-frame headers; band table from the IRSA SPHEREx Archive User Guide",
            "note": "Some pointings lack some bands because quality is judged per band."}
