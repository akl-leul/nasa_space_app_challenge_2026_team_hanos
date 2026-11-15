"""Aperture photometry and centroiding on real SPHEREx cutouts (native pixels).

* Bad pixels come from the FLAGS bits (never SOURCE). Masked pixels inside the aperture are
  excluded and the flux is scaled by the unmasked fraction; if too few pixels survive the
  measurement is reported as unusable, not guessed.
* Flux: sum of (surface brightness - local annulus background) over the aperture, times the pixel
  solid angle, converted with 1 MJy/sr * 1 arcsec^2 = 23.5045 uJy, then corrected to total flux with
  the ePSF enclosed fraction of the applicable zone.
* Errors: VARIANCE in the aperture plus the scatter of the background annulus. If a frame has no
  usable variance the error comes from the annulus alone. No nominal percentage is ever assumed.
* Centroid: windowed centre of mass iterated around the expected position, with the photon-limit
  uncertainty sigma_psf / SNR.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

import numpy as np
from astropy.stats import sigma_clipped_stats

from .epsf import enclosed_fraction
from .flags import build_bad_pixel_mask, build_relaxed_mask
from .units import MJY_SR_ARCSEC2_TO_UJY

NATIVE_PIXEL_ARCSEC = 6.15


def _circle_weights(shape, xc: float, yc: float, r: float, ss: int = 7) -> np.ndarray:
    ys, xs = np.indices(shape)
    offs = (np.arange(ss) + 0.5) / ss - 0.5
    w = np.zeros(shape, dtype=float)
    for dy in offs:
        for dx in offs:
            w += ((xs + dx - xc) ** 2 + (ys + dy - yc) ** 2) <= r * r
    return w / (ss * ss)


def measure_frame(
    image: np.ndarray,
    variance: np.ndarray,
    flags: np.ndarray,
    epsf: Optional[np.ndarray],
    x_expected: float,
    y_expected: float,
    pixel_solid_angle_arcsec2: float,
    psf_fwhm_arcsec: Optional[float],
    aperture_radius_px: float = 2.0,
    annulus_inner_px: float = 4.0,
    annulus_outer_px: float = 7.0,
    max_shift_px: float = 2.5,
) -> Dict[str, Any]:
    ny, nx = image.shape
    finite = np.isfinite(image)
    image = np.where(finite, image, 0.0)  # NaN * 0 is NaN: zero-fill, the masks below exclude these pixels
    variance = np.where(np.isfinite(variance), variance, 0.0)
    bad = build_bad_pixel_mask(flags) | ~finite          # strict: used for background and clean photometry
    good = ~bad
    relaxed_good = ~(build_relaxed_mask(flags) | ~finite)  # flagged-but-finite pixels allowed (saturated stars)

    # --- local background from the annulus around the expected position
    ann_w = _circle_weights(image.shape, x_expected, y_expected, annulus_outer_px) - _circle_weights(
        image.shape, x_expected, y_expected, annulus_inner_px
    )
    ann_pix = (ann_w > 0.5) & good
    n_ann = int(ann_pix.sum())
    if n_ann < 12:
        return {"usable": False, "reason": f"Too few unmasked background pixels ({n_ann}); use a larger cutout"}
    _, bkg, ann_sigma = sigma_clipped_stats(image[ann_pix], sigma=3.0, maxiters=5)
    bkg = float(bkg)
    ann_sigma = float(ann_sigma)

    # --- iterated windowed centroid
    xc, yc = float(x_expected), float(y_expected)
    yy, xx = np.indices(image.shape)
    for _ in range(4):
        win = ((xx - xc) ** 2 + (yy - yc) ** 2 <= 3.0**2) & relaxed_good
        v = np.clip(image - bkg, 0.0, None) * win
        tot = float(v.sum())
        if tot <= 0:
            break
        xc, yc = float((v * xx).sum() / tot), float((v * yy).sum() / tot)
    shift = float(np.hypot(xc - x_expected, yc - y_expected))

    # --- aperture photometry at the measured centroid
    ap_w = _circle_weights(image.shape, xc, yc, aperture_radius_px)
    area = float(ap_w.sum())
    k = pixel_solid_angle_arcsec2 * MJY_SR_ARCSEC2_TO_UJY
    enc = enclosed_fraction(epsf, aperture_radius_px) if epsf is not None and np.nansum(epsf) > 0 else None
    corr = 1.0 / enc if enc and enc > 0.2 else 1.0

    quality = "clean"
    use_good = good
    ap_good_w = ap_w * use_good
    frac_good = float(ap_good_w.sum() / area) if area > 0 else 0.0
    if frac_good < 0.6:
        # The source's own light flags (and overflows) its core: typical for very bright stars.
        # Measure from flagged-but-finite pixels and report it as a LOWER LIMIT, never as a clean flux.
        use_good = relaxed_good
        ap_good_w = ap_w * use_good
        frac_good = float(ap_good_w.sum() / area) if area > 0 else 0.0
        quality = "lower_limit_flagged_or_saturated"
        if frac_good < 0.3:
            return {"usable": False, "reason": f"Only {frac_good:.0%} of the aperture has finite pixels",
                    "centroid_x": xc, "centroid_y": yc}
    net = float((ap_good_w * (image - bkg)).sum()) / frac_good  # MJy/sr summed over pixels

    var_ok = np.isfinite(variance) & (variance > 0)
    if var_ok[ap_good_w > 0].any():
        var_sum = float((ap_good_w**2 * np.where(var_ok, variance, ann_sigma**2)).sum()) / (frac_good**2)
    else:
        var_sum = float((ap_good_w**2).sum()) * ann_sigma**2 / (frac_good**2)
    bkg_err = ann_sigma / np.sqrt(max(n_ann, 1)) * area
    sigma_sb = float(np.sqrt(var_sum + bkg_err**2))

    flux = net * k * corr
    err = sigma_sb * k * corr
    snr = flux / err if err > 0 else 0.0

    fwhm_px = (psf_fwhm_arcsec / NATIVE_PIXEL_ARCSEC) if psf_fwhm_arcsec else 1.2
    sigma_psf_px = fwhm_px / 2.3548
    pos_err_px = sigma_psf_px / max(snr, 1.0)
    pos_err_px = float(max(pos_err_px, 0.02))

    detected = bool(snr >= 3.0 and shift <= max_shift_px)
    return {
        "usable": True,
        "detected": detected,
        "centroid_x": xc,
        "centroid_y": yc,
        "centroid_shift_px": round(shift, 3),
        "centroid_error_arcsec": round(pos_err_px * pixel_solid_angle_arcsec2**0.5, 3),
        "flux_quality": quality,
        "flux_is_lower_limit": quality != "clean",
        "flux_ujy": float(flux),
        "flux_error_ujy": float(err),
        "upper_limit_3sigma_ujy": float(3.0 * err),
        "snr": float(snr),
        "background_MJy_sr": bkg,
        "background_scatter_MJy_sr": ann_sigma,
        "aperture_radius_px": aperture_radius_px,
        "aperture_correction": round(float(corr), 4),
        "unmasked_aperture_fraction": round(frac_good, 3),
    }
