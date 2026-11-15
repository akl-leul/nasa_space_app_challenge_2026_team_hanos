"""Cutouts read straight from IRSA's public S3 mirror with HTTP range requests.

IRSA's cutout service builds each cutout on demand (several seconds to minutes under load) and returns about 4 MB of
which 3.8 MB is the full ePSF table. A SPHEREx spectral image is a plain FITS file, so the same pixels can be read
directly: the IMAGE and VARIANCE rows that cover the window (about 0.5 MB each), the matching rows of the tile-compressed
FLAGS extension (one Rice tile per image row) and the single ePSF zone row that applies at the target. About 1.5 MB per
frame, from many small reads that run in parallel.

What comes out is the same record as the IRSA path (see ``irsa_cutout.assemble_cutout``): the same 58 x 58 pixel window
centred on the target, the same shifted WCS keywords (``CRPIX*``, ``CRPIX*A``, ``CRPIX*W``), the same flag names read
from the file's FLAGS header. The ZODI extension is not read (nothing here uses it) and the record says so.

Nothing is invented: every number is read from the file. If anything about the file is not as expected (another layout, a
missing extension, a read error) a ValueError / UpstreamError is raised and the caller falls back to the IRSA service.
"""

from __future__ import annotations

import asyncio
import io
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from astropy.io import fits
from astropy.wcs.utils import proj_plane_pixel_scales
from scipy.interpolate import RegularGridInterpolator

from ..astro.wcs_helper import sky_wcs, world_to_pixel0
from ..cache import get_cache, get_frame_static, set_cache, set_frame_static
from .http import UpstreamError, fetch
from .s3_fits import BLOCK, load_frame_static, s3_url

LAYOUT_VERSION = 1
MAX_HEAP_GAP = 2_000_000  # bytes of unrelated heap allowed between the compressed rows we need

_NUMPY_CODES = {"B": "u1", "I": ">i2", "J": ">i4", "K": ">i8", "E": ">f4", "D": ">f8"}


class Counter:
    """Counts the bytes actually transferred for one cutout."""

    def __init__(self) -> None:
        self.bytes = 0
        self.requests = 0


