"""Pure-science tests: flags, ePSF mapping, units, proper motion, healpix, photometry regressions."""

import math

import numpy as np
import pytest
from astropy.io import fits

from services.api.astro.coordinates import parse_coordinate_string, propagate_proper_motion, validate_ra_dec
from services.api.astro.epsf import cutout_to_original_pixel, enclosed_fraction, find_nearest_zone
from services.api.astro.flags import DEFAULT_FLAG_BITS, build_bad_pixel_mask, build_relaxed_mask, parse_flag_keywords
from services.api.astro.photometry import measure_frame
from services.api.astro.units import MJY_SR_ARCSEC2_TO_UJY, verify_conversion_with_astropy
from services.api.clients.allsky_cube import CUBE_PIXEL_ARCSEC, tile_index


# ---------------------------------------------------------------- flags
def test_source_bit_is_never_masked():
    only_source = np.array([[1 << 21]], dtype=np.uint32)
    assert not build_bad_pixel_mask(only_source)[0, 0]


def test_other_bits_are_masked():
    transient_source = np.array([[0x4200005]], dtype=np.uint32)  # real flag word near Barnard's Star (bits 0, 2, 21, 26)
    assert build_bad_pixel_mask(transient_source)[0, 0]
    assert not build_relaxed_mask(transient_source)[0, 0]         # still usable for locating a saturated star
    hot = np.array([[1 << 10]], dtype=np.uint32)
    assert build_relaxed_mask(hot)[0, 0]


def test_flag_names_read_from_header_keywords():
    h = fits.Header()
    h["MSKN0021"] = "SOURCE"
    h["MSKN0000"] = "TRANSIENT"
    assert parse_flag_keywords(h) == {21: "SOURCE", 0: "TRANSIENT"}
    assert parse_flag_keywords(None) == DEFAULT_FLAG_BITS


# ---------------------------------------------------------------- ePSF and pixel conventions
def test_cutout_to_original_pixel_real_numbers():
    """Real frame 2025W34_2B_0090_4D2: cutout target pixel (29.2522, 28.6865) with CRPIX1A=-1135, CRPIX2A=-1986
    is pixel (1165.25, 2015.69) of the full image; the range-read WCS gave the same value."""
    h = fits.Header({"CRPIX1A": -1135.0, "CRPIX2A": -1986.0})
    x, y = cutout_to_original_pixel(29.2522, 28.6865, h)
    assert (x, y) == pytest.approx((1165.2522, 2015.6865), abs=1e-3)
    with pytest.raises(KeyError):
        cutout_to_original_pixel(1, 1, fits.Header())


def test_nearest_zone_any_grid_size():
    xs, ys = np.meshgrid(np.arange(11) * 200.0, np.arange(41) * 50.0)  # detector 3 style 11 x 41
    n = xs.size
    cols = [fits.Column(name="XCENTER", format="E", array=xs.ravel()), fits.Column(name="YCENTER", format="E", array=ys.ravel()),
            fits.Column(name="CWAVE", format="E", array=np.full(n, 2.0)), fits.Column(name="NEFF_MEAN", format="E", array=np.full(n, 4.3)),
            fits.Column(name="EPSF", format="1089D", array=np.tile(np.arange(1089.0), (n, 1)))]
    table = fits.BinTableHDU.from_columns(cols).data
    z = find_nearest_zone(410.0, 120.0, table)
    assert z["zones_total"] == 451 and z["epsf"].shape == (33, 33)
    assert (z["x_center"], z["y_center"]) == (400.0, 100.0)


def test_enclosed_fraction_increases_with_radius():
    yy, xx = np.indices((33, 33))
    psf = np.exp(-((xx - 16) ** 2 + (yy - 16) ** 2) / (2 * 6.0**2))
    assert enclosed_fraction(psf, 1.0) < enclosed_fraction(psf, 2.0) < enclosed_fraction(psf, 3.0) <= 1.0


# ---------------------------------------------------------------- units, coordinates
def test_conversion_constant_matches_astropy():
    assert verify_conversion_with_astropy()
    assert MJY_SR_ARCSEC2_TO_UJY == pytest.approx(23.5045, abs=1e-3)


def test_proper_motion_barnards_star_26_years():
    """SIMBAD (live, 14 Nov 2026): J2000 269.452077, +4.693365, pm (-801.551, +10362.394) mas/yr."""
    ra, dec = propagate_proper_motion(269.452077, 4.693365, -801.551, 10362.394, 2000.0, 2026.0)
    assert (ra, dec) == pytest.approx((269.44627, 4.76820), abs=2e-5)  # the position used by the working tracker
    shift = math.hypot((ra - 269.452077) * math.cos(math.radians(4.7)), dec - 4.693365) * 3600
    assert shift == pytest.approx(270.1, abs=1.0)


def test_wise_0855_nasa_position_is_about_ten_years_later_than_simbad_j2000():
    from services.api.clients.simbad import _wise_0855_check
    row = {"ra_j2000": 133.818908, "dec_j2000": -7.247048, "pmra_cosdec": -8123.7, "pmdec": 673.2}
    chk = _wise_0855_check(row)
    assert chk["derived_epoch"] == pytest.approx(2010.45, abs=0.1)
    assert chk["residual_arcsec_after_propagation"] < 1.0


