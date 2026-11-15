"""Unit conversion for SPHEREx surface brightness.

IMAGE is in MJy/sr. A pixel with solid angle Omega (arcsec^2, from the Solid Angle Pixel Map or the
pixel WCS) holding surface brightness S (MJy/sr) has flux density
    F[uJy] = S * Omega * 23.5045
because 1 sr = 4.2545e10 arcsec^2 and 1 MJy = 1e12 uJy (the IRSA Source Discovery and Mosaic tutorials
use exactly this constant: mJy = MJy/sr * 23.5045 * pixelscale^2 / 1000).
"""

import astropy.units as u

MJY_SR_ARCSEC2_TO_UJY = 23.5044605
MJY_SR_TO_UJY_PER_ARCSEC2 = MJY_SR_ARCSEC2_TO_UJY  # backwards compatible name


def mjy_sr_to_ujy(surface_brightness_mjy_sr: float, solid_angle_arcsec2: float) -> float:
    return surface_brightness_mjy_sr * MJY_SR_ARCSEC2_TO_UJY * solid_angle_arcsec2


def mjy_sr_to_mjy(surface_brightness_mjy_sr: float, solid_angle_arcsec2: float) -> float:
    return mjy_sr_to_ujy(surface_brightness_mjy_sr, solid_angle_arcsec2) / 1000.0


def verify_conversion_with_astropy() -> bool:
    val = (1.0 * u.MJy / u.sr).to(u.uJy / (u.arcsec**2))
    return abs(val.value - MJY_SR_ARCSEC2_TO_UJY) < 1e-4
