"""WCS helpers for SPHEREx spectral images (sky WCS with SIP, spectral WCS key 'W')."""

from __future__ import annotations

import warnings
from typing import Tuple

import numpy as np
from astropy.io import fits
from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_area


def header_from_text(text: str) -> fits.Header:
    return fits.Header.fromstring(text, sep="\n")


def sky_wcs(header: fits.Header) -> WCS:
    """Primary (1-based, SIP) sky WCS. SIP coefficients are kept: they matter at the pixel level."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", AstropyWarning)
        return WCS(header)


def spectral_wcs(header: fits.Header, hdulist: fits.HDUList) -> WCS:
    """Spectral WCS (WAVE-TAB lookup in the WCS-WAVE extension). SIP must be off for this one."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", AstropyWarning)
        w = WCS(header, fobj=hdulist, key="W")
    w.sip = None
    return w


def wavelength_map(wave_wcs: WCS, shape: Tuple[int, int]) -> Tuple[np.ndarray, np.ndarray]:
    """True wavelength and bandwidth (micron) for every pixel of an image of ``shape`` (ny, nx)."""
    ny, nx = shape
    yy, xx = np.indices((ny, nx))
    wl, bw = wave_wcs.all_pix2world(xx.ravel(), yy.ravel(), 0)
    return wl.reshape(ny, nx).astype(np.float32), bw.reshape(ny, nx).astype(np.float32)


def pixel_solid_angle_arcsec2(wcs: WCS) -> float:
    """Solid angle of one pixel at the reference position from the sky WCS (arcsec^2)."""
    return float(proj_plane_pixel_area(wcs.celestial) * 3600.0 ** 2)


def world_to_pixel0(wcs: WCS, ra: float, dec: float) -> Tuple[float, float]:
    x, y = wcs.all_world2pix(ra, dec, 0)
    return float(x), float(y)


def pixel0_to_world(wcs: WCS, x: float, y: float) -> Tuple[float, float]:
    ra, dec = wcs.all_pix2world(x, y, 0)
    return float(ra), float(dec)
