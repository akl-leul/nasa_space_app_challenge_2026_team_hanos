"""Real SPHEREx observation search (IRSA SIA2) with true per-frame metadata.

Why SIA2 and not TAP: the same search through TAP took 20 s to more than 2 minutes in testing and
the first version of this service silently returned nothing when it timed out. SIA2 answers in
seconds. TAP stays available through ``query_tap_fresh`` for data newer than about one day.
"""

from __future__ import annotations

import asyncio
import csv
import io
import math
import re
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
from astropy.time import Time

from ..cache import get_cache, set_cache
from ..config import IRSA_SIA2_URL
from .http import UpstreamError, fetch
from .s3_fits import describe_from_static, load_frame_static

DEFAULT_COLLECTIONS = ["spherex_dr1", "spherex_qr3"]  # fallback only; discovery below is primary
_background: set = set()


def release_label(collection: str) -> str:
    """spherex_dr1 -> DR1, spherex_qr3_deep -> QR3 Deep, spherex_dr1_cube -> DR1 All-Sky Cube."""
    m = re.match(r"spherex_([a-z]+\d+)(?:_(deep|cube))?$", collection.lower())
    if not m:
        return collection
    label = m.group(1).upper()
    return {None: label, "deep": f"{label} Deep", "cube": f"{label} All-Sky Cube"}[m.group(2)]


def is_cube_collection(collection: str) -> bool:
    return collection.lower().endswith("_cube")


def is_deep_collection(collection: str) -> bool:
    return collection.lower().endswith("_deep")


async def discover_collections() -> List[str]:
    """SPHEREx SIA collections, discovered from IRSA (cached 24 h). Falls back to the documented list."""
    cached = get_cache("collections:spherex", max_age_sec=24 * 3600)
    if cached and cached.get("collections"):
        return cached["collections"]

    def _list() -> List[str]:
        from astroquery.ipac.irsa import Irsa

        tbl = Irsa.list_collections(servicetype="SIA", filter="spherex")
        names = [str(n) for n in tbl["collection"]]
        return sorted(n for n in names if n.startswith("spherex_"))

    try:
        names = await asyncio.wait_for(asyncio.to_thread(_list), timeout=60)
        if names:
            set_cache("collections:spherex", "collections", "all", {"collections": names})
            return names
    except Exception:
        pass
    stale = get_cache("collections:spherex", allow_stale=True)
    if stale and stale.get("collections"):
        return stale["collections"]
    return ["spherex_dr1", "spherex_dr1_deep", "spherex_dr1_cube", "spherex_qr3", "spherex_qr3_deep"]


def _parse_csv(text: str) -> List[Dict[str, str]]:
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    if not header or "access_url" not in header:
        raise UpstreamError("SIA2 answer did not contain a result table")
    names = [h for h in header if h]
    rows = []
    for raw in reader:
        if not raw:
            continue
        rows.append({n: (raw[i] if i < len(raw) else "") for i, n in enumerate(names)})
    return rows


async def sia_query(collection: str, ra: float, dec: float, radius_deg: float) -> List[Dict[str, str]]:
    resp = await fetch(
        IRSA_SIA2_URL,
        params={"COLLECTION": collection, "POS": f"circle {ra:.6f} {dec:.6f} {radius_deg:.5f}", "RESPONSEFORMAT": "CSV"},
        timeout=100.0,
        tries=5,
    )
    return _parse_csv(resp.text)


def _point_in_polygon(px: float, py: float, poly: List[Tuple[float, float]]) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi + 1e-300) + xi:
            inside = not inside
        j = i
    return inside


def footprint_covers(s_region: str, ra: float, dec: float) -> Optional[bool]:
    """True/False if the image footprint polygon contains the point; None if unparsable."""
    try:
        nums = [float(v) for v in re.findall(r"[-+]?\d+\.?\d*(?:[eE][-+]?\d+)?", s_region.split("ICRS", 1)[1])]
        pts = list(zip(nums[0::2], nums[1::2]))
        cosd = math.cos(math.radians(dec))
        # local tangent-plane coordinates (small field: planar approximation is adequate)
        poly = [(((p[0] - ra + 180.0) % 360.0 - 180.0) * cosd, p[1] - dec) for p in pts]
        return _point_in_polygon(0.0, 0.0, poly)
    except Exception:
        return None


