"""Frame-by-frame tracking of one object through the real SPHEREx spectral images of one detector.

For every frame (true date, true wavelength) the object is measured (flux, centroid), compared with
its proper-motion prediction, and checked against Gaia reference stars so that a shifted WCS is not
mistaken for motion. From the measured positions a linear motion fit is made; from frames of the same
wavelength a brightness-change test is made. Every number in the Evidence Card is computed here.

Jobs run in the background (a cutout takes seconds to download); snapshots can be polled while frames
arrive. Results are built from cached real cutouts, so a repeated request is instant.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import time
from urllib.parse import quote
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .astro.coordinates import propagate_proper_motion
from .astro.photometry import measure_frame
from .astro.render import common_grid, grid_pixel_of
from .astro.wcs_helper import header_from_text, pixel0_to_world, sky_wcs, world_to_pixel0
from .clients.gaia import query_gaia_sources
from .clients.http import UpstreamError
from .clients.irsa_cutout import get_cutout
from .clients.observations import get_observations
from .config import MAX_RUNNING_JOBS

_jobs: Dict[str, "TrackJob"] = {}
_tasks: set = set()


@dataclass
class TrackParams:
    ra: float                # centre of every cutout (position at pos_epoch)
    dec: float
    size_deg: float = 0.1
    detector: int = 4
    pmra: float = 0.0        # mas/yr, includes cos(dec) like SIMBAD
    pmdec: float = 0.0
    pos_epoch: float = 2026.0
    include_deep: bool = False
    name: Optional[str] = None

    def key(self) -> str:
        raw = f"{self.ra:.5f}|{self.dec:.5f}|{self.size_deg:.4f}|{self.detector}|{self.pmra:.2f}|{self.pmdec:.2f}|{self.pos_epoch}|{self.include_deep}"
        return hashlib.sha1(raw.encode()).hexdigest()[:16]


@dataclass
class TrackJob:
    params: TrackParams
    id: str = ""
    status: str = "starting"          # starting | running | done | error
    error: Optional[str] = None
    total: int = 0
    done: int = 0
    failed: int = 0
    started: float = field(default_factory=time.time)
    finished: Optional[float] = None
    frames: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    obs_info: Dict[str, Any] = field(default_factory=dict)
    refs: List[Dict[str, Any]] = field(default_factory=list)
    ref_error: Optional[str] = None


def expected_position(p: TrackParams, decimal_year: float) -> Tuple[float, float]:
    return propagate_proper_motion(p.ra, p.dec, p.pmra, p.pmdec, p.pos_epoch, decimal_year)


def _offsets_arcsec(ra: float, dec: float, ra0: float, dec0: float) -> Tuple[float, float]:
    """(east, north) offset of (ra, dec) from (ra0, dec0) in arcsec."""
    east = ((ra - ra0 + 180.0) % 360.0 - 180.0) * math.cos(math.radians(dec0)) * 3600.0
    north = (dec - dec0) * 3600.0
    return east, north


async def _reference_alignment(cut: Dict[str, Any], wcs, refs: List[Dict[str, Any]], p: TrackParams,
                               year: float) -> Optional[Dict[str, Any]]:
    """Median astrometric shift of Gaia reference stars in this frame (measured - predicted), arcsec."""
    meta = cut["meta"]
    ny, nx = cut["image"].shape
    shifts = []
    for r in refs:
        if r["pmra_cosdec"] is None:
            continue
        ra_t, dec_t = propagate_proper_motion(r["ra_ref"], r["dec_ref"], r["pmra_cosdec"], r["pmdec"], r["ref_epoch"], year)
        x, y = world_to_pixel0(wcs, ra_t, dec_t)
        if not (8 <= x < nx - 8 and 8 <= y < ny - 8):
            continue
        m = measure_frame(cut["image"], cut["variance"], cut["flags"], cut["epsf"], x, y,
                          meta["pixel_solid_angle_arcsec2"], meta["psf_fwhm_arcsec"])
        if not m.get("usable") or not m.get("detected") or m["centroid_shift_px"] > 1.5 or m["snr"] < 8:
            continue
        mra, mdec = pixel0_to_world(wcs, m["centroid_x"], m["centroid_y"])
        e, n = _offsets_arcsec(mra, mdec, ra_t, dec_t)
        shifts.append((e, n))
    if len(shifts) < 3:
        return {"n_refs": len(shifts), "usable": False}
    a = np.array(shifts)
    med = np.median(a, axis=0)
    scatter = float(np.sqrt(np.sum((np.median(np.abs(a - med), axis=0) * 1.4826) ** 2)))
    return {"n_refs": len(shifts), "usable": True, "shift_east_arcsec": float(med[0]),
            "shift_north_arcsec": float(med[1]), "scatter_arcsec": scatter}


async def process_frame(job: TrackJob, idx: int, obs: Dict[str, Any], sem: asyncio.Semaphore) -> None:
    p = job.params
    base = {
        "index": idx, "obs_id": obs["obs_id"], "plane_id": obs["plane_id"], "release": obs["release"],
        "collection": obs["collection"], "detector": obs["detector"], "access_url": obs["access_url"],
        "date_utc": obs.get("date_utc"), "month_label": obs.get("month_label"),
        "mjd": obs.get("mjd_avg"), "decimal_year": obs.get("decimal_year"),
        "wavelength_um": obs.get("wavelength_um"), "bandwidth_um": obs.get("bandwidth_um"),
        "exposure_s": obs.get("exposure_s"), "psf_fwhm_arcsec": obs.get("psf_fwhm_arcsec"),
    }
    try:
        async with sem:
            cut = await get_cutout(obs["access_url"], p.ra, p.dec, p.size_deg)
        meta = cut["meta"]
        wcs = sky_wcs(header_from_text(meta["header_text"]))
        year = obs["decimal_year"]
        exp_ra, exp_dec = expected_position(p, year)
        tx, ty = world_to_pixel0(wcs, exp_ra, exp_dec)
        grid_wcs, shape = common_grid(p.ra, p.dec, p.size_deg)
        m = measure_frame(cut["image"], cut["variance"], cut["flags"], cut["epsf"], tx, ty,
                          meta["pixel_solid_angle_arcsec2"], meta["psf_fwhm_arcsec"])
        frame = dict(base, status="ok", wavelength_um=meta["wavelength_um"], bandwidth_um=meta["bandwidth_um"],
                     cutout_bytes_compact=cut["compact_bytes"], cutout_shape=meta["shape"],
                     masked_percent=meta["flags"]["masked_percent"],
                     frame_png=f"/api/frame.png?url={quote(obs['access_url'], safe='')}&ra={p.ra:.6f}&dec={p.dec:.6f}&size={p.size_deg:.5f}")
        ex_gx, ex_gy = grid_pixel_of(grid_wcs, exp_ra, exp_dec, shape)
        frame["expected"] = {"ra": exp_ra, "dec": exp_dec, "grid_x": round(ex_gx, 2), "grid_y": round(ex_gy, 2)}
        if not m.get("usable"):
            frame["measurement"] = {"usable": False, "reason": m.get("reason")}
        else:
            mra, mdec = pixel0_to_world(wcs, m["centroid_x"], m["centroid_y"])
            align = await _reference_alignment(cut, wcs, job.refs, p, year) if job.refs else None
            e_m, n_m = _offsets_arcsec(mra, mdec, exp_ra, exp_dec)
            corr_e, corr_n = e_m, n_m
            if align and align.get("usable"):
                corr_e -= align["shift_east_arcsec"]
                corr_n -= align["shift_north_arcsec"]
            gx, gy = grid_pixel_of(grid_wcs, mra, mdec, shape)
            err = m["centroid_error_arcsec"]
            if align and align.get("usable"):
                err = math.hypot(err, align["scatter_arcsec"] / math.sqrt(max(align["n_refs"], 1)))
            frame["measurement"] = {k: m[k] for k in (
                "usable", "detected", "flux_ujy", "flux_error_ujy", "snr", "flux_quality", "flux_is_lower_limit",
                "upper_limit_3sigma_ujy", "centroid_shift_px", "aperture_correction", "unmasked_aperture_fraction")}
            frame["position"] = {
                "measured_ra": mra, "measured_dec": mdec, "grid_x": round(gx, 2), "grid_y": round(gy, 2),
                "offset_from_expected_arcsec": [round(e_m, 3), round(n_m, 3)],
                "offset_after_reference_alignment_arcsec": [round(corr_e, 3), round(corr_n, 3)],
                "error_arcsec": round(err, 3), "alignment": align,
            }
        job.frames[idx] = frame
    except Exception as exc:  # a frame can fail; the job reports it, never hides it
        job.frames[idx] = dict(base, status="failed", error=str(exc)[:200])
        job.failed += 1
    finally:
        job.done += 1


async def _run(job: TrackJob) -> None:
    p = job.params
    try:
        job.status = "running"
        obs = await get_observations(p.ra, p.dec, radius_deg=0.02, detector=p.detector,
                                     include_deep=p.include_deep, budget_s=120.0)
        frames = [o for o in obs["observations"]
                  if o.get("on_detector") and o.get("footprint_covers_target") is not False
                  and (o.get("distance_to_edge_px") or 0) >= 6 and o.get("wavelength_um")]
        frames.sort(key=lambda o: o["mjd_avg"])
        job.obs_info = {"collections": obs["collections"], "frames_in_footprint": obs["count"],
                        "frames_used": len(frames), "span_days": obs["span_days"],
                        "uses_stored_result": obs["uses_stored_result"]}
        job.total = len(frames)
        try:
            job.refs = await query_gaia_sources(p.ra, p.dec, p.size_deg * 0.65, target_epoch=2026.0, max_rows=60, g_limit=15.5)
            job.refs = [r for r in job.refs if r["has_proper_motion"] and
                        math.hypot(*_offsets_arcsec(r["ra"], r["dec"], p.ra, p.dec)) > 25.0]
        except UpstreamError as exc:
            job.ref_error = str(exc)
        sem = asyncio.Semaphore(5)
        await asyncio.gather(*(process_frame(job, i, o, sem) for i, o in enumerate(frames)))
        job.status = "done"
    except UpstreamError as exc:
        job.status = "error"
        job.error = f"The SPHEREx archive is busy: {exc}"
    except Exception as exc:
        job.status = "error"
        job.error = str(exc)[:300]
    finally:
        job.finished = time.time()


class TooBusy(RuntimeError):
    """Too many measurement jobs are running at once; the caller should retry shortly."""


MAX_STORED_JOBS = 64


def _evict_old_jobs() -> None:
    """Finished jobs keep their frames in memory; keep only the most recent ones."""
    if len(_jobs) < MAX_STORED_JOBS:
        return
    finished = sorted((j for j in _jobs.values() if j.status in ("done", "error")), key=lambda j: j.finished or 0.0)
    for j in finished[: len(_jobs) - MAX_STORED_JOBS + 8]:
        _jobs.pop(j.id, None)


def start_job(p: TrackParams) -> TrackJob:
    key = p.key()
    job = _jobs.get(key)
    if job and job.status in ("starting", "running", "done"):
        return job
    running = sum(1 for j in _jobs.values() if j.status in ("starting", "running"))
    if running >= MAX_RUNNING_JOBS:
        raise TooBusy(f"{running} measurements are already running")
    _evict_old_jobs()
    job = TrackJob(params=p, id=key)
    _jobs[key] = job
    t = asyncio.ensure_future(_run(job))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return job


# ---------------------------------------------------------------- analysis of measured frames

def _wls_line(t: np.ndarray, y: np.ndarray, sig: np.ndarray) -> Optional[Dict[str, float]]:
    if len(t) < 4 or np.ptp(t) < 0.15:
        return None
    w = 1.0 / np.maximum(sig, 1e-3) ** 2
    A = np.vstack([np.ones_like(t), t - t.mean()]).T
    W = np.diag(w)
    cov = np.linalg.inv(A.T @ W @ A)
    beta = cov @ A.T @ W @ y
    resid = y - A @ beta
    chi2 = float(np.sum(w * resid**2))
    chi2_null = float(np.sum(w * (y - np.sum(w * y) / np.sum(w)) ** 2))
    dof = max(len(t) - 2, 1)
    scale = max(1.0, math.sqrt(chi2 / dof))  # inflate errors when scatter exceeds the formal errors
    return {"intercept": float(beta[0]), "slope": float(beta[1]), "slope_err": float(math.sqrt(cov[1, 1]) * scale),
            "chi2": chi2, "dof": dof, "chi2_null": chi2_null, "error_scale": scale, "t_mean": float(t.mean())}


def analyse_motion(job: TrackJob) -> Dict[str, Any]:
    pts = []
    for f in job.frames.values():
        pos = f.get("position")
        meas = f.get("measurement", {})
        if f.get("status") == "ok" and pos and meas.get("detected") and meas.get("snr", 0) >= 5:
            e_obs, n_obs = pos["offset_after_reference_alignment_arcsec"]
            # position of the measurement relative to the fixed field centre
            e_exp, n_exp = _offsets_arcsec(f["expected"]["ra"], f["expected"]["dec"], job.params.ra, job.params.dec)
            pts.append((f["decimal_year"], e_exp + e_obs, n_exp + n_obs, pos["error_arcsec"], f))
    usable = [f for f in job.frames.values() if f.get("status") == "ok" and (f.get("measurement") or {}).get("usable")]
    snrs = [f["measurement"]["snr"] for f in usable]
    out: Dict[str, Any] = {"frames_used": len(pts), "frames_total": len(job.frames), "usable_frames": len(usable),
                           "detected_frames": len(pts),
                           "median_snr": round(float(np.median(snrs)), 1) if snrs else None}
    if len(usable) == 0:
        out["status"] = "insufficient"
        out["explanation"] = "No frame gave a usable measurement at the expected position."
        return out
    if len(pts) < 8 or len(pts) < 0.5 * len(usable):
        out["status"] = "not_detected"
        out["explanation"] = (f"The target is detected (signal-to-noise of at least 5) at its expected position in only "
                              f"{len(pts)} of {len(usable)} usable frames of this detector, so no motion can be fitted from "
                              "single frames. It may be too faint at these wavelengths: try the other detectors or the "
                              "shift-and-add stack.")
        return out
    t = np.array([p[0] for p in pts])
    e = np.array([p[1] for p in pts])
    n = np.array([p[2] for p in pts])
    s = np.array([max(p[3], 0.3) for p in pts])  # 0.3 arcsec systematic floor
    fe, fn = _wls_line(t, e, s), _wls_line(t, n, s)
    if not fe or not fn:
        out["status"] = "insufficient"
        out["explanation"] = "The frames cover too short a time span to fit a motion."
        return out
    pm_e, pm_n = fe["slope"] * 1000.0, fn["slope"] * 1000.0          # mas/yr
    sig_e, sig_n = fe["slope_err"] * 1000.0, fn["slope_err"] * 1000.0
    total = math.hypot(pm_e, pm_n)
    sigma = math.sqrt((pm_e * sig_e) ** 2 + (pm_n * sig_n) ** 2) / total if total > 0 else max(sig_e, sig_n)
    significance = total / sigma if sigma > 0 else 0.0
    exp = (job.params.pmra, job.params.pmdec)
    dev = math.hypot(pm_e - exp[0], pm_n - exp[1])
    dev_sigma = dev / math.hypot(sig_e, sig_n)
    exp_total = math.hypot(*exp)
    if exp_total > 1000.0 and dev_sigma > 5.0:
        # For a target with a well known fast motion, S/N >= 5 peaks that do not follow it are noise or other sources
        out["status"] = "not_detected"
        out["explanation"] = (f"Peaks were found near the expected position, but they do not follow the known motion of "
                              f"{exp_total / 1000.0:.1f} arcsec per year (they differ by {dev_sigma:.0f} sigma), so they are "
                              "probably noise or other sources and not the target. It may be too faint at these wavelengths: "
                              "try the other detectors.")
        return out
    out.update({
        "status": "measured",
        "pm_east_mas_yr": round(pm_e, 1), "pm_north_mas_yr": round(pm_n, 1),
        "pm_error_mas_yr": [round(sig_e, 1), round(sig_n, 1)],
        "pm_total_mas_yr": round(total, 1), "pm_total_sigma": round(significance, 1),
        "expected_pm_mas_yr": [round(exp[0], 1), round(exp[1], 1)],
        "difference_from_expected_sigma": round(dev_sigma, 1),
        "time_span_years": round(float(np.ptp(t)), 3),
        "points": [{"decimal_year": float(a), "east_arcsec": float(b), "north_arcsec": float(c), "error_arcsec": float(d)}
                   for a, b, c, d in zip(t, e, n, s)],
    })
    return out


def analyse_brightness(job: TrackJob, motion: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Brightness change from frames of (nearly) the same wavelength, so the spectrum is not mistaken for change."""
    if motion and motion.get("status") == "not_detected":
        return {"status": "not_detected", "clean_frames": 0, "saturated_or_flagged_frames": 0,
                "explanation": "The target is not reliably detected in this detector's frames, so its brightness is not tested."}
    pts = []
    for f in job.frames.values():
        m = f.get("measurement", {})
        # S/N >= 5 only: near the noise floor the flux errors are underestimated and a scatter test finds false variability
        if f.get("status") == "ok" and m.get("detected") and m.get("snr", 0) >= 5 and not m.get("flux_is_lower_limit"):
            pts.append((f["wavelength_um"], f["decimal_year"], m["flux_ujy"], m["flux_error_ujy"], f["index"]))
    saturated = sum(1 for f in job.frames.values() if f.get("measurement", {}).get("flux_is_lower_limit"))
    out: Dict[str, Any] = {"clean_frames": len(pts), "saturated_or_flagged_frames": saturated}
    if saturated and not pts:
        out["status"] = "saturated"
        out["explanation"] = ("Every detection has a flagged or saturated core, so fluxes are lower limits and "
                              "brightness change is not tested. Positions are still measured.")
        return out
    pts.sort()
    bins: List[List[tuple]] = []
    for pt in pts:
        if bins and pt[0] <= bins[-1][0][0] * 1.02:
            bins[-1].append(pt)
        else:
            bins.append([pt])
    results = []
    for b in bins:
        if len(b) < 3 or (max(x[1] for x in b) - min(x[1] for x in b)) < 20 / 365.25:
            continue
        f = np.array([x[2] for x in b])
        e = np.maximum(np.array([x[3] for x in b]), 1e-9)
        w = 1.0 / e**2
        mean = float(np.sum(w * f) / np.sum(w))
        chi2 = float(np.sum(w * (f - mean) ** 2))
        dof = len(b) - 1
        results.append({
            "wavelength_um": round(float(np.mean([x[0] for x in b])), 4), "n_frames": len(b),
            "mean_flux_ujy": round(mean, 2), "chi2_reduced": round(chi2 / dof, 2),
            "peak_to_peak_percent": round(100.0 * float(np.ptp(f)) / mean, 1) if mean else None,
            "frame_indices": [x[4] for x in b],
        })
    out["bins_tested"] = len(results)
    out["bins"] = results
    flagged = [r for r in results if r["chi2_reduced"] > 3.0]
    out["status"] = "tested" if results else "insufficient"
    out["variable_bins"] = flagged
    if not results:
        out["explanation"] = ("No wavelength bin has three or more clean detections spread over at least 20 days; "
                              "SPHEREx revisits a wavelength roughly once per survey.")
    return out


