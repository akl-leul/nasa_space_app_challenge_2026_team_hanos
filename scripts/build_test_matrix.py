"""Build docs/01-project/test-matrix.md from the REAL results written by scripts/prewarm_targets.py.

Nothing is typed by hand: every number comes from services/api/cache/prewarm_status.json.
A step is "pass" only if it returned real data, "fail" if the archive or the code failed, and
"no-data" only if an archive really answered with zero rows (which is then stated as such).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS = ROOT / "services" / "api" / "cache" / "prewarm_status.json"
OUT = ROOT / "docs" / "01-project" / "test-matrix.md"
ORDER = ["Barnard's Star", "Epsilon Indi B", "WISE 0855", "RW Aurigae", "R Draconis"]


def mark(ok, count=None) -> str:
    if ok is None:
        return "not run"
    if not ok:
        return "fail"
    return "pass" if (count is None or count > 0) else "no-data"


def main() -> None:
    data = json.loads(STATUS.read_text())
    lines = [
        "# Test matrix: the five required targets",
        "",
        f"Generated {time.strftime('%Y-%m-%d %H:%M')} by `scripts/build_test_matrix.py` from `services/api/cache/prewarm_status.json`, "
        "which `scripts/prewarm_targets.py` fills with the results of the real pipeline (SIMBAD, IRSA SIA2, IRSA cutouts, "
        "the DR1 all-sky cube, Gaia DR3, AllWISE). Nothing here is typed by hand or simulated.",
        "",
        "These are test targets, not claimed discoveries. A change is reported only as an *observed change* or a *candidate* "
        "that needs verification.",
        "",
        "## Summary",
        "",
        "| Target | Resolve | Observations | Tracking (detectors done) | All-sky cube | Gaia | AllWISE |",
        "|---|---|---|---|---|---|---|",
    ]
    for name in ORDER:
        r = data.get(name)
        if not r:
            lines.append(f"| {name} | not run | | | | | |")
            continue
        res = r.get("resolve", {})
        obs = r.get("observations", {})
        trk = r.get("tracking", {})
        done = [d for d, v in trk.items() if v.get("status") == "done"]
        cube = r.get("allsky_spectrum", {})
        lines.append(
            f"| {name} | {mark(res.get('ok'))} | {mark(obs.get('ok'), obs.get('count'))} ({obs.get('count', '-')} frames) "
            f"| {len(done)} of {len(trk)} | {mark(cube.get('ok'), cube.get('valid_channels'))} ({cube.get('valid_channels', '-')} valid channels) "
            f"| {mark(r.get('gaia', {}).get('ok'), r.get('gaia', {}).get('count'))} ({r.get('gaia', {}).get('count', '-')}) "
            f"| {mark(r.get('allwise', {}).get('ok'), r.get('allwise', {}).get('count'))} ({r.get('allwise', {}).get('count', '-')}) |"
        )
    lines += ["", "## Details", ""]
    for name in ORDER:
        r = data.get(name)
        if not r:
            continue
        res = r.get("resolve", {})
        lines.append(f"### {name}")
        if res.get("ok"):
            lines += [
                f"- SIMBAD: **{res['name']}**, J2000 RA {res['ra_j2000']:.6f}, Dec {res['dec_j2000']:+.6f}; "
                f"proper motion ({res['pmra']}, {res['pmdec']}) mas/yr; parallax {res['parallax']} mas.",
                f"- Position at epoch 2026.0 (propagated): RA {res['ra_2026']:.5f}, Dec {res['dec_2026']:+.5f}.",
            ]
            if res.get("nasa_reference"):
                n = res["nasa_reference"]
                lines.append(
                    f"- NASA's published position corresponds to epoch **{n['derived_epoch']}** (derived from the SIMBAD proper motion; "
                    f"residual {n['residual_arcsec_after_propagation']} arcsec after propagation).")
        else:
            lines.append(f"- Resolve failed: {res.get('error')}")
        obs = r.get("observations", {})
        if obs.get("ok"):
            lines.append(
                f"- SPHEREx frames covering the position: **{obs['count']}** from {obs['first']} to {obs['last']} "
                f"(span {obs['span_days']} days); by detector {obs['by_detector']}; "
                + ", ".join(f"{c['release']} {c['count']}" for c in obs["collections"] if c.get("ok")) + ".")
        else:
            lines.append(f"- Observation search failed: {obs.get('error')}")
        for d, t in sorted(r.get("tracking", {}).items()):
            m = t.get("motion", {})
            if m.get("status") == "measured":
                motion = (f"measured motion {m['pm_total_mas_yr']} mas/yr ({m['pm_total_sigma']} sigma), expected "
                          f"{m['expected_pm_mas_yr']} (difference {m['difference_from_expected_sigma']} sigma)")
            else:
                motion = (f"motion not fitted: {m.get('explanation', m.get('status'))} "
                          f"(detected {m.get('detected_frames', 0)} of {m.get('usable_frames', 0)} usable frames, median SNR {m.get('median_snr')})")
            lines.append(f"- Detector {d}: {t['status']}, {t['frames']} frames ({t['failed']} failed); {motion}; "
                         f"brightness test: {t.get('brightness_status')}; claim level: **{t['claim_level']}**.")
        cube = r.get("allsky_spectrum")
        if cube is None:
            lines.append("- All-sky cube spectrum: not run yet.")
        elif cube.get("ok"):
            lines.append(f"- All-sky cube spectrum: {cube.get('valid_channels')} of 102 channels valid.")
        else:
            lines.append(f"- All-sky cube spectrum failed: {cube.get('error')}")
        lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
