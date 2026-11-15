"""Target resolution from SIMBAD at run time, with proper motion.

No coordinate or proper motion of a challenge target is typed in here. The single allowed constant
is NASA's published WISE 0855 position; it is used ONLY as a cross-check against SIMBAD, and its epoch
is DERIVED from the difference between the two positions and the SIMBAD proper motion.
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

import certifi

from ..astro.coordinates import propagate_proper_motion
from ..cache import get_cache, set_cache
from ..config import SIMBAD_HARVARD_TAP, SIMBAD_STRASBOURG_SESAME
from .http import UpstreamError, fetch, get_client

# NASA Space Apps challenge text: WISE 0855 at RA 08h55m10.831s, Dec -07d14m42.53s
NASA_WISE_0855 = {"ra": (8 + 55 / 60 + 10.831 / 3600) * 15.0, "dec": -(7 + 14 / 60 + 42.53 / 3600)}

# Names the team uses for the five required targets -> exact SIMBAD identifiers (no coordinates here).
CHALLENGE_IDS = {
    "barnard's star": "NAME Barnard's star",
    "barnards star": "NAME Barnard's star",
    "barnard": "NAME Barnard's star",
    "epsilon indi b": "* eps Ind B",
    "eps indi b": "* eps Ind B",
    "eps ind b": "* eps Ind B",
    "wise 0855": "WISEA J085510.74-071442.5",
    "wise0855": "WISEA J085510.74-071442.5",
    "wise 0855-0714": "WISEA J085510.74-071442.5",
    "rw aurigae": "V* RW Aur",
    "rw aur": "V* RW Aur",
    "r draconis": "V* R Dra",
    "r dra": "V* R Dra",
}


def _candidates(name: str) -> List[str]:
    n = name.strip()
    key = re.sub(r"\s+", " ", n.lower())
    out: List[str] = []
    if key in CHALLENGE_IDS:
        out.append(CHALLENGE_IDS[key])
    out += [n, f"NAME {n}", f"* {n}", f"V* {n}"]
    seen, uniq = set(), []
    for c in out:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    return uniq


def _sq(s: str) -> str:
    return s.replace("'", "''")


async def _simbad_row(name: str) -> Optional[Dict[str, Any]]:
    ids = ", ".join(f"'{_sq(c)}'" for c in _candidates(name))
    adql = (
        "SELECT basic.main_id, basic.ra, basic.dec, basic.pmra, basic.pmdec, basic.plx_value, "
        "basic.otype, basic.coo_err_maj FROM basic JOIN ident ON ident.oidref = basic.oid "
        f"WHERE ident.id IN ({ids})"
    )
    resp = await fetch(
        SIMBAD_HARVARD_TAP,
        method="POST",
        data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "QUERY": adql},
        timeout=40.0,
        tries=4,
    )
    rows = resp.json().get("data", [])
    if not rows:
        return None
    main_id, ra, dec, pmra, pmdec, plx, otype, err = rows[0]
    return {
        "main_id": str(main_id),
        "ra_j2000": float(ra),
        "dec_j2000": float(dec),
        "pmra_cosdec": float(pmra) if pmra is not None else None,
        "pmdec": float(pmdec) if pmdec is not None else None,
        "parallax": float(plx) if plx is not None else None,
        "otype": str(otype) if otype else None,
    }


async def _sesame_row(name: str) -> Optional[Dict[str, Any]]:
    url = f"{SIMBAD_STRASBOURG_SESAME}?{name.strip()}"
    resp = await fetch(url, timeout=30.0, tries=3, allow_html=True)
    root = ET.fromstring(resp.text)
    res = root.find(".//Resolver")
    if res is None or res.find("jradeg") is None:
        return None
    pm = res.find("pm")

    def f(el, tag):
        node = el.find(tag) if el is not None else None
        return float(node.text) if node is not None and node.text else None

    return {
        "main_id": (res.findtext("oname") or name).strip(),
        "ra_j2000": float(res.find("jradeg").text),
        "dec_j2000": float(res.find("jdedeg").text),
        "pmra_cosdec": f(pm, "pmRA"),
        "pmdec": f(pm, "pmDE"),
        "parallax": None,
        "otype": None,
    }


def _positions(row: Dict[str, Any], target_epoch: float) -> Dict[str, float]:
    pmra = row["pmra_cosdec"] or 0.0
    pmdec = row["pmdec"] or 0.0
    ra, dec = propagate_proper_motion(row["ra_j2000"], row["dec_j2000"], pmra, pmdec, 2000.0, target_epoch)
    return {"ra": ra, "dec": dec}


def _wise_0855_check(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Derive the epoch of NASA's published position from SIMBAD (no assumed epoch)."""
    if row["pmra_cosdec"] in (None, 0.0) or row["pmdec"] is None:
        return None
    cosd = math.cos(math.radians(row["dec_j2000"]))
    d_ra_arcsec = (NASA_WISE_0855["ra"] - row["ra_j2000"]) * 3600.0 * cosd
    d_dec_arcsec = (NASA_WISE_0855["dec"] - row["dec_j2000"]) * 3600.0
    t_ra = d_ra_arcsec / (row["pmra_cosdec"] / 1000.0)
    t_dec = d_dec_arcsec / (row["pmdec"] / 1000.0) if row["pmdec"] else float("nan")
    # RA carries the larger motion, so it constrains the epoch best
    epoch = 2000.0 + t_ra
    ra_p, dec_p = propagate_proper_motion(row["ra_j2000"], row["dec_j2000"], row["pmra_cosdec"], row["pmdec"], 2000.0, epoch)
    resid = math.hypot((NASA_WISE_0855["ra"] - ra_p) * 3600 * cosd, (NASA_WISE_0855["dec"] - dec_p) * 3600)
    return {
        "nasa_ra": NASA_WISE_0855["ra"],
        "nasa_dec": NASA_WISE_0855["dec"],
        "derived_epoch": round(epoch, 2),
        "epoch_from_ra_years": round(t_ra, 2),
        "epoch_from_dec_years": round(t_dec, 2) if not math.isnan(t_dec) else None,
        "residual_arcsec_after_propagation": round(resid, 2),
        "note": "NASA's published position is a mean-epoch position of the WISE discovery data. The epoch is "
                "derived here from the SIMBAD proper motion; the position at SPHEREx epochs is propagated from "
                "SIMBAD's J2000 position, not taken from NASA's.",
    }


