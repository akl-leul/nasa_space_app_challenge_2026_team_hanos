"""Real quick-look spectrum from the SPHEREx DR1 All-Sky Cube (HEALPix order 5, NESTED).

Each tile is a 512 x 512 x 102 FITS cube (about 107 MB for IMAGE, plus NHITS and FLAGS). We never
download a tile: for every one of the 102 channels we read only a small window of rows around the
target with an HTTP Range request on IRSA's anonymous S3 mirror.

The cube is STACKED over the survey, so it carries no time information and cannot show motion or
brightness change. ZODI is already subtracted. Channels 51 and 52 (next to the dichroic) are blank.
"""

from __future__ import annotations

import asyncio
import math
from typing import Any, Dict, List, Optional, Tuple

import hpgeom
import numpy as np
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS

from ..astro.units import MJY_SR_ARCSEC2_TO_UJY
from ..cache import get_cache, set_cache
from ..config import HIPS_CUBE_FOLDER, IRSA_HIPS_PROPERTIES, S3_SPHEREX_BASE
from .http import UpstreamError, fetch
from .s3_fits import BLOCK

CUBE_PIXEL_SOLID_ANGLE_ARCSEC2 = 41252.96125 * 3600.0**2 / 12288.0 / 512.0**2  # equal-area HEALPix: 165.9 arcsec^2
CUBE_PIXEL_ARCSEC = math.sqrt(CUBE_PIXEL_SOLID_ANGLE_ARCSEC2)
BLANK_CHANNELS = (51, 52)  # 1-based, per the user guide (BLANKCH keyword)


def tile_index(ra: float, dec: float) -> int:
    return int(hpgeom.angle_to_pixel(32, ra, dec, nest=True, lonlat=True, degrees=True))


def tile_path(ipix: int) -> str:
    return f"dr1/hips5_cube/{HIPS_CUBE_FOLDER}/Norder5/Dir{(ipix // 10000) * 10000}/Npix{ipix}_cube.fits"


async def _range(url: str, start: int, end: int) -> bytes:
    resp = await fetch(url, headers={"Range": f"bytes={start}-{end}"}, ok_status=(200, 206), timeout=60.0,
                       tries=4, allow_html=True)
    return resp.content


def _header_at(buf: bytes, offset: int) -> Tuple[fits.Header, int]:
    """Parse one header starting at ``offset``; returns (header, offset of the data that follows)."""
    i = offset
    while True:
        block = buf[i:i + BLOCK]
        if len(block) < BLOCK:
            raise ValueError("Header cut off; read more bytes")
        i += BLOCK
        if any(block[c:c + 8] == b"END     " for c in range(0, BLOCK, 80)):
            break
    return fits.Header.fromstring(buf[offset:i].decode("ascii", errors="replace")), i


