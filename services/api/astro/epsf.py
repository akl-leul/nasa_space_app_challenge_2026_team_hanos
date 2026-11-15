"""Effective PSF (ePSF) helpers for DR1/QR3 spectral images (EPSF binary table, one row per zone).

Zone grids are 21 x 21 for detectors 1, 2, 4, 5, 6 and 11 x 41 for detector 3. Nothing here
hard-codes zone counts: the nearest zone centre is found from the XCENTER/YCENTER columns.
Each ePSF is 33 x 33, oversampled by 5 relative to the native pixels (header OVSMPX/OVSMPY).
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import numpy as np


def cutout_to_original_pixel(x_cutout0: float, y_cutout0: float, header) -> Tuple[float, float]:
    """0-based cutout pixel -> 0-based pixel in the original 2040x2040 image.

    IRSA: ``xpix_orig = 1 + xpix_cutout - CRPIX1A`` where xpix_cutout is the 0-based (Astropy) value and
    CRPIX1A is the FITS 1-based keyword. The result is 0-based, like the XCTR/XCENTER zone coordinates.
    """
    if "CRPIX1A" not in header or "CRPIX2A" not in header:
        raise KeyError("CRPIX1A/CRPIX2A missing: cannot map the cutout back to the detector")
    return 1.0 + x_cutout0 - float(header["CRPIX1A"]), 1.0 + y_cutout0 - float(header["CRPIX2A"])


def find_nearest_zone(x_orig0: float, y_orig0: float, epsf_table) -> Dict[str, Any]:
    names = list(epsf_table.columns.names)
    xc = np.asarray(epsf_table["XCENTER"], dtype=float)
    yc = np.asarray(epsf_table["YCENTER"], dtype=float)
    d2 = (xc - x_orig0) ** 2 + (yc - y_orig0) ** 2
    k = int(np.argmin(d2))
    stamp = np.asarray(epsf_table["EPSF"][k], dtype=np.float32).reshape(33, 33)
    return {
        "zone_index": k,
        "zones_total": int(len(xc)),
        "x_center": float(xc[k]),
        "y_center": float(yc[k]),
        "cwave_um": float(epsf_table["CWAVE"][k]) if "CWAVE" in names else None,
        "neff_pixels": float(epsf_table["NEFF_MEAN"][k]) if "NEFF_MEAN" in names else None,
        "distance_px": float(np.sqrt(d2[k])),
        "epsf": stamp,
    }


def enclosed_fraction(epsf: np.ndarray, radius_native_px: float, oversample: int = 5) -> Optional[float]:
    """Fraction of the ePSF flux inside a circular aperture of the given native-pixel radius."""
    total = float(np.nansum(epsf))
    if not np.isfinite(total) or total <= 0:
        return None
    n = epsf.shape[0]
    c = (n - 1) / 2.0
    yy, xx = np.indices(epsf.shape)
    inside = (xx - c) ** 2 + (yy - c) ** 2 <= (radius_native_px * oversample) ** 2
    return float(np.nansum(np.where(inside, epsf, 0.0)) / total)