async def resolve_target(name: str, target_epoch: float = 2026.0) -> Dict[str, Any]:
    key = f"resolve:{re.sub(r'[^a-z0-9]+', '', name.lower())}"
    row = get_cache(key, max_age_sec=30 * 24 * 3600)
    source = "SIMBAD (Harvard mirror)"
    if row is None:
        try:
            row = await _simbad_row(name)
        except UpstreamError:
            row = None
        if row is None:
            try:
                row = await _sesame_row(name)
                source = "CDS Sesame (Strasbourg)"
            except UpstreamError as exc:
                raise UpstreamError(f"SIMBAD and Sesame did not answer: {exc}")
        if row is None:
            raise ValueError(f"No object named '{name}' was found in SIMBAD or Sesame")
        row["source"] = source
        set_cache(key, "resolve", "simbad", row)
    pos = _positions(row, target_epoch)
    out = {
        "name": row["main_id"],
        "query": name,
        "otype": row.get("otype"),
        "resolved_by": row.get("source", source),
        "ra_j2000": row["ra_j2000"],
        "dec_j2000": row["dec_j2000"],
        "epoch_base": 2000.0,
        "pmra_cosdec": row["pmra_cosdec"],
        "pmdec": row["pmdec"],
        "parallax": row["parallax"],
        "target_epoch": target_epoch,
        "ra": pos["ra"],
        "dec": pos["dec"],
        "note": f"Position propagated from the SIMBAD J2000 position to epoch {target_epoch:.1f} with SIMBAD proper motion.",
    }
    if "0855" in row["main_id"] and "J085510" in row["main_id"].replace(" ", ""):
        out["nasa_reference"] = _wise_0855_check(row)
    return out
