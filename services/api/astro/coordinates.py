import math
import re
from typing import Tuple, Dict, Any, Optional

def parse_coordinate_string(coord_str: str) -> Tuple[float, float]:
    """
    Parses RA and Dec from either decimal degrees ("133.79, -7.24") or
    sexagesimal strings ("08:55:10.8 -07:14:42.5", "08h55m10.8s -07d14m42.5s").
    Validates RA in [0, 360) and Dec in [-90, 90].
    """
    s = coord_str.strip()
    # Try simple comma or space separated decimals
    dec_match = re.match(r"^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$", s)
    if dec_match:
        ra = float(dec_match.group(1))
        dec = float(dec_match.group(2))
        return validate_ra_dec(ra, dec)

    # Sexagesimal parsing
    # Replace h, m, s, d, :, and extra spaces
    parts = re.split(r"[,/;\s]+", s)
    if len(parts) == 2:
        ra_part, dec_part = parts[0], parts[1]
    elif len(parts) == 6:
        ra_part = f"{parts[0]}:{parts[1]}:{parts[2]}"
        dec_part = f"{parts[3]}:{parts[4]}:{parts[5]}"
    else:
        raise ValueError(f"Cannot parse coordinates from '{coord_str}'")

    ra = parse_sexagesimal_ra(ra_part)
    dec = parse_sexagesimal_dec(dec_part)
    return validate_ra_dec(ra, dec)

def parse_sexagesimal_ra(s: str) -> float:
    cleaned = re.sub(r"[hmsHMS]", ":", s).strip(":")
    bits = [float(x) for x in cleaned.split(":") if x]
    if len(bits) == 3:
        h, m, sec = bits
        return (h + m/60.0 + sec/3600.0) * 15.0
    elif len(bits) == 2:
        h, m = bits
        return (h + m/60.0) * 15.0
    elif len(bits) == 1:
        return float(bits[0])
    raise ValueError(f"Invalid RA sexagesimal: {s}")

def parse_sexagesimal_dec(s: str) -> float:
    sign = -1.0 if "-" in s else 1.0
    cleaned = re.sub(r"[dmsDMS+-]", ":", s).strip(":")
    bits = [float(x) for x in cleaned.split(":") if x]
    if len(bits) == 3:
        d, m, sec = bits
        return sign * (abs(d) + m/60.0 + sec/3600.0)
    elif len(bits) == 2:
        d, m = bits
        return sign * (abs(d) + m/60.0)
    elif len(bits) == 1:
        return sign * abs(float(bits[0]))
    raise ValueError(f"Invalid Dec sexagesimal: {s}")

def validate_ra_dec(ra: float, dec: float) -> Tuple[float, float]:
    ra_norm = ra % 360.0
    if ra_norm < 0:
        ra_norm += 360.0
    if not (-90.0 <= dec <= 90.0):
        raise ValueError(f"Declination {dec} out of bounds [-90, +90]")
    return ra_norm, dec

def propagate_proper_motion(
    ra_deg: float,
    dec_deg: float,
    pmra_cosdec_mas_yr: float,
    pmdec_mas_yr: float,
    epoch_from: float,
    epoch_to: float
) -> Tuple[float, float]:
    """
    Propagates coordinates from epoch_from to epoch_to using proper motion.
    pmra_cosdec_mas_yr is mu_alpha * cos(dec) in milliarcseconds per year.
    pmdec_mas_yr is mu_delta in milliarcseconds per year.
    """
    dt_years = epoch_to - epoch_from
    cos_dec = math.cos(math.radians(dec_deg))
    if abs(cos_dec) < 1e-7:
        cos_dec = 1e-7

    # Convert mas/yr to deg/yr
    d_ra_deg = (pmra_cosdec_mas_yr / (cos_dec * 3600000.0)) * dt_years
    d_dec_deg = (pmdec_mas_yr / 3600000.0) * dt_years

    new_ra = (ra_deg + d_ra_deg) % 360.0
    if new_ra < 0:
        new_ra += 360.0
    new_dec = dec_deg + d_dec_deg
    new_dec = max(-90.0, min(90.0, new_dec))

    return new_ra, new_dec

def mjd_to_decimal_year(mjd: float) -> float:
    # 2000-01-01 12:00:00 UTC is MJD 51544.5
    return 2000.0 + (mjd - 51544.5) / 365.25