def _data_len(h: fits.Header) -> int:
    n = abs(int(h["BITPIX"])) // 8
    for k in range(1, int(h["NAXIS"]) + 1):
        n *= int(h[f"NAXIS{k}"])
    return ((n + BLOCK - 1) // BLOCK) * BLOCK


def _sky_wcs(h: fits.Header) -> WCS:
    """2-axis HEALPix (HPX) sky WCS built from the cube header. The third axis is a WAVE-TAB lookup that
    needs the HDU list, and wavelengths come from the HiPS properties instead."""
    sky = fits.Header()
    sky["NAXIS"], sky["NAXIS1"], sky["NAXIS2"] = 2, h["NAXIS1"], h["NAXIS2"]
    sky["WCSAXES"] = 2
    for k in ("CRPIX1", "CRPIX2", "PC1_1", "PC1_2", "PC2_1", "PC2_2", "CDELT1", "CDELT2", "CUNIT1", "CUNIT2",
              "CTYPE1", "CTYPE2", "CRVAL1", "CRVAL2", "PV2_1", "PV2_2", "LONPOLE", "LATPOLE", "RADESYS"):
        if k in h:
            sky[k] = h[k]
    return WCS(sky)


async def cube_properties() -> Dict[str, Any]:
    cached = get_cache("hips:properties", max_age_sec=24 * 3600)
    if cached:
        return cached
    resp = await fetch(IRSA_HIPS_PROPERTIES, timeout=40.0, tries=4, allow_html=True)
    props: Dict[str, str] = {}
    for line in resp.text.splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            props[k.strip()] = v.strip()
    waves = [float(x) for x in props["data_cube_crval3_arr"].split()]
    out = {"wavelengths_um": waves, "depth": int(props["hips_cube_depth"]),
           "release_date": props.get("hips_release_date"), "title": props.get("obs_title"),
           "description": props.get("obs_description")}
    set_cache("hips:properties", "hips", "DR1", out)
    return out


def _circle_weights(shape, xc, yc, r, ss=5):
    ys, xs = np.indices(shape)
    offs = (np.arange(ss) + 0.5) / ss - 0.5
    w = np.zeros(shape)
    for dy in offs:
        for dx in offs:
            w += ((xs + dx - xc) ** 2 + (ys + dy - yc) ** 2) <= r * r
    return w / ss**2


async def extract_spectrum(ra: float, dec: float, aperture_px: float = 1.5, half: int = 6) -> Dict[str, Any]:
    """Cached by position: the cube is a fixed release, and each read costs about 200 range requests."""
    key = f"cube:{ra:.5f}:{dec:.5f}:{aperture_px}:{half}"
    cached = get_cache(key, max_age_sec=90 * 24 * 3600)
    if cached is not None:
        cached.pop("_age_sec", None)
        return cached
    result = await _extract_spectrum_uncached(ra, dec, aperture_px, half)
    set_cache(key, "allsky_cube", "DR1", result)
    return result


async def _extract_spectrum_uncached(ra: float, dec: float, aperture_px: float, half: int) -> Dict[str, Any]:
    props = await cube_properties()
    ipix = tile_index(ra, dec)
    path = tile_path(ipix)
    url = f"{S3_SPHEREX_BASE}/{path}"

    head = await _range(url, 0, 65535)
    primary, off = _header_at(head, 0)
    img_hdr, img_data = _header_at(head, off)
    depth, ny, nx = int(img_hdr["NAXIS3"]), int(img_hdr["NAXIS2"]), int(img_hdr["NAXIS1"])
    nhits_hdr_off = img_data + _data_len(img_hdr)
    nhits_head = await _range(url, nhits_hdr_off, nhits_hdr_off + 32767)
    nhits_hdr, nhits_rel = _header_at(nhits_head, 0)
    nhits_data = nhits_hdr_off + nhits_rel
    if depth != props["depth"]:
        raise UpstreamError("All-sky cube depth does not match the HiPS properties")

    wcs = _sky_wcs(img_hdr)
    x, y = wcs.all_world2pix(ra, dec, 0)
    x, y = float(x), float(y)
    if not (0 <= x < nx and 0 <= y < ny):
        raise UpstreamError(f"Target falls outside the HEALPix tile ({x:.1f}, {y:.1f})")
    y0, y1 = max(0, int(round(y)) - half), min(ny, int(round(y)) + half + 1)
    x0, x1 = max(0, int(round(x)) - half), min(nx, int(round(x)) + half + 1)
    rows = y1 - y0
    sem = asyncio.Semaphore(16)

    async def plane(base: int, p: int, dtype: str) -> np.ndarray:
        start = base + ((p * ny + y0) * nx) * 4
        async with sem:
            raw = await _range(url, start, start + rows * nx * 4 - 1)
        return np.frombuffer(raw, dtype=dtype).reshape(rows, nx)[:, x0:x1]

    imgs, hits = await asyncio.gather(
        asyncio.gather(*(plane(img_data, p, ">f4") for p in range(depth))),
        asyncio.gather(*(plane(nhits_data, p, ">i4") for p in range(depth))),
    )

    xc, yc = x - x0, y - y0
    k = CUBE_PIXEL_SOLID_ANGLE_ARCSEC2 * MJY_SR_ARCSEC2_TO_UJY
    ap = _circle_weights((rows, x1 - x0), xc, yc, aperture_px)
    ann = (_circle_weights((rows, x1 - x0), xc, yc, 5.0) - _circle_weights((rows, x1 - x0), xc, yc, 3.0)) > 0.5
    points: List[Dict[str, Any]] = []
    for p in range(depth):
        ch = p + 1
        im = imgs[p].astype(np.float64)
        wl = props["wavelengths_um"][p]
        blank = ch in BLANK_CHANNELS  # only the dichroic channels are blank by design; other gaps are reported below
        rec: Dict[str, Any] = {"channel_index": ch, "band": p // 17 + 1, "channel_in_band": p % 17 + 1,
                               "wavelength_um": wl, "is_blank": bool(blank)}
        if blank:
            rec.update(flux_ujy=None, error_ujy=None, surface_brightness_mjy_sr=None, n_hits=None, valid=False,
                       invalid_reason="blank channel next to the dichroic")
        else:
            good = np.isfinite(im)
            iy, ix = int(round(yc)), int(round(xc))
            inside = 0 <= iy < rows and 0 <= ix < (x1 - x0)
            n_hit = int(hits[p][iy, ix]) if inside else None
            centre = float(im[iy, ix]) if inside and good[iy, ix] else None
            a = ann & good
            if centre is None or not n_hit or a.sum() < 8:
                rec.update(flux_ujy=None, error_ujy=None, surface_brightness_mjy_sr=None, n_hits=n_hit,
                           valid=False,
                           invalid_reason="no valid data at the target pixel in this channel (masked or zero hits)")
            else:
                _, bkg, sig = sigma_clipped_stats(im[a], sigma=3.0, maxiters=5)
                wgt = ap * good
                n_ap = float(wgt.sum())
                net = float((wgt * (np.where(good, im, 0.0) - bkg)).sum())
                err = float(sig * math.sqrt(max(n_ap, 1.0)) * (1 + 1 / max(a.sum(), 1)) ** 0.5)
                rec.update(flux_ujy=round(net * k, 3), error_ujy=round(err * k, 3), valid=True,
                           surface_brightness_mjy_sr=round(centre, 5), background_mjy_sr=round(float(bkg), 5),
                           n_hits=n_hit)
        points.append(rec)

    n_valid = sum(1 for q in points if q.get("valid"))
    return {
        "source": "allsky",
        "valid_channels": n_valid,
        "tile": {"healpix_order": 5, "nested_index": ipix, "pixel_x": round(x, 2), "pixel_y": round(y, 2),
                 "pixel_scale_arcsec": round(CUBE_PIXEL_ARCSEC, 2), "path": path},
        "aperture": {"radius_px": aperture_px, "radius_arcsec": round(aperture_px * CUBE_PIXEL_ARCSEC, 1),
                     "annulus_px": [3.0, 5.0], "aperture_correction_applied": False},
        "points": points,
        "units": "uJy",
        "label": "stacked (DR1 All-Sky Cube): no time information",
        "warnings": [
            "Stacked over the whole survey: it cannot show motion or brightness change.",
            "ZODI is already subtracted in the cube.",
            "Channels 51 and 52, next to the dichroic, contain no data.",
            "Stripes can appear near bright emission lines such as helium 1.083 micron and Pa-alpha.",
            "Flux is an aperture flux; extended sources are underestimated.",
        ],
        "hips_release_date": props.get("release_date"),
    }