def _num(v: str) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _record(row: Dict[str, str], collection: str, ra: float, dec: float) -> Dict[str, Any]:
    bandpass = row.get("energy_bandpassname", "")
    m = re.search(r"D(\d)$", bandpass)
    detector = int(m.group(1)) if m else None
    mjd0 = _num(row.get("t_min"))
    mjd1 = _num(row.get("t_max"))
    em0 = _num(row.get("em_min"))
    em1 = _num(row.get("em_max"))
    did = row.get("obs_publisher_did", "")
    return {
        "obs_id": row.get("obs_id", ""),
        "plane_id": did.split("?", 1)[1] if "?" in did else did,
        "collection": collection,
        "release": release_label(collection),
        "survey_part": "deep" if is_deep_collection(collection) else "wide",
        "detector": detector,
        "bandpass": bandpass,
        "access_url": row.get("access_url", ""),
        "mjd_start": mjd0,
        "mjd_end": mjd1,
        "exposure_s": _num(row.get("t_exptime")),
        "band_range_um": [round(em0 * 1e6, 4), round(em1 * 1e6, 4)] if em0 and em1 else None,
        "resolving_power": _num(row.get("em_res_power")),
        "pixel_scale_arcsec": _num(row.get("s_pixel_scale")),
        "footprint_covers_target": footprint_covers(row.get("s_region", ""), ra, dec),
        "enriched": False,
    }


def _add_dates(records: List[Dict[str, Any]]) -> None:
    mjds = [r["mjd_start"] for r in records if r["mjd_start"] is not None]
    if not mjds:
        return
    times = Time(mjds, format="mjd", scale="utc")
    iso = times.isot
    it = iter(range(len(mjds)))
    for r in records:
        if r["mjd_start"] is None:
            continue
        k = next(it)
        r["date_utc"] = iso[k]
        r["month_label"] = times[k].strftime("%b %Y")
        r["decimal_year"] = round(float(times[k].decimalyear), 4)


def _merge_static(rec: Dict[str, Any], static: Dict[str, Any], ra: float, dec: float) -> None:
    info = describe_from_static(static, ra, dec)
    rec.update(
        {
            "enriched": True,
            "wavelength_um": info["wavelength_um"],
            "bandwidth_um": info["bandwidth_um"],
            "pixel_x": info["pixel_x"],
            "pixel_y": info["pixel_y"],
            "on_detector": info["on_detector"],
            "distance_to_edge_px": info["distance_to_edge_px"],
            "psf_fwhm_arcsec": info["psf_fwhm_arcsec"],
            "flag_counts": info["flag_counts"],
            "mjd_obs": info["mjd_obs"],
            "mjd_avg": info["mjd_avg"],
            "date_obs": info["date_obs"],
            "pipeline_version": info["version"],
            "detector": info["detector"],
        }
    )
    avg = info["mjd_avg"]
    t = Time(avg, format="mjd", scale="utc")
    rec["date_utc"] = t.isot
    rec["month_label"] = t.strftime("%b %Y")
    rec["decimal_year"] = round(float(t.decimalyear), 4)


async def _enrich_one(rec: Dict[str, Any], ra: float, dec: float, sem: asyncio.Semaphore) -> None:
    async with sem:
        static = await load_frame_static(rec["access_url"])
    _merge_static(rec, static, ra, dec)


