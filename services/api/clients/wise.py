"""AllWISE catalogue sources (allwise_p3as_psd) through the IRSA Gator cone search.

IRSA TAP answers the same query in more than 100 s, Gator in about 3 s, and both read the same catalogue."""

from __future__ import annotations

import csv
import io
from typing import Any, Dict, List, Optional

from ..cache import get_cache, set_cache
from .http import fetch

GATOR_URL = "https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query"
COLUMNS = "designation,ra,dec,w1mpro,w1sigmpro,w2mpro,w2sigmpro,w3mpro,w4mpro,cc_flags,pmra,pmdec"


def _parse_ipac(text: str) -> List[Dict[str, str]]:
    """Parse an IPAC fixed-width table: header lines start with a backslash, then names and types, then rows."""
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("\\")]
    if len(lines) < 2:
        return []
    header = lines[0]
    cuts = [i for i, ch in enumerate(header) if ch == "|"]
    names = [header[a + 1:b].strip() for a, b in zip(cuts[:-1], cuts[1:])]
    out = []
    for ln in lines:
        if ln.startswith("|"):  # header rows: names, types, units, null markers
            continue
        cells = [ln[a + 1:b].strip() for a, b in zip(cuts[:-1], cuts[1:])]
        row = dict(zip(names, cells))
        out.append({k: ("" if v.lower() == "null" else v) for k, v in row.items()})
    return out


def _f(v: str) -> Optional[float]:
    try:
        return float(v) if v not in ("", None) else None
    except ValueError:
        return None


async def query_wise_sources(ra: float, dec: float, radius_deg: float, max_rows: int = 200) -> List[Dict[str, Any]]:
    """AllWISE point sources (mean epoch about 2010.5). Raises UpstreamError if IRSA cannot answer."""
    key = f"allwise:{ra:.4f}:{dec:.4f}:{radius_deg:.4f}:{max_rows}"
    cached = get_cache(key, max_age_sec=90 * 24 * 3600)
    if cached is None:
        resp = await fetch(
            GATOR_URL,
            params={"catalog": "allwise_p3as_psd", "spatial": "Cone", "objstr": f"{ra:.6f} {dec:.6f}",
                    "radius": f"{radius_deg * 3600:.1f}", "radunits": "arcsec", "outfmt": "1", "selcols": COLUMNS},
            timeout=60.0, tries=4, allow_html=True,
        )
        text = resp.text
        if "RowsRetrieved" not in text:
            from .http import UpstreamError

            raise UpstreamError("IRSA Gator returned no table", url=GATOR_URL)
        cached = {"rows": _parse_ipac(text)[:max_rows]}
        set_cache(key, "allwise", "AllWISE", cached)
    out = []
    for r in cached["rows"]:
        out.append({
            "designation": r.get("designation"), "ra": _f(r.get("ra")), "dec": _f(r.get("dec")),
            "w1_mag": _f(r.get("w1mpro")), "w1_err": _f(r.get("w1sigmpro")),
            "w2_mag": _f(r.get("w2mpro")), "w2_err": _f(r.get("w2sigmpro")),
            "w3_mag": _f(r.get("w3mpro")), "w4_mag": _f(r.get("w4mpro")),
            "cc_flags": r.get("cc_flags") or "", "epoch": 2010.5, "catalogue": "AllWISE",
        })
    return out
