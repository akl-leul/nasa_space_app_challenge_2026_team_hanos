"""Gaia DR3 sources from the ESA Gaia archive (TAP), with proper motion propagation.

Gaia observed 2014-07-27 to 2025-01-15 in the optical only (G band about 330-1050 nm), so it is used
for positions, motions and astrometric reference stars. It is never used as a flux comparison with
SPHEREx infrared data.
"""

from __future__ import annotations

import csv
import io
from typing import Any, Dict, List, Optional

from ..astro.coordinates import propagate_proper_motion
from ..cache import get_cache, set_cache
from ..config import GAIA_TAP_URL
from .http import fetch


def _f(v: str) -> Optional[float]:
    try:
        return float(v) if v not in ("", None) else None
    except ValueError:
        return None


async def query_gaia_sources(ra: float, dec: float, radius_deg: float, target_epoch: float = 2026.0,
                             max_rows: int = 400, g_limit: Optional[float] = None) -> List[Dict[str, Any]]:
    """Gaia DR3 sources inside the cone. Raises UpstreamError if the archive cannot answer."""
    key = f"gaia:{ra:.4f}:{dec:.4f}:{radius_deg:.4f}:{max_rows}:{g_limit}"
    cached = get_cache(key, max_age_sec=30 * 24 * 3600)
    if cached is None:
        where_g = f" AND phot_g_mean_mag < {g_limit}" if g_limit else ""
        adql = (
            f"SELECT TOP {max_rows} source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag, "
            "phot_bp_mean_mag, phot_rp_mean_mag, ref_epoch FROM gaiadr3.gaia_source "
            f"WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{ra:.6f},{dec:.6f},{radius_deg:.6f})){where_g} "
            "ORDER BY phot_g_mean_mag"
        )
        resp = await fetch(GAIA_TAP_URL, method="POST",
                           data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql},
                           timeout=90.0, tries=4)
        rows = list(csv.DictReader(io.StringIO(resp.text)))
        cached = {"rows": rows}
        set_cache(key, "gaia", "DR3", cached)
    out: List[Dict[str, Any]] = []
    for r in cached["rows"]:
        ra0, dec0 = _f(r["ra"]), _f(r["dec"])
        if ra0 is None or dec0 is None:
            continue
        pmra, pmdec = _f(r["pmra"]), _f(r["pmdec"])
        ref_epoch = _f(r["ref_epoch"]) or 2016.0
        if pmra is not None and pmdec is not None:
            ra_t, dec_t = propagate_proper_motion(ra0, dec0, pmra, pmdec, ref_epoch, target_epoch)
        else:
            ra_t, dec_t = ra0, dec0  # two-parameter solutions have no proper motion in DR3
        out.append({
            "source_id": r["source_id"], "ra": ra_t, "dec": dec_t, "ra_ref": ra0, "dec_ref": dec0,
            "ref_epoch": ref_epoch, "target_epoch": target_epoch,
            "pmra_cosdec": pmra, "pmdec": pmdec, "parallax": _f(r["parallax"]),
            "g_mag": _f(r["phot_g_mean_mag"]), "bp_mag": _f(r["phot_bp_mean_mag"]),
            "rp_mag": _f(r["phot_rp_mean_mag"]), "has_proper_motion": pmra is not None,
            "catalogue": "Gaia DR3",
        })
    return out