def test_coordinate_parsing_and_bounds():
    assert parse_coordinate_string("133.79, -7.24") == pytest.approx((133.79, -7.24))
    ra, dec = parse_coordinate_string("08:55:10.8 -07:14:42.5")
    assert (ra, dec) == pytest.approx((133.795, -7.2451), abs=1e-3)
    with pytest.raises(ValueError):
        validate_ra_dec(10.0, 95.0)


# ---------------------------------------------------------------- healpix and cube
def test_healpix_tile_matches_irsa_tutorial():
    assert tile_index(60.8109955, 51.3404038) == 445
    assert CUBE_PIXEL_ARCSEC == pytest.approx(12.88, abs=0.02)


# ---------------------------------------------------------------- photometry (regressions found on real data)
def _star(shape=(58, 58), x0=28.4, y0=28.7, amp=300.0, sigma=1.0, noise=0.0):
    yy, xx = np.indices(shape)
    img = amp * np.exp(-((xx - x0) ** 2 + (yy - y0) ** 2) / (2 * sigma**2))
    return img.astype(np.float32)


def test_clean_star_is_detected_with_correct_centroid():
    img = _star() + np.random.default_rng(1).normal(0, 0.5, (58, 58)).astype(np.float32)
    var = np.full_like(img, 0.25)
    m = measure_frame(img, var, np.zeros(img.shape, np.uint32), None, 28.0, 28.0, 37.8, 7.5)
    assert m["usable"] and m["detected"] and m["flux_quality"] == "clean"
    assert (m["centroid_x"], m["centroid_y"]) == pytest.approx((28.4, 28.7), abs=0.1)


def test_saturated_core_with_nan_gives_lower_limit_not_nan_centroid():
    """Barnard's Star: the core is NaN (OVERFLOW) and the flags around it are TRANSIENT/SUR_ERROR/BLOOM."""
    img = _star(amp=1200.0, sigma=1.3)
    img[28:30, 28:30] = np.nan
    flags = np.full(img.shape, 1 << 21, np.uint32)
    flags[24:34, 24:34] = 0x4200005
    m = measure_frame(img, np.full(img.shape, 0.25, np.float32), flags, None, 28.0, 28.0, 37.8, 7.5)
    assert m["usable"] and np.isfinite(m["centroid_x"]) and m["flux_is_lower_limit"]
    assert (m["centroid_x"], m["centroid_y"]) == pytest.approx((28.4, 28.7), abs=0.6)


def test_empty_sky_is_not_reported_as_detection():
    rng = np.random.default_rng(2)
    img = rng.normal(0, 1.0, (58, 58)).astype(np.float32)
    m = measure_frame(img, np.ones_like(img), np.zeros(img.shape, np.uint32), None, 28.0, 28.0, 37.8, 7.5)
    assert m["usable"] and not m["detected"]


# ------------------------------------------------------------------ claim gating (no claims from noise)

def _job_with_static_peaks(pm_ra: float, pm_dec: float, snr: float, n: int = 20):
    """Frames whose 'detections' sit still at the field centre while the target is expected to move."""
    from services.api.tracking import TrackJob, TrackParams

    params = TrackParams(ra=133.76, dec=-7.24, size_deg=0.1, detector=2, pmra=pm_ra, pmdec=pm_dec, pos_epoch=2026.0)
    job = TrackJob(params=params)
    for i in range(n):
        year = 2025.4 + i * 0.05
        exp_dec = -7.24 + (year - 2026.0) * pm_dec / 3.6e6
        # the peak stays at the field centre, so its offset from the (moving) expected position grows with time
        north_offset = (-7.24 - exp_dec) * 3600.0
        job.frames[i] = {
            "index": i, "status": "ok", "decimal_year": year, "wavelength_um": 1.3 + (i % 2) * 0.001,
            "expected": {"ra": 133.76, "dec": exp_dec},
            "position": {"offset_after_reference_alignment_arcsec": [0.0, north_offset], "error_arcsec": 0.5, "alignment": None},
            "measurement": {"usable": True, "detected": True, "snr": snr, "flux_ujy": 5.0 + (i % 5), "flux_error_ujy": 0.5,
                            "flux_is_lower_limit": False},
        }
    return job


def test_peaks_that_do_not_follow_a_known_fast_motion_are_not_the_target():
    from services.api.tracking import analyse_brightness, analyse_motion

    job = _job_with_static_peaks(0.0, 8000.0, snr=6.0)
    motion = analyse_motion(job)
    assert motion["status"] == "not_detected"
    assert analyse_brightness(job, motion)["status"] == "not_detected"


def test_brightness_ignores_frames_below_snr_5():
    from services.api.tracking import analyse_brightness

    job = _job_with_static_peaks(0.0, 0.0, snr=4.0)
    out = analyse_brightness(job)
    assert out["clean_frames"] == 0 and not out.get("variable_bins")