def light_curve(job: TrackJob) -> List[Dict[str, Any]]:
    rows = []
    for f in sorted(job.frames.values(), key=lambda x: x["index"]):
        m = f.get("measurement") or {}
        if f.get("status") == "ok" and m.get("usable"):
            rows.append({"index": f["index"], "date_utc": f["date_utc"], "month_label": f["month_label"],
                         "decimal_year": f["decimal_year"], "wavelength_um": f["wavelength_um"],
                         "flux_ujy": m["flux_ujy"], "flux_error_ujy": m["flux_error_ujy"],
                         "detected": m["detected"], "is_lower_limit": m["flux_is_lower_limit"],
                         "upper_limit_3sigma_ujy": m["upper_limit_3sigma_ujy"]})
    return rows


def evidence_card(job: TrackJob, motion: Dict[str, Any], bright: Dict[str, Any]) -> Dict[str, Any]:
    """Claim levels follow the project rules: observed change -> candidate; never 'discovery'."""
    checks = []
    aligned = [f for f in job.frames.values() if (f.get("position") or {}).get("alignment", {}) and f["position"]["alignment"].get("usable")]
    checks.append({"check": "Gaia reference-star alignment",
                   "result": f"{len(aligned)} of {len(job.frames)} frames aligned with at least 3 reference stars"
                   if job.refs else f"not performed ({job.ref_error or 'no usable Gaia reference stars in the field'})"})
    checks.append({"check": "Bad-pixel masking from FLAGS", "result": "bit 21 (SOURCE) never masked; other bits masked from file headers"})
    checks.append({"check": "Same-detector comparison", "result": f"all frames are detector {job.params.detector}; wavelength differs between frames and is shown per frame"})
    level, summary = "no significant change", "No significant motion or brightness change was measured."
    if motion.get("status") == "not_detected":
        level = "target not reliably detected"
        summary = motion["explanation"]
    elif motion.get("status") == "measured":
        mv = motion["pm_total_mas_yr"] / 1000.0
        if motion["pm_total_sigma"] >= 5:
            level = "observed change"
            expected = math.hypot(*motion["expected_pm_mas_yr"]) / 1000.0
            summary = (f"Measured position motion of {mv:.2f} arcsec/yr ({motion['pm_total_sigma']:.0f} sigma) over "
                       f"{motion['time_span_years']:.2f} yr. The SIMBAD proper motion is {expected:.2f} arcsec/yr "
                       f"(difference {motion['difference_from_expected_sigma']:.1f} sigma). Candidate mover; needs verification.")
    if bright.get("variable_bins"):
        top = max(bright["variable_bins"], key=lambda r: r["chi2_reduced"])
        level = "observed change"
        summary += (f" Brightness differs between epochs at {top['wavelength_um']:.2f} micron "
                    f"(reduced chi-square {top['chi2_reduced']}, peak-to-peak {top['peak_to_peak_percent']}%). "
                    "Candidate variable; needs verification.")
    return {"claim_level": level, "summary": summary, "checks_performed": checks,
            "reminder": "Differences between images are not proof of an astrophysical change; an independent confirmation is required."}


