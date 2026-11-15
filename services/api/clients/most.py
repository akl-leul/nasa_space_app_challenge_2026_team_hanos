"""IRSA MOST (Moving Object Search Tool) for SPHEREx: which real frames contain a named solar-system object."""

from __future__ import annotations

import asyncio
import io
from typing import Any, Dict, List

from astropy.io.votable import parse_single_table

from ..cache import get_cache, set_cache
from ..config import IRSA_MOST_URL
from .http import UpstreamError, fetch


def _parse(content: bytes) -> List[Dict[str, Any]]:
    table = parse_single_table(io.BytesIO(content), verify="ignore").to_table()
    rows = []
    for r in table:
        if int(r["match"]) != 1:  # match=1: the predicted position falls inside the image footprint
            continue
        rows.append({
            "obs_id": str(r["observationid"]), "plane_id": str(r["planeid"]),
            "detector": int(str(r["productid"]).lstrip("D")) if str(r["productid"]).lstrip("D").isdigit() else None,
            "start_utc": str(r["start_date"]), "end_utc": str(r["end_date"]),
            "mjd_start": float(r["mjd_start"]), "exposure_s": float(r["exposure_time"]),
            "predicted_ra": float(r["ra_obj"]), "predicted_dec": float(r["dec_obj"]),
            "distance_from_image_centre_deg": float(r["dist_ctr"]), "v_mag": float(r["vmag"]),
            "sun_distance_au": float(r["sun_dist"]), "geo_distance_au": float(r["geo_dist"]),
            "uri": str(r["uri"]),
            "label": "predicted position (JPL Horizons via IRSA MOST)",
        })
    return rows


async def query_moving_objects(obj_name: str, obs_begin: str = "2025 05 01", obs_end: str = "2026 12 31") -> Dict[str, Any]:
    key = f"most:{obj_name.strip().lower()}:{obs_begin}:{obs_end}"
    cached = get_cache(key, max_age_sec=6 * 3600)
    if cached is None:
        resp = await fetch(IRSA_MOST_URL, params={"catalog": "spherex", "input_type": "name_input",
                                                  "obj_name": obj_name.strip(), "obs_begin": obs_begin,
                                                  "obs_end": obs_end, "output_mode": "VOTable"},
                           timeout=150.0, tries=3, allow_html=True,
                           ok_status=(200, 400))  # 400 is MOST's answer for a name it does not know (a star, say), not a fault
        if b"<VOTABLE" not in resp.content[:2000]:
            msg = resp.text.strip().replace("\n", " ")[:200]
            raise ValueError(
                f"'{obj_name}' is not a solar-system object that IRSA MOST knows (it handles planets, asteroids and comets).")
        rows = await asyncio.to_thread(_parse, resp.content)
        cached = {"object_name": obj_name, "matches": rows}
        set_cache(key, "most", "SPHEREx", cached)
    cached.pop("_age_sec", None)
    return {"object_name": obj_name, "catalog": "SPHEREx (IRSA MOST)", "matches_count": len(cached["matches"]),
            "matches": cached["matches"],
            "note": "Positions are predictions from the object's orbit, not measurements."}
