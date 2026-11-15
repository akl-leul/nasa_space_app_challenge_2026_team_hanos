"""Cheap metadata for a SPHEREx spectral image using HTTP range reads on IRSA's public S3 mirror.

A full spectral image is about 65 MB and even a small IRSA cutout is about 4 MB (almost all of it
the 441-zone ePSF table). To list frames with their TRUE wavelength at the target, date, detector,
pixel position and flag counts we only need two tiny pieces of the file:

* the first 64 KB: primary header and the IMAGE header (WCS, DATE-OBS, MJD-*, DETECTOR, ``L2 N_*``)
* the last 8 KB: the WCS-WAVE lookup table (per-pixel wavelength and bandwidth)

Everything here is computed from the real files. Nothing is estimated from the band range.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from scipy.interpolate import RegularGridInterpolator

from ..cache import get_frame_static, set_frame_static
from ..config import S3_SPHEREX_BASE
from .http import UpstreamError, fetch

IBE_PREFIX = "/ibe/data/spherex/"
BLOCK = 2880
HEAD_BYTES = 65536
TAIL_BYTES = 8640

# Table 16 / header MSKN keywords: bits that make a pixel unusable for photometry.
# SOURCE (21) is intentionally absent: it marks pixels mapped to a known source.


def s3_url(access_url: str) -> str:
    """Map an IRSA on-premises URL to its anonymous S3 mirror URL."""
    idx = access_url.find(IBE_PREFIX)
    if idx < 0:
        raise ValueError(f"Not an IRSA SPHEREx IBE URL: {access_url}")
    return f"{S3_SPHEREX_BASE}/{access_url[idx + len(IBE_PREFIX):]}"


async def _range(url: str, *, start: Optional[int] = None, end: Optional[int] = None,
                 suffix: Optional[int] = None) -> Tuple[bytes, Optional[int]]:
    if suffix is not None:
        rng = f"bytes=-{suffix}"
    else:
        rng = f"bytes={start}-{end}"
    resp = await fetch(url, headers={"Range": rng}, ok_status=(200, 206), timeout=60.0, tries=4,
                       allow_html=True)
    total = None
    cr = resp.headers.get("content-range")
    if cr and "/" in cr:
        try:
            total = int(cr.rsplit("/", 1)[1])
        except ValueError:
            total = None
    return resp.content, total


def _split_headers(buf: bytes, count: int) -> list:
    """Parse ``count`` consecutive HDU headers (no data skipping needed for the primary: NAXIS=0)."""
    headers = []
    offset = 0
    for _ in range(count):
        end = None
        i = offset
        while i < len(buf):
            block = buf[i:i + BLOCK]
            if len(block) < BLOCK:
                raise ValueError("Header block cut off; read more bytes")
            for c in range(0, BLOCK, 80):
                if block[c:c + 8] == b"END     ":
                    end = i + BLOCK
                    break
            i += BLOCK
            if end is not None:
                break
        if end is None:
            raise ValueError("END card not found in header bytes")
        headers.append(fits.Header.fromstring(buf[offset:end].decode("ascii", errors="replace")))
        offset = end
    return headers


@dataclass
class SpectralTable:
    x: np.ndarray            # control points along x (FITS 1-based pixel coordinates)
    y: np.ndarray            # control points along y
    wavelength_um: np.ndarray  # shape (ny, nx)
    bandwidth_um: np.ndarray   # shape (ny, nx)

    def at(self, x1: float, y1: float) -> Tuple[float, float]:
        """Wavelength and bandwidth (micron) at FITS 1-based pixel (x1, y1)."""
        xc = float(np.clip(x1, self.x[0], self.x[-1]))
        yc = float(np.clip(y1, self.y[0], self.y[-1]))
        wl = RegularGridInterpolator((self.y, self.x), self.wavelength_um)([[yc, xc]])[0]
        bw = RegularGridInterpolator((self.y, self.x), self.bandwidth_um)([[yc, xc]])[0]
        return float(wl), float(bw)


def parse_wcs_wave_tail(tail: bytes) -> SpectralTable:
    pos = tail.rfind(b"XTENSION= 'BINTABLE'")
    if pos < 0:
        raise ValueError("WCS-WAVE extension not found in file tail")
    hdr = _split_headers(tail[pos:], 1)[0]
    # data begins after the header blocks
    hdr_len = 0
    i = pos
    while True:
        block = tail[i:i + BLOCK]
        hdr_len += BLOCK
        i += BLOCK
        if any(block[c:c + 8] == b"END     " for c in range(0, BLOCK, 80)):
            break
    data = tail[pos + hdr_len: pos + hdr_len + int(hdr["NAXIS1"])]

    def count(tform: str) -> int:
        digits = "".join(ch for ch in str(tform) if ch.isdigit())
        return int(digits) if digits else 1

    nx_ctrl = count(hdr["TFORM1"])  # control points along x
    ny_ctrl = count(hdr["TFORM2"])  # control points along y (detector 3 is 9 x 14, not square)
    off = 0
    x = np.frombuffer(data[off: off + 4 * nx_ctrl], dtype=">i4").astype(float)
    off += 4 * nx_ctrl
    y = np.frombuffer(data[off: off + 4 * ny_ctrl], dtype=">i4").astype(float)
    off += 4 * ny_ctrl
    n_vals = 2 * nx_ctrl * ny_ctrl
    vals = np.frombuffer(data[off: off + 4 * n_vals], dtype=">f4").astype(float)
    vals = vals.reshape(ny_ctrl, nx_ctrl, 2)  # numpy order: [iy, ix, (wavelength, bandwidth)]
    return SpectralTable(x=x, y=y, wavelength_um=vals[..., 0], bandwidth_um=vals[..., 1])


def flag_counts_from_header(image_header) -> Dict[str, int]:
    """Counts of flagged pixels from the ``HIERARCH L2 N_*`` header keywords (real, per image)."""
    counts: Dict[str, int] = {}
    for key in image_header.keys():
        if key.startswith("L2 N_"):
            counts[key[5:]] = int(image_header[key])
    return counts


async def load_frame_static(access_url: str) -> Dict[str, Any]:
    """Position-independent facts about one frame (IMAGE header + wavelength table), cached forever."""
    cached = get_frame_static(access_url)
    if cached:
        return cached
    url = s3_url(access_url)
    (head_bytes, total), (tail_bytes, total2) = await asyncio.gather(
        _range(url, start=0, end=HEAD_BYTES - 1),
        _range(url, suffix=TAIL_BYTES),
    )
    primary, image_hdr = _split_headers(head_bytes, 2)
    table = parse_wcs_wave_tail(tail_bytes)
    static = {
        "access_url": access_url,
        "file_bytes": total or total2,
        "version": primary.get("VERSION"),
        "header_text": image_hdr.tostring(sep="\n", endcard=False, padding=False),
        "x": table.x.tolist(),
        "y": table.y.tolist(),
        "wl": table.wavelength_um.tolist(),
        "bw": table.bandwidth_um.tolist(),
    }
    set_frame_static(access_url, static)
    return static


def describe_from_static(static: Dict[str, Any], ra: float, dec: float) -> Dict[str, Any]:
    """True per-frame facts at (ra, dec) computed from the cached real headers (no network)."""
    image_hdr = fits.Header.fromstring(static["header_text"], sep="\n")
    table = SpectralTable(
        x=np.array(static["x"]), y=np.array(static["y"]),
        wavelength_um=np.array(static["wl"]), bandwidth_um=np.array(static["bw"]),
    )
    wcs = WCS(image_hdr)
    x0, y0 = wcs.all_world2pix(ra, dec, 0)
    x0, y0 = float(x0), float(y0)
    nx = int(image_hdr.get("NAXIS1", 2040))
    ny = int(image_hdr.get("NAXIS2", 2040))
    on_detector = (0 <= x0 < nx) and (0 <= y0 < ny)
    edge_px = float(min(x0, y0, nx - 1 - x0, ny - 1 - y0))
    wl, bw = table.at(x0 + 1.0, y0 + 1.0)
    return {
        "file_bytes": static.get("file_bytes"),
        "version": static.get("version"),
        "detector": int(image_hdr["DETECTOR"]),
        "obs_id": image_hdr.get("OBSID"),
        "date_obs": image_hdr.get("DATE-OBS"),
        "mjd_obs": float(image_hdr["MJD-OBS"]),
        "mjd_avg": float(image_hdr["MJD-AVG"]),
        "mjd_beg": float(image_hdr["MJD-BEG"]),
        "mjd_end": float(image_hdr["MJD-END"]),
        "psf_fwhm_arcsec": float(image_hdr["PSF_FWHM"]) if "PSF_FWHM" in image_hdr else None,
        "bunit": image_hdr.get("BUNIT"),
        "pixel_x": round(x0, 2),
        "pixel_y": round(y0, 2),
        "on_detector": bool(on_detector),
        "distance_to_edge_px": round(edge_px, 1),
        "wavelength_um": round(wl, 5),
        "bandwidth_um": round(bw, 5),
        "flag_counts": flag_counts_from_header(image_hdr),
    }


async def describe_frame(access_url: str, ra: float, dec: float) -> Dict[str, Any]:
    static = await load_frame_static(access_url)
    return describe_from_static(static, ra, dec)