def _pad(n: int) -> int:
    return -(-n // BLOCK) * BLOCK


async def _get(url: str, start: int, length: int, acc: Counter) -> bytes:
    resp = await fetch(url, headers={"Range": f"bytes={start}-{start + length - 1}"}, ok_status=(200, 206),
                       timeout=45.0, tries=3, allow_html=True)
    if len(resp.content) > length:
        raise UpstreamError("The mirror ignored the byte range", url=url)
    acc.bytes += len(resp.content)
    acc.requests += 1
    return resp.content


def find_header_end(buf: bytes) -> Optional[int]:
    """Length in bytes (a multiple of 2880) of the header that starts at the beginning of ``buf``."""
    for i in range(0, len(buf) - BLOCK + 1, BLOCK):
        block = buf[i:i + BLOCK]
        for c in range(0, BLOCK, 80):
            if block[c:c + 8] == b"END     ":
                return i + BLOCK
    return None


async def _read_header(url: str, offset: int, acc: Counter, blocks: int = 6) -> Tuple[fits.Header, int]:
    n = blocks
    while True:
        buf = await _get(url, offset, n * BLOCK, acc)
        end = find_header_end(buf)
        if end is not None:
            return fits.Header.fromstring(buf[:end].decode("ascii", errors="replace")), end
        if n > 96:
            raise ValueError("No END card in the header")
        n *= 2


def _data_bytes(h: fits.Header) -> int:
    """Padded size of the data of one HDU (including the variable-length heap, PCOUNT)."""
    n = int(h.get("NAXIS", 0))
    if n == 0:
        return _pad(int(h.get("PCOUNT", 0) or 0))
    size = abs(int(h["BITPIX"])) // 8
    for k in range(1, n + 1):
        size *= int(h[f"NAXIS{k}"])
    return _pad(size + int(h.get("PCOUNT", 0) or 0))


def row_dtype(header: fits.Header) -> np.dtype:
    """numpy dtype of one row of a binary table, from its TFORMn / TTYPEn keywords (fixed-size columns only)."""
    fields: List[Any] = []
    for i in range(1, int(header["TFIELDS"]) + 1):
        tform = str(header[f"TFORM{i}"]).strip()
        digits = "".join(ch for ch in tform if ch.isdigit())
        code = tform.lstrip("0123456789")[:1]
        if code not in _NUMPY_CODES:
            raise ValueError(f"Column format {tform} is not supported")
        rep = int(digits) if digits else 1
        name = str(header[f"TTYPE{i}"])
        fields.append((name, _NUMPY_CODES[code]) if rep == 1 else (name, _NUMPY_CODES[code], (rep,)))
    dt = np.dtype(fields)
    if dt.itemsize != int(header["NAXIS1"]):
        raise ValueError("Row size does not match the table header")
    return dt


# ---------------------------------------------------------------- layout (where each extension sits in the file)

async def _layout(url: str, access_url: str, acc: Counter) -> Dict[str, Any]:
    """Byte positions of the extensions of one file. Position-independent, so it is cached with the frame's other
    static facts. Headers are read one after another because each tells where the next one starts."""
    key = f"{access_url}|layout{LAYOUT_VERSION}"
    cached = get_frame_static(key)
    if cached:
        return cached

    primary, plen = await _read_header(url, 0, acc, blocks=1)
    if int(primary.get("NAXIS", 0)) != 0:
        raise ValueError("Unexpected primary HDU")
    image, ilen = await _read_header(url, plen, acc, blocks=8)
    if image.get("EXTNAME") != "IMAGE" or int(image["BITPIX"]) != -32:
        raise ValueError("The IMAGE extension is not where or what it should be")
    nx, ny = int(image["NAXIS1"]), int(image["NAXIS2"])
    image_data_off = plen + ilen

    flags_hdr_off = image_data_off + _data_bytes(image)
    flags, flen = await _read_header(url, flags_hdr_off, acc, blocks=8)
    if flags.get("EXTNAME") != "FLAGS":
        raise ValueError("The FLAGS extension is not where it should be")
    if not (flags.get("ZIMAGE") and flags.get("ZCMPTYPE") == "RICE_1"
            and int(flags.get("ZTILE1", 0)) == nx and int(flags.get("ZTILE2", 0)) == 1):
        raise ValueError("FLAGS is not compressed as one Rice tile per image row")
    if int(flags["NAXIS1"]) != 8 or int(flags["NAXIS2"]) != ny:
        raise ValueError("Unexpected FLAGS table shape")
    flags_data_off = flags_hdr_off + flen
    theap = int(flags.get("THEAP", int(flags["NAXIS1"]) * int(flags["NAXIS2"])))

    var_hdr_off = flags_hdr_off + flen + _data_bytes(flags)
    var, vlen = await _read_header(url, var_hdr_off, acc, blocks=4)
    if var.get("EXTNAME") != "VARIANCE" or int(var["BITPIX"]) != -32 or int(var["NAXIS1"]) != nx or int(var["NAXIS2"]) != ny:
        raise ValueError("The VARIANCE extension is not where or what it should be")
    var_data_off = var_hdr_off + vlen

    # ZODI is not read; its size is the same as VARIANCE's, which is checked by finding EPSF right behind it
    epsf_hdr_off = var_data_off + _data_bytes(var) + vlen + _data_bytes(var)
    epsf, elen = await _read_header(url, epsf_hdr_off, acc, blocks=4)
    if epsf.get("EXTNAME") != "EPSF":
        zodi, zlen = await _read_header(url, var_data_off + _data_bytes(var), acc, blocks=4)
        epsf_hdr_off = var_data_off + _data_bytes(var) + zlen + _data_bytes(zodi)
        epsf, elen = await _read_header(url, epsf_hdr_off, acc, blocks=4)
        if epsf.get("EXTNAME") != "EPSF":
            raise ValueError("The EPSF extension was not found")
    dt = row_dtype(epsf)
    layout = {
        "nx": nx, "ny": ny,
        "image_data_off": image_data_off,
        "flags_header_text": flags.tostring(sep="\n", endcard=False, padding=False),
        "flags_data_off": flags_data_off,
        "flags_heap_off": flags_data_off + theap,
        "var_data_off": var_data_off,
        "epsf_data_off": epsf_hdr_off + elen,
        "epsf_rows": int(epsf["NAXIS2"]),
        "epsf_row_bytes": int(epsf["NAXIS1"]),
        "epsf_cols": [[n, str(dt[n].base.str), list(dt[n].shape)] for n in dt.names],
    }
    set_frame_static(key, layout)
    return layout


def _epsf_dtype(layout: Dict[str, Any]) -> np.dtype:
    return np.dtype([(n, s, tuple(shape)) if shape else (n, s) for n, s, shape in layout["epsf_cols"]])


# ---------------------------------------------------------------- the window

def cutout_window(header: fits.Header, ra: float, dec: float, size_deg: float) -> Tuple[int, int, int, int, float, float]:
    """The pixel window of the cutout: (x0, x1, y0, y1, target_x, target_y), 0-based, end exclusive.

    Same rule as IRSA's cutout service: a square of ``size / pixel scale`` pixels whose pixel centres lie within half
    that size of the target (clipped to the detector). The target position is in 0-based original detector pixels."""
    wcs = sky_wcs(header)
    xt, yt = world_to_pixel0(wcs, ra, dec)
    scale_deg = float(np.mean(proj_plane_pixel_scales(wcs.celestial)))
    n = max(8, int(round(size_deg / scale_deg)))
    nx, ny = int(header["NAXIS1"]), int(header["NAXIS2"])
    x0 = max(0, math.ceil(xt - n / 2.0))
    y0 = max(0, math.ceil(yt - n / 2.0))
    x1 = min(nx, math.ceil(xt - n / 2.0) + n)
    y1 = min(ny, math.ceil(yt - n / 2.0) + n)
    if x1 - x0 < 2 or y1 - y0 < 2:
        raise ValueError("The target is outside the detector")
    return x0, x1, y0, y1, xt, yt


def shifted_header(header: fits.Header, x0: int, y0: int, width: int, height: int) -> fits.Header:
    """The IMAGE header of the cutout: the window origin is subtracted from every reference pixel, like IRSA's service does."""
    h = header.copy()
    for suffix in ("", "A", "W"):
        if f"CRPIX1{suffix}" in h:
            h[f"CRPIX1{suffix}"] = float(h[f"CRPIX1{suffix}"]) - x0
        if f"CRPIX2{suffix}" in h:
            h[f"CRPIX2{suffix}"] = float(h[f"CRPIX2{suffix}"]) - y0
    h["NAXIS1"] = width
    h["NAXIS2"] = height
    return h


def wavelength_window(static: Dict[str, Any], x0: int, x1: int, y0: int, y1: int) -> Tuple[np.ndarray, np.ndarray]:
    """True wavelength and bandwidth (micron) of every pixel in the window, from the file's WCS-WAVE table
    (bilinear lookup in FITS 1-based detector pixels, as the WAVE-TAB keywords describe)."""
    tx, ty = np.array(static["x"], dtype=float), np.array(static["y"], dtype=float)
    xs = np.clip(np.arange(x0, x1) + 1.0, tx[0], tx[-1])
    ys = np.clip(np.arange(y0, y1) + 1.0, ty[0], ty[-1])
    yy, xx = np.meshgrid(ys, xs, indexing="ij")
    pts = np.stack([yy.ravel(), xx.ravel()], axis=-1)
    wl = RegularGridInterpolator((ty, tx), np.array(static["wl"], dtype=float))(pts).reshape(yy.shape)
    bw = RegularGridInterpolator((ty, tx), np.array(static["bw"], dtype=float))(pts).reshape(yy.shape)
    return wl.astype(np.float32), bw.astype(np.float32)


# ---------------------------------------------------------------- reading the planes

async def _read_float_rows(url: str, data_off: int, nx: int, y0: int, y1: int, x0: int, x1: int, acc: Counter) -> np.ndarray:
    row = nx * 4
    buf = await _get(url, data_off + y0 * row, (y1 - y0) * row, acc)
    return np.frombuffer(buf, dtype=">f4").reshape(y1 - y0, nx)[:, x0:x1].astype(np.float32)


def decode_flag_rows(flags_header: fits.Header, descriptors: np.ndarray, heap: bytes) -> np.ndarray:
    """Decode some rows of the Rice-compressed FLAGS extension.

    ``descriptors`` is an (n, 2) array of (compressed length, heap offset) for consecutive image rows and ``heap`` holds the
    bytes from the smallest offset on. They are wrapped into a small, valid compressed table that astropy decodes."""
    n = int(descriptors.shape[0])
    desc = descriptors.astype(np.int64).copy()
    base = int(desc[:, 1].min())
    desc[:, 1] -= base
    heap_len = int((desc[:, 0] + desc[:, 1]).max())
    h = flags_header.copy()
    h["NAXIS2"] = n
    h["ZNAXIS2"] = n
    h["PCOUNT"] = heap_len
    h["TFORM1"] = f"1PB({int(desc[:, 0].max())})"
    if "THEAP" in h:
        del h["THEAP"]
    payload = desc.astype(">i4").tobytes() + heap[:heap_len]
    payload += b"\0" * (_pad(len(payload)) - len(payload))
    primary = fits.PrimaryHDU().header.tostring(sep="", endcard=True, padding=True)
    ext = h.tostring(sep="", endcard=True, padding=True)
    with fits.open(io.BytesIO(primary.encode("ascii") + ext.encode("ascii") + payload), memmap=False) as hdul:
        return np.array(hdul[1].data, dtype=np.uint32)


async def _read_flag_rows(url: str, layout: Dict[str, Any], y0: int, y1: int, x0: int, x1: int, acc: Counter) -> np.ndarray:
    fh = fits.Header.fromstring(layout["flags_header_text"], sep="\n")
    raw = await _get(url, layout["flags_data_off"] + y0 * 8, (y1 - y0) * 8, acc)
    desc = np.frombuffer(raw, dtype=">i4").reshape(-1, 2)
    start = int(desc[:, 1].min())
    end = int((desc[:, 0] + desc[:, 1]).max())
    if end - start > MAX_HEAP_GAP:
        raise ValueError("The compressed flag rows are not close together in the file")
    heap = await _get(url, layout["flags_heap_off"] + start, end - start, acc)
    flags = await asyncio.to_thread(decode_flag_rows, fh, desc, heap)
    return flags[:, x0:x1]


# ---------------------------------------------------------------- the ePSF zone

_grid_jobs: Dict[str, "asyncio.Future[Dict[str, Any]]"] = {}


def parse_epsf_row(row: np.void) -> np.ndarray:
    return np.asarray(row["EPSF"], dtype=np.float32).reshape(33, 33)


async def _full_epsf_table(url: str, layout: Dict[str, Any], acc: Counter) -> np.ndarray:
    n, size = layout["epsf_rows"], layout["epsf_row_bytes"]
    buf = await _get(url, layout["epsf_data_off"], n * size, acc)
    return np.frombuffer(buf, dtype=_epsf_dtype(layout))


async def _zone_grid(url: str, layout: Dict[str, Any], key: str, acc: Counter) -> Dict[str, Any]:
    """Zone centres of one detector and pipeline version: read once from a whole ePSF table, then reused."""
    grid = get_cache(key, max_age_sec=1e12)
    if grid and len(grid["xc"]) == layout["epsf_rows"]:
        return grid
    task = _grid_jobs.get(key)
    if task is None or task.done() and task.exception() is not None:
        async def build() -> Dict[str, Any]:
            table = await _full_epsf_table(url, layout, acc)
            g = {"xc": [float(v) for v in table["XCENTER"]], "yc": [float(v) for v in table["YCENTER"]]}
            set_cache(key, "epsf_grid", "all", g)
            return g
        task = asyncio.ensure_future(build())
        _grid_jobs[key] = task
    return await asyncio.shield(task)


async def _epsf_zone(url: str, layout: Dict[str, Any], static: Dict[str, Any], detector: int,
                     xo: float, yo: float, acc: Counter) -> Dict[str, Any]:
    """The ePSF zone nearest to the target (0-based detector pixel (xo, yo)), as ``find_nearest_zone`` returns it."""
    key = f"epsf_grid:v{LAYOUT_VERSION}:{detector}:{static.get('version')}"
    grid = await _zone_grid(url, layout, key, acc)
    xc, yc = np.array(grid["xc"]), np.array(grid["yc"])
    k = int(np.argmin((xc - xo) ** 2 + (yc - yo) ** 2))
    size = layout["epsf_row_bytes"]
    raw = await _get(url, layout["epsf_data_off"] + k * size, size, acc)
    row = np.frombuffer(raw, dtype=_epsf_dtype(layout))[0]
    if abs(float(row["XCENTER"]) - xc[k]) > 0.5 or abs(float(row["YCENTER"]) - yc[k]) > 0.5:
        # this file's zones are not where the stored grid says: use this file's own table
        table = await _full_epsf_table(url, layout, acc)
        xc = np.asarray(table["XCENTER"], dtype=float)
        yc = np.asarray(table["YCENTER"], dtype=float)
        k = int(np.argmin((xc - xo) ** 2 + (yc - yo) ** 2))
        row = table[k]
    d = math.sqrt(float((xc[k] - xo) ** 2 + (yc[k] - yo) ** 2))
    names = row.dtype.names
    return {
        "zone_index": k,
        "zones_total": int(len(xc)),
        "x_center": float(xc[k]),
        "y_center": float(yc[k]),
        "cwave_um": float(row["CWAVE"]) if "CWAVE" in names else None,
        "neff_pixels": float(row["NEFF_MEAN"]) if "NEFF_MEAN" in names else None,
        "distance_px": d,
        "epsf": parse_epsf_row(row),
    }


# ---------------------------------------------------------------- the cutout

async def read_cutout_s3(access_url: str, ra: float, dec: float, size_deg: float) -> Dict[str, Any]:
    """The compact real cutout of one spectral image, read from the S3 mirror. Same record as the IRSA service path."""
    from .irsa_cutout import assemble_cutout  # shared with the IRSA path

    url = s3_url(access_url)
    acc = Counter()
    static = await load_frame_static(access_url)
    layout = await _layout(url, access_url, acc)
    header = fits.Header.fromstring(static["header_text"], sep="\n")
    x0, x1, y0, y1, xt, yt = cutout_window(header, ra, dec, size_deg)
    nx = layout["nx"]
    if (int(header["NAXIS1"]), int(header["NAXIS2"])) != (nx, layout["ny"]):
        raise ValueError("Header and layout disagree about the image size")
    detector = int(header["DETECTOR"])

    image, variance, flags, zone = await asyncio.gather(
        _read_float_rows(url, layout["image_data_off"], nx, y0, y1, x0, x1, acc),
        _read_float_rows(url, layout["var_data_off"], nx, y0, y1, x0, x1, acc),
        _read_flag_rows(url, layout, y0, y1, x0, x1, acc),
        _epsf_zone(url, layout, static, detector, xt, yt, acc),
    )
    cut_header = shifted_header(header, x0, y0, x1 - x0, y1 - y0)
    wl_map, bw_map = wavelength_window(static, x0, x1, y0, y1)
    rec = assemble_cutout(
        cut_header, static.get("version"), image, flags, variance, None,
        fits.Header.fromstring(layout["flags_header_text"], sep="\n"), wl_map, bw_map, "EPSF", zone, ra, dec)
    rec["meta"]["cutout_source"] = "S3 mirror range reads"
    rec["meta"]["zodi_included"] = False
    rec["bytes_read"] = acc.bytes
    rec["requests"] = acc.requests
    return rec
