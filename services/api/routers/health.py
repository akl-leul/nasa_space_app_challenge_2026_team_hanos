import asyncio
import time
from typing import Any, Dict

from fastapi import APIRouter

from ..cache import cache_stats
from ..clients.http import UpstreamError, fetch

router = APIRouter(tags=["health"])
START = time.time()
_last: Dict[str, Any] = {"at": 0.0, "data": None}

PROBES = {
    "irsa_sia2": ("https://irsa.ipac.caltech.edu/SIA", {"COLLECTION": "spherex_dr1", "POS": "circle 133.8 -7.2 0.001", "RESPONSEFORMAT": "CSV"}, {}),
    "spherex_s3_mirror": ("https://nasa-irsa-spherex.s3.amazonaws.com/dr1/level2/2025W33_2C/l2b-v27-2026-228/6/level2_2025W33_2C_0321_1D6_spx_l2b-v27-2026-228.fits", None, {"Range": "bytes=0-99"}),
    "irsa_hips_cube": ("https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/properties", None, {}),
    "simbad": ("https://simbad.cfa.harvard.edu/simbad/sim-tap/capabilities", None, {}),
    "gaia_dr3": ("https://gea.esac.esa.int/tap-server/tap/capabilities", None, {}),
    "irsa_tap": ("https://irsa.ipac.caltech.edu/TAP/capabilities", None, {}),
    "cadc_tap": ("https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/capabilities", None, {}),
    "nasa_skyview": ("https://skyview.gsfc.nasa.gov/current/cgi/basicform.pl", None, {}),
}


async def _probe(name: str, url: str, params, headers) -> Dict[str, Any]:
    t = time.time()
    try:
        await fetch(url, params=params, headers=headers or None, ok_status=(200, 206), timeout=20.0, tries=1, allow_html=True)
        return {"status": "ok", "latency_s": round(time.time() - t, 2)}
    except UpstreamError as exc:
        return {"status": "unreachable", "error": str(exc)[:140], "latency_s": round(time.time() - t, 2)}
    except Exception as exc:
        return {"status": "unreachable", "error": f"{type(exc).__name__}: {exc}"[:140]}


@router.get("/api/health")
async def health():
    """Live probes of every archive the app depends on (cached for 60 s). Nothing is reported as verified without a request."""
    if _last["data"] and time.time() - _last["at"] < 60:
        data = dict(_last["data"])
        data["uptime_seconds"] = round(time.time() - START, 1)
        return data
    names = list(PROBES)
    results = await asyncio.gather(*(_probe(n, *PROBES[n]) for n in names))
    data = {
        "status": "healthy" if all(r["status"] == "ok" for r in results) else "degraded",
        "service": "HANOS SPHEREx Science API", "version": "2.0.0",
        "archives": dict(zip(names, results)),
        "cache": cache_stats(),
        "checked_at": time.time(),
    }
    _last.update(at=time.time(), data=data)
    out = dict(data)
    out["uptime_seconds"] = round(time.time() - START, 1)
    return out
