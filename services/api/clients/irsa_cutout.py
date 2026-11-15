"""Real SPHEREx cutouts from IRSA's server-side cutout service, stored compactly.

A cutout is about 4 MB because every cutout carries the full 441-zone ePSF table (3.84 MB). We keep
only what the science needs: IMAGE, FLAGS, VARIANCE, ZODI, a per-pixel wavelength map, the full
IMAGE header (WCS incl. SIP, dates, flag counts) and the single ePSF zone that applies at the target.
That is a few tens of KB per frame.

Nothing is defaulted: if a keyword needed for science is missing the cutout is rejected.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
from typing import Any, Dict

import numpy as np
from astropy.io import fits

from ..astro.epsf import cutout_to_original_pixel, find_nearest_zone
from ..astro.flags import parse_flag_keywords, summarize_flags
from ..astro.wcs_helper import (
    header_from_text,
    pixel_solid_angle_arcsec2,
    sky_wcs,
    spectral_wcs,
    wavelength_map,
    world_to_pixel0,
)
from ..cache import get_cached_cutout, set_cached_cutout
from ..config import CUTOUTS_DIR
from .http import UpstreamError, fetch

_ibe_sem = asyncio.Semaphore(5)  # be gentle with the public archive


def cutout_id(access_url: str, ra: float, dec: float, size_deg: float) -> str:
    key = f"{access_url}|{ra:.5f}|{dec:.5f}|{size_deg:.4f}"
    return hashlib.sha1(key.encode()).hexdigest()[:24]


def _parse_mef(content: bytes, ra: float, dec: float) -> Dict[str, Any]:
    with fits.open(io.BytesIO(content), memmap=False) as hdul:
        names = [h.name for h in hdul]
        for need in ("IMAGE", "FLAGS", "VARIANCE", "ZODI", "WCS-WAVE"):
            if need not in names:
                raise ValueError(f"Cutout is missing the {need} extension")
        ih = hdul["IMAGE"].header
        for key in ("DETECTOR", "OBSID", "DATE-OBS", "MJD-AVG", "MJD-BEG", "MJD-END", "BUNIT"):
            if key not in ih:
                raise ValueError(f"IMAGE header is missing {key}")
        image = np.array(hdul["IMAGE"].data, dtype=np.float32)
        flags = np.array(hdul["FLAGS"].data, dtype=np.uint32)
        variance = np.array(hdul["VARIANCE"].data, dtype=np.float32)
        zodi = np.array(hdul["ZODI"].data, dtype=np.float32)
        flag_names = parse_flag_keywords(hdul["FLAGS"].header)

        wcs = sky_wcs(ih)
        tx, ty = world_to_pixel0(wcs, ra, dec)
        wave_wcs = spectral_wcs(ih, hdul)
        wl_map, bw_map = wavelength_map(wave_wcs, image.shape)

        epsf_meta: Dict[str, Any] = {}
        epsf = np.zeros((33, 33), dtype=np.float32)
        epsf_name = "EPSF" if "EPSF" in names else ("PSF" if "PSF" in names else None)
        if epsf_name == "EPSF":
            xo, yo = cutout_to_original_pixel(tx, ty, ih)
            zone = find_nearest_zone(xo, yo, hdul["EPSF"].data)
            epsf = zone.pop("epsf")
            epsf_meta = zone | {"original_pixel_x": round(xo, 2), "original_pixel_y": round(yo, 2)}

        ix = int(np.clip(round(tx), 0, image.shape[1] - 1))
        iy = int(np.clip(round(ty), 0, image.shape[0] - 1))
        meta = {
            "detector": int(ih["DETECTOR"]),
            "obs_id": str(ih["OBSID"]),
            "date_obs": str(ih["DATE-OBS"]),
            "mjd_avg": float(ih["MJD-AVG"]),
            "mjd_beg": float(ih["MJD-BEG"]),
            "mjd_end": float(ih["MJD-END"]),
            "bunit": str(ih["BUNIT"]),
            "psf_fwhm_arcsec": float(ih["PSF_FWHM"]) if "PSF_FWHM" in ih else None,
            "pipeline_version": str(hdul[0].header.get("VERSION", "")) or None,
            "shape": [int(image.shape[0]), int(image.shape[1])],
            "target_pixel": [round(tx, 3), round(ty, 3)],
            "target_inside": bool(0 <= tx < image.shape[1] and 0 <= ty < image.shape[0]),
            "wavelength_um": round(float(wl_map[iy, ix]), 5),
            "bandwidth_um": round(float(bw_map[iy, ix]), 5),
            "wavelength_span_um": [round(float(wl_map.min()), 5), round(float(wl_map.max()), 5)],
            "pixel_solid_angle_arcsec2": round(pixel_solid_angle_arcsec2(wcs), 4),
            "flags": summarize_flags(flags, flag_names),
            "flag_counts_full_image": {k[5:]: int(v) for k, v in ih.items() if k.startswith("L2 N_")},
            "epsf": epsf_meta,
            "psf_extension": epsf_name,
            "header_text": ih.tostring(sep="\n", endcard=False, padding=False),
        }
        return {
            "image": image, "flags": flags, "variance": variance, "zodi": zodi,
            "wavelength": wl_map, "epsf": epsf, "meta": meta,
        }


def _load_npz(path) -> Dict[str, np.ndarray]:
    with np.load(path) as z:
        return {k: z[k] for k in z.files}


async def get_cutout(access_url: str, ra: float, dec: float, size_deg: float) -> Dict[str, Any]:
    """Return the compact real cutout for one spectral image (cached on disk)."""
    cid = cutout_id(access_url, ra, dec, size_deg)
    cached = get_cached_cutout(cid)
    if cached and (CUTOUTS_DIR / cached["compact_path"]).exists():
        data = _load_npz(CUTOUTS_DIR / cached["compact_path"])
        data["meta"] = cached["meta"]
        data.update(cutout_id=cid, raw_bytes=cached["raw_bytes"], compact_bytes=cached["compact_bytes"],
                    is_cached=True)
        return data

    url = f"{access_url}?center={ra:.6f},{dec:.6f}&size={size_deg:.5f}"
    async with _ibe_sem:
        resp = await fetch(url, timeout=150.0, tries=6, validate=lambda r: r.content[:6] == b"SIMPLE",
                           allow_html=False)
    try:
        parsed = await asyncio.to_thread(_parse_mef, resp.content, ra, dec)
    except Exception as exc:
        raise UpstreamError(f"Cutout could not be read: {exc}", url=url)

    path = CUTOUTS_DIR / f"{cid}.npz"
    np.savez_compressed(
        path, image=parsed["image"], flags=parsed["flags"], variance=parsed["variance"],
        zodi=parsed["zodi"], wavelength=parsed["wavelength"], epsf=parsed["epsf"],
    )
    compact = path.stat().st_size
    set_cached_cutout(cid, access_url, ra, dec, size_deg, path.name, parsed["meta"], len(resp.content), compact)
    parsed.update(cutout_id=cid, raw_bytes=len(resp.content), compact_bytes=compact, is_cached=False)
    return parsed
