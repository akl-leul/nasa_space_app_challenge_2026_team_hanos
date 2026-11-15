"""Optional context layers from other missions. They are never SPHEREx data and are labelled as such.

* DSS2 red plates through NASA SkyView (optical, plates taken about 1987-1998 for POSS-II F).
* NEOSSat observations through the CADC TAP service (optical).
"""

from __future__ import annotations

import csv
import io
from typing import Any, Dict, List

import numpy as np
from astropy.io import fits
from PIL import Image

from ..astro.render import render_png
from ..cache import get_cache, set_cache
from ..config import CADC_TAP_URL, SKYVIEW_BASE
from .http import fetch

DSS_EPOCH_RANGE = "plates taken about 1987-1998 (POSS-II F; per the CADC DSS survey table)"
DSS_NOMINAL_EPOCH = 1992.5


async def fetch_dss(ra: float, dec: float, size_deg: float, pixels: int = 240):
    resp = await fetch(SKYVIEW_BASE, params={"Survey": "dss2r", "Position": f"{ra:.6f},{dec:.6f}",
                                             "Size": f"{size_deg:.5f}", "Pixels": str(pixels), "Return": "FITS"},
                       timeout=90.0, tries=4)
    with fits.open(io.BytesIO(resp.content), memmap=False) as h:
        data = np.array(h[0].data, dtype=np.float32)
    return data


async def dss_png(ra: float, dec: float, size_deg: float, invert: bool = False) -> bytes:
    data = await fetch_dss(ra, dec, size_deg)
    # SkyView returns north-up, east-left already, row 0 is the south edge like FITS: render_png flips it
    png, _ = render_png(data, invert=invert, lo_sigma=-1.0, hi_sigma=None, asinh_scale=6.0)
    return png


async def query_neossat(ra: float, dec: float, radius_deg: float = 0.1) -> Dict[str, Any]:
    key = f"neossat:{ra:.3f}:{dec:.3f}:{radius_deg:.3f}"
    cached = get_cache(key, max_age_sec=24 * 3600)
    if cached is None:
        adql = (
            "SELECT TOP 100 o.observationID, p.productID, p.time_bounds_lower, p.time_exposure, p.calibrationLevel "
            "FROM caom2.Observation o JOIN caom2.Plane p ON p.obsID = o.obsID "
            f"WHERE o.collection = 'NEOSSAT' AND INTERSECTS(CIRCLE('ICRS',{ra:.5f},{dec:.5f},{radius_deg:.4f}), p.position_bounds) = 1 "
            "ORDER BY p.time_bounds_lower DESC"
        )
        resp = await fetch(CADC_TAP_URL, method="POST",
                           data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql},
                           timeout=90.0, tries=3)
        cached = {"rows": list(csv.DictReader(io.StringIO(resp.text)))}
        set_cache(key, "neossat", "CADC", cached)
    rows: List[Dict[str, Any]] = cached["rows"]
    return {"collection": "NEOSSat (Canadian Space Agency, archived at CADC)", "count": len(rows), "exposures": rows,
            "wavelength_regime": "optical (visible light)",
            "credit": "NEOSSat / CSA / CADC, Open Government Licence - Canada (record 62d8033b-87b6-4322-8d5f-e26bebf934c1)",
            "note": "Optical context only. Never compare brightness directly with SPHEREx infrared data."}
