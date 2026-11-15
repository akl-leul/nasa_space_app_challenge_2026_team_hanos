"""SIA2 parsing on a real answer, plus live tests (run with: pytest -m live) against the real archives."""

from pathlib import Path

import pytest

from services.api.clients.observations import (
    _parse_csv,
    _record,
    footprint_covers,
    is_cube_collection,
    is_deep_collection,
    release_label,
)

FX = Path(__file__).parent / "fixtures"


def test_release_labels_from_collection_names():
    assert release_label("spherex_dr1") == "DR1"
    assert release_label("spherex_qr3") == "QR3"
    assert release_label("spherex_qr3_deep") == "QR3 Deep"
    assert release_label("spherex_dr1_cube") == "DR1 All-Sky Cube"
    assert is_cube_collection("spherex_dr1_cube") and is_deep_collection("spherex_qr3_deep")


def test_real_sia_csv_with_broken_cloud_access_column():
    rows = _parse_csv((FX / "sia_sample.csv").read_text(encoding="utf-8"))
    assert len(rows) == 3
    rec = _record(rows[0], "spherex_dr1", 269.4521, 4.6934)
    assert rec["release"] == "DR1" and rec["detector"] in range(1, 7)
    assert rec["access_url"].startswith("https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/")
    assert rec["pixel_scale_arcsec"] == pytest.approx(6.15)
    lo, hi = rec["band_range_um"]
    assert 0.7 < lo < hi < 5.1
    assert rec["footprint_covers_target"] is True


def test_footprint_point_in_polygon():
    poly = "POLYGON ICRS 10 10 12 10 12 12 10 12 10 10"
    assert footprint_covers(poly, 11.0, 11.0) is True
    assert footprint_covers(poly, 20.0, 11.0) is False
    assert footprint_covers("garbage", 1.0, 1.0) is None


@pytest.mark.live
def test_live_barnards_star_has_many_real_frames():
    import asyncio
    from services.api.clients.observations import get_observations
    obs = asyncio.run(get_observations(269.44627, 4.76820, 0.02, budget_s=120))
    assert obs["count"] > 100 and obs["span_days"] > 300
    assert all(1 <= o["detector"] <= 6 for o in obs["observations"])
    lo = {d: min(o["wavelength_um"] for o in obs["observations"] if o["detector"] == d and o.get("wavelength_um")) for d in range(1, 7)}
    assert lo[1] < 0.8 and lo[6] > 4.3
