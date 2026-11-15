"""FLAGS handling for SPHEREx spectral images.

Bit names come from each file's FLAGS header (``MSKNnnnn`` name, ``MSKDnnnn`` description). The
table below is only the documented fallback (Explanatory Supplement Table 16 / the IRSA data
overview tutorial) and is used when a header lacks the keywords.

Bit 21 is SOURCE ("pixel mapped to a known source"). Most pixels carry it. It is NEVER a defect and
NEVER a "good pixel" marker, so it is excluded from the bad-pixel mask and from the "usable" test.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

import numpy as np

DEFAULT_FLAG_BITS: Dict[int, str] = {
    0: "TRANSIENT", 1: "OVERFLOW", 2: "SUR_ERROR", 6: "NONFUNC", 7: "DICHROIC", 9: "MISSING_DATA",
    10: "HOT", 11: "COLD", 12: "FULLSAMPLE", 14: "PHANMISS", 15: "NONLINEAR", 17: "PERSIST",
    19: "OUTLIER", 20: "CROSSTALK", 21: "SOURCE", 22: "GHOST", 23: "GHOST_FPA", 24: "GHOST_EXT",
    25: "STREAK", 26: "BLOOM", 27: "SNOWBALL", 28: "HALO",
}

# Bits that make a pixel unreliable for photometry/centroiding.
# Excluded on purpose: 12 FULLSAMPLE (informational: full sample history exists),
# 21 SOURCE (known source), 7 DICHROIC (low efficiency but calibrated; recorded, not masked).
BAD_BITS = (0, 1, 2, 6, 9, 10, 11, 14, 15, 17, 19, 20, 22, 23, 24, 25, 26, 27, 28)
SOURCE_BIT = 21

# Tier 2 ("hard") bad bits: the pixel value itself is not trustworthy at all. Used for centroiding of
# very bright, saturated sources, where TRANSIENT / SUR_ERROR / BLOOM / HALO flags are raised by the
# source's own light on pixels that still carry measurable signal.
HARD_BAD_BITS = (2, 6, 9, 10, 11, 14, 15, 19)


def parse_flag_keywords(header) -> Dict[int, str]:
    """Bit names read from the FLAGS header; falls back to the documented table."""
    bits: Dict[int, str] = {}
    if header is not None:
        for key, value in header.items():
            if str(key).startswith("MSKN"):
                try:
                    bits[int(str(key)[4:])] = str(value).strip()
                except ValueError:
                    continue
    return bits or dict(DEFAULT_FLAG_BITS)


def bad_bit_mask(bit_names: Optional[Dict[int, str]] = None) -> int:
    names = bit_names or DEFAULT_FLAG_BITS
    mask = 0
    for b in BAD_BITS:
        if b in names and b != SOURCE_BIT:
            mask |= 1 << b
    return mask


def build_bad_pixel_mask(flags_array: np.ndarray, bit_names: Optional[Dict[int, str]] = None) -> np.ndarray:
    """True where a pixel must be excluded. Bit 21 (SOURCE) is never part of the mask."""
    return (flags_array.astype(np.uint32) & np.uint32(bad_bit_mask(bit_names))) != 0


def build_relaxed_mask(flags_array: np.ndarray, bit_names: Optional[Dict[int, str]] = None) -> np.ndarray:
    """True only where the pixel value is unusable even for locating a saturated source."""
    names = bit_names or DEFAULT_FLAG_BITS
    mask = 0
    for b in HARD_BAD_BITS:
        if b in names:
            mask |= 1 << b
    # SUR_ERROR (2) is raised on the cores of bright stars together with OVERFLOW (NaN pixels).
    # Pixels with real, finite values are kept; non-finite pixels are removed by the caller.
    mask &= ~(1 << 2)
    return (flags_array.astype(np.uint32) & np.uint32(mask)) != 0


def summarize_flags(flags_array: np.ndarray, bit_names: Optional[Dict[int, str]] = None) -> Dict[str, Any]:
    names = bit_names or DEFAULT_FLAG_BITS
    flags_u32 = flags_array.astype(np.uint32)
    total = int(flags_array.size)
    bad = build_bad_pixel_mask(flags_array, names)
    counts = {}
    for bit, name in names.items():
        c = int(((flags_u32 & np.uint32(1 << bit)) != 0).sum())
        if c:
            counts[name] = c
    return {
        "total_pixels": total,
        "masked_pixels": int(bad.sum()),
        "masked_percent": round(100.0 * float(bad.sum()) / total, 2) if total else 0.0,
        "source_pixels": int(((flags_u32 & np.uint32(1 << SOURCE_BIT)) != 0).sum()),
        "bit_counts": counts,
        "note": "SOURCE marks pixels mapped to a known source. It is not a defect and is not masked.",
    }
