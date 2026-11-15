"""Tests on REAL bytes read from IRSA's S3 mirror on 14 Nov 2026 (services/api/tests/fixtures)."""

from pathlib import Path

import numpy as np
import pytest
from astropy.wcs import WCS

from services.api.clients.s3_fits import (
    SpectralTable,
    _split_headers,
    flag_counts_from_header,
    parse_wcs_wave_tail,
    s3_url,
)

FX = Path(__file__).parent / "fixtures"


def test_s3_url_mapping():
    url = ("https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W34_2B/l2b-v27-2026-229/2/"
           "level2_2025W34_2B_0090_4D2_spx_l2b-v27-2026-229.fits")
    assert s3_url(url) == ("https://nasa-irsa-spherex.s3.amazonaws.com/dr1/level2/2025W34_2B/l2b-v27-2026-229/2/"
                           "level2_2025W34_2B_0090_4D2_spx_l2b-v27-2026-229.fits")
    with pytest.raises(ValueError):
        s3_url("https://example.org/file.fits")


def test_primary_and_image_headers():
    primary, image = _split_headers((FX / "d2_head.bin").read_bytes(), 2)
    assert primary["VERSION"].strip() == "7.0.5"
    assert int(image["DETECTOR"]) == 2          # the detector lives in the IMAGE header, not the primary
    assert image["DATE-OBS"] == "2025-08-21T23:33:58.633"
    assert image["MJD-AVG"] == pytest.approx(60908.982594812)
    assert image["BUNIT"].replace(" ", "") == "MJy/sr"
    counts = flag_counts_from_header(image)
    assert counts["SOURCE"] > 1_000_000 and "HOT" in counts and "BLOOM" in counts


def test_spectral_table_matches_cutout_wcs_value():
    """Wavelength at the target pixel measured with the cutout's own spectral WCS: 1.0914533 micron
    (FITS 1-based pixel 1166.25, 2016.69 of the full image)."""
    tbl = parse_wcs_wave_tail((FX / "d2_tail.bin").read_bytes())
    assert tbl.wavelength_um.shape == (11, 11)  # detector 2 has an 11 x 11 grid (detector 1 has 9 x 9)
    wl, bw = tbl.at(1165.2521 + 1, 2015.6865 + 1)
    assert wl == pytest.approx(1.0914533, abs=2e-4)
    assert bw == pytest.approx(0.024889, abs=2e-4)


def test_detector3_table_is_rectangular_not_square():
    tbl = parse_wcs_wave_tail((FX / "d3_tail.bin").read_bytes())
    assert tbl.wavelength_um.shape == (14, 9)   # 9 x 14 control points
    wl, _ = tbl.at(1020, 1020)
    assert 1.6 < wl < 2.45                      # detector 3 covers 1.63-2.41 micron


def test_wavelength_gradient_runs_along_rows():
    tbl = parse_wcs_wave_tail((FX / "d2_tail.bin").read_bytes())
    top, _ = tbl.at(1020, 2000)
    bottom, _ = tbl.at(1020, 50)
    assert top < bottom                          # shortest wavelengths at the top (IRSA data overview figure)