async def get_observations(
    ra: float,
    dec: float,
    radius_deg: float = 0.02,
    collections: Optional[Sequence[str]] = None,
    include_deep: bool = False,
    detector: Optional[int] = None,
    budget_s: float = 25.0,
) -> Dict[str, Any]:
    """All real SPHEREx spectral images whose footprint touches (ra, dec), time-ordered, with true
    wavelength at the target for every enriched frame. Raises UpstreamError only when nothing at all
    could be obtained and no stored real result exists."""
    available = await discover_collections()
    if collections is None:
        chosen = [c for c in available if not is_cube_collection(c) and (include_deep or not is_deep_collection(c))]
    else:
        chosen = [c for c in collections if c in available]
    if not chosen:
        chosen = [c for c in DEFAULT_COLLECTIONS]

    key = f"sia:{ra:.4f}:{dec:.4f}:{radius_deg:.4f}:{','.join(sorted(chosen))}"
    per_collection: List[Dict[str, Any]] = []
    rows_by_collection: Dict[str, List[Dict[str, str]]] = {}
    stale_used = False

    async def one(c: str) -> None:
        try:
            rows_by_collection[c] = await sia_query(c, ra, dec, radius_deg)
            per_collection.append({"collection": c, "release": release_label(c), "ok": True,
                                   "count": len(rows_by_collection[c])})
        except UpstreamError as exc:
            per_collection.append({"collection": c, "release": release_label(c), "ok": False,
                                   "error": str(exc), "count": 0})

    await asyncio.gather(*(one(c) for c in chosen))

    failed = [p for p in per_collection if not p["ok"]]
    if failed:
        # Use the last REAL result for the failed collections, if we ever stored one.
        for p in failed:
            stale = get_cache(f"{key}:{p['collection']}", allow_stale=True)
            if stale is not None:
                rows_by_collection[p["collection"]] = stale["rows"]
                p.update({"ok": True, "count": len(stale["rows"]), "stale_age_sec": stale.get("_age_sec")})
                stale_used = True
    for p in per_collection:
        if p["ok"] and p["collection"] in rows_by_collection and not p.get("stale_age_sec"):
            set_cache(f"{key}:{p['collection']}", "sia", p["collection"], {"rows": rows_by_collection[p["collection"]]})

    if not rows_by_collection:
        raise UpstreamError("The SPHEREx archive did not answer for any collection and no stored result exists")

    records: List[Dict[str, Any]] = []
    seen = set()
    for c, rows in rows_by_collection.items():
        for row in rows:
            rec = _record(row, c, ra, dec)
            if rec["plane_id"] in seen:
                continue
            seen.add(rec["plane_id"])
            if detector is not None and rec["detector"] != detector:
                continue
            records.append(rec)
    _add_dates(records)

    # Enrich with true metadata (two tiny range reads per frame, cached permanently).
    sem = asyncio.Semaphore(14)
    tasks = [asyncio.ensure_future(_enrich_one(r, ra, dec, sem)) for r in records]
    for t in tasks:
        _background.add(t)
        t.add_done_callback(_background.discard)
    if tasks:
        await asyncio.wait(tasks, timeout=budget_s)
    pending = 0
    enrich_errors = 0
    for rec, t in zip(records, tasks):
        if not t.done():
            pending += 1
        elif t.exception() is not None:
            enrich_errors += 1
            rec["enrich_error"] = str(t.exception())[:160]

    records.sort(key=lambda r: (r.get("mjd_avg") or r["mjd_start"] or 0.0))
    span = None
    if records:
        a = records[0].get("mjd_avg") or records[0]["mjd_start"]
        b = records[-1].get("mjd_avg") or records[-1]["mjd_start"]
        if a and b:
            span = round(b - a, 1)

    by_det = {d: sum(1 for r in records if r["detector"] == d) for d in range(1, 7)}
    return {
        "ra": ra,
        "dec": dec,
        "radius_deg": radius_deg,
        "count": len(records),
        "count_by_detector": by_det,
        "span_days": span,
        "collections": per_collection,
        "uses_stored_result": stale_used,
        "pending_enrichment": pending,
        "enrichment_errors": enrich_errors,
        "observations": records,
        "fetched_at": time.time(),
    }