def snapshot(job: TrackJob, include_frames: bool = True) -> Dict[str, Any]:
    frames = [job.frames[i] for i in sorted(job.frames)]
    p = job.params
    grid_wcs, shape = common_grid(p.ra, p.dec, p.size_deg)
    out: Dict[str, Any] = {
        "job_id": job.id, "status": job.status, "error": job.error,
        "total": job.total, "done": job.done, "failed": job.failed,
        "elapsed_s": round((job.finished or time.time()) - job.started, 1),
        "params": {"ra": p.ra, "dec": p.dec, "size_deg": p.size_deg, "detector": p.detector,
                   "pmra": p.pmra, "pmdec": p.pmdec, "pos_epoch": p.pos_epoch, "name": p.name},
        "grid": {"width_px": shape[1], "height_px": shape[0], "pixel_scale_arcsec": 3.075,
                 "center_x": (shape[1] - 1) / 2.0, "center_y": (shape[0] - 1) / 2.0, "orientation": "north up, east left"},
        "observations": job.obs_info,
        "reference_stars": {"count": len(job.refs), "error": job.ref_error},
    }
    if include_frames:
        out["frames"] = frames
    motion = analyse_motion(job)
    bright = analyse_brightness(job, motion)
    out["motion"] = motion
    out["brightness"] = bright
    out["light_curve"] = light_curve(job)
    out["evidence_card"] = evidence_card(job, motion, bright)
    return out
