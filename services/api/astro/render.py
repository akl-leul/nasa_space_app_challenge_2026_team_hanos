"""Common sky grid, reprojection and the documented display stretch.

Every frame of a sequence is reprojected onto ONE tangent-plane grid centred on the target, with
north up and east to the left, so that stars hold still and real motion is visible when frames
are blinked or played. Bad pixels (FLAGS) and areas outside the detector are transparent, never
filled with invented values.
"""

from __future__ import annotations

import io
import warnings
from typing import Any, Dict, Optional, Tuple

import numpy as np
from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import WCS
from PIL import Image
from reproject import reproject_interp

from .flags import build_bad_pixel_mask, build_relaxed_mask
from .wcs_helper import header_from_text, sky_wcs

DISPLAY_PIXSCALE_ARCSEC = 3.075  # half of the native 6.15 arcsec pixel


def common_grid(ra: float, dec: float, size_deg: float,
                pixscale_arcsec: float = DISPLAY_PIXSCALE_ARCSEC) -> Tuple[WCS, Tuple[int, int]]:
    n = int(round(size_deg * 3600.0 / pixscale_arcsec))
    n = max(16, n | 1)  # odd so the target is exactly at the central pixel
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2.0, (n + 1) / 2.0]
    w.wcs.cdelt = [-pixscale_arcsec / 3600.0, pixscale_arcsec / 3600.0]  # east to the left
    w.wcs.cunit = ["deg", "deg"]
    return w, (n, n)


def reproject_frame(cutout: Dict[str, Any], grid_wcs: WCS, shape: Tuple[int, int], strict: bool = False) -> np.ndarray:
    """Cutout IMAGE (MJy/sr) on the common grid; masked pixels become NaN.

    strict=False (viewer): only pixels that are not trustworthy at all are removed, so the bright, bloom-flagged
    core of a saturated star is still shown. strict=True (stacks and differences): every FLAGS bad bit is masked."""
    meta = cutout["meta"]
    header = header_from_text(meta["header_text"])
    mask = build_bad_pixel_mask(cutout["flags"]) if strict else build_relaxed_mask(cutout["flags"])
    data = np.where(mask | ~np.isfinite(cutout["image"]), np.nan, cutout["image"]).astype(np.float32)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", AstropyWarning)
        out, _ = reproject_interp((data, sky_wcs(header)), grid_wcs, shape_out=shape, order="bilinear")
    return out.astype(np.float32)


def robust_stats(arr: np.ndarray) -> Tuple[float, float]:
    v = arr[np.isfinite(arr)]
    if v.size < 8:
        return 0.0, 1.0
    med = float(np.median(v))
    mad = float(np.median(np.abs(v - med))) * 1.4826
    return med, (mad if mad > 0 else float(np.std(v)) or 1.0)


def render_png(arr: np.ndarray, *, invert: bool = False, lo_sigma: float = -2.0,
               hi_sigma: Optional[float] = None, asinh_scale: float = 8.0) -> Tuple[bytes, Dict[str, Any]]:
    """Background-subtracted, noise-normalised asinh stretch (documented in the response headers).

    value = (pixel - median) / (1.4826 * MAD), clipped to [lo_sigma, hi_sigma], then
    asinh(asinh_scale * t) / asinh(asinh_scale). hi_sigma defaults to the 99.7th percentile (at least 10).
    North is up (array row 0 is the northern edge), east is left.
    """
    med, sig = robust_stats(arr)
    z = (arr - med) / sig
    finite = np.isfinite(z)
    if hi_sigma is None:
        hi_sigma = max(10.0, float(np.percentile(z[finite], 99.7))) if finite.any() else 10.0
    t = np.clip((z - lo_sigma) / (hi_sigma - lo_sigma), 0.0, 1.0)
    s = np.arcsinh(asinh_scale * t) / np.arcsinh(asinh_scale)
    if invert:
        s = 1.0 - s
    gray = (np.nan_to_num(s, nan=0.0) * 255.0).astype(np.uint8)
    alpha = np.where(finite, 255, 0).astype(np.uint8)
    rgba = np.dstack([gray, gray, gray, alpha])
    img = Image.fromarray(np.flipud(rgba), mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), {
        "stretch": "asinh",
        "background_median_MJy_sr": round(med, 6),
        "noise_sigma_MJy_sr": round(sig, 6),
        "lo_sigma": lo_sigma,
        "hi_sigma": round(float(hi_sigma), 2),
        "asinh_scale": asinh_scale,
        "inverted": invert,
        "orientation": "north up, east left",
    }


def render_signed_png(arr: np.ndarray, *, sigma_clip: float = 8.0, asinh_scale: float = 4.0) -> Tuple[bytes, Dict[str, Any]]:
    """Difference images: zero is mid-grey, brighter than zero is lighter, fainter is darker.

    value = pixel / (1.4826 * MAD about the median), clipped to +-sigma_clip, then asinh stretched."""
    finite = np.isfinite(arr)
    v = arr[finite]
    sig = float(np.median(np.abs(v - np.median(v))) * 1.4826) if v.size > 8 else 1.0
    sig = sig if sig > 0 else (float(np.std(v)) or 1.0)
    z = np.clip(arr / sig, -sigma_clip, sigma_clip) / sigma_clip
    s_ = np.arcsinh(asinh_scale * np.abs(z)) / np.arcsinh(asinh_scale) * np.sign(z)
    gray = ((np.nan_to_num(s_, nan=0.0) * 0.5 + 0.5) * 255.0).astype(np.uint8)
    alpha = np.where(finite, 255, 0).astype(np.uint8)
    img = Image.fromarray(np.flipud(np.dstack([gray, gray, gray, alpha])), mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), {"stretch": "signed asinh", "noise_sigma_MJy_sr": round(sig, 6), "clip_sigma": sigma_clip,
                            "mid_grey_is_zero": True, "orientation": "north up, east left"}


def subtract_background(arr: np.ndarray) -> np.ndarray:
    med, _ = robust_stats(arr)
    return arr - med


def grid_pixel_of(grid_wcs: WCS, ra: float, dec: float, shape: Tuple[int, int]) -> Tuple[float, float]:
    """(x right, y down) pixel in the rendered PNG for a sky position."""
    x, y = grid_wcs.all_world2pix(ra, dec, 0)
    return float(x), float(shape[0] - 1 - y)
