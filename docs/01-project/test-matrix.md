# Test matrix: the five required targets

Generated 2026-11-14 23:48 by `scripts/build_test_matrix.py` from `services/api/cache/prewarm_status.json`, which `scripts/prewarm_targets.py` fills with the results of the real pipeline (SIMBAD, IRSA SIA2, IRSA cutouts, the DR1 all-sky cube, Gaia DR3, AllWISE). Nothing here is typed by hand or simulated.

These are test targets, not claimed discoveries. A change is reported only as an *observed change* or a *candidate* that needs verification.

## Summary

| Target | Resolve | Observations | Tracking (detectors done) | All-sky cube | Gaia | AllWISE |
|---|---|---|---|---|---|---|
| Barnard's Star | pass | pass (368 frames) | 3 of 3 | not run (- valid channels) | not run (-) | not run (-) |
| Epsilon Indi B | not run | | | | | |
| WISE 0855 | pass | pass (258 frames) | 6 of 6 | pass (100 valid channels) | pass (48) | fail (0) |
| RW Aurigae | pass | pass (338 frames) | 6 of 6 | pass (85 valid channels) | pass (176) | fail (0) |
| R Draconis | pass | pass (554 frames) | 3 of 3 | not run (- valid channels) | not run (-) | not run (-) |

## Details

### Barnard's Star
- SIMBAD: **NAME Barnard's star**, J2000 RA 269.452077, Dec +4.693365; proper motion (-801.551, 10362.394) mas/yr; parallax 546.9759 mas.
- Position at epoch 2026.0 (propagated): RA 269.44627, Dec +4.76820.
- SPHEREx frames covering the position: **368** from 2025-08-15T20:46:08.896 to 2026-09-22T15:05:18.541 (span 402.8 days); by detector {'1': 60, '2': 62, '3': 61, '4': 59, '5': 66, '6': 60}; QR3 124, DR1 244.
- Detector 1: done, 60 frames (0 failed); measured motion 10079.0 mas/yr (26.7 sigma), expected [-801.6, 10362.4] (difference 1.1 sigma); brightness test: saturated; claim level: **observed change**.
- Detector 2: done, 61 frames (0 failed); measured motion 10020.4 mas/yr (21.4 sigma), expected [-801.6, 10362.4] (difference 2.4 sigma); brightness test: saturated; claim level: **observed change**.
- Detector 4: done, 59 frames (0 failed); measured motion 10090.8 mas/yr (30.6 sigma), expected [-801.6, 10362.4] (difference 0.9 sigma); brightness test: saturated; claim level: **observed change**.
- All-sky cube spectrum: not run yet.

### WISE 0855
- SIMBAD: **WISEA J085510.74-071442.5**, J2000 RA 133.818908, Dec -7.247048; proper motion (-8123.7, 673.2) mas/yr; parallax 439.0 mas.
- Position at epoch 2026.0 (propagated): RA 133.75976, Dec -7.24219.
- NASA's published position corresponds to epoch **2010.45** (derived from the SIMBAD proper motion; residual 0.19 arcsec after propagation).
- SPHEREx frames covering the position: **258** from 2025-05-05T16:49:00.018 to 2026-05-14T06:54:33.173 (span 373.6 days); by detector {'1': 36, '2': 48, '3': 45, '4': 36, '5': 48, '6': 45}; QR3 0, DR1 258.
- Detector 1: done, 36 frames (0 failed); measured motion 365.5 mas/yr (0.8 sigma), expected [-8123.7, 673.2] (difference 13.0 sigma); brightness test: tested; claim level: **no significant change**.
- Detector 2: done, 48 frames (0 failed); measured motion 92.8 mas/yr (0.3 sigma), expected [-8123.7, 673.2] (difference 20.8 sigma); brightness test: tested; claim level: **observed change**.
- Detector 3: done, 45 frames (0 failed); measured motion 201.0 mas/yr (0.6 sigma), expected [-8123.7, 673.2] (difference 17.0 sigma); brightness test: tested; claim level: **no significant change**.
- Detector 4: done, 36 frames (0 failed); measured motion 709.7 mas/yr (1.1 sigma), expected [-8123.7, 673.2] (difference 9.4 sigma); brightness test: insufficient; claim level: **no significant change**.
- Detector 5: done, 48 frames (0 failed); measured motion 7719.9 mas/yr (5.7 sigma), expected [-8123.7, 673.2] (difference 0.3 sigma); brightness test: tested; claim level: **observed change**.
- Detector 6: done, 45 frames (0 failed); measured motion 5769.9 mas/yr (1.0 sigma), expected [-8123.7, 673.2] (difference 0.4 sigma); brightness test: tested; claim level: **no significant change**.
- All-sky cube spectrum: 100 of 102 channels valid.

### RW Aurigae
- SIMBAD: **V* RW Aur**, J2000 RA 76.956526, Dec +30.401438; proper motion (7.23, -20.33) mas/yr; parallax 15.42 mas.
- Position at epoch 2026.0 (propagated): RA 76.95659, Dec +30.40129.
- SPHEREx frames covering the position: **338** from 2025-09-01T10:05:15.025 to 2026-09-16T21:31:03.042 (span 380.5 days); by detector {'1': 56, '2': 57, '3': 56, '4': 57, '5': 56, '6': 56}; DR1 227, QR3 111.
- Detector 1: done, 56 frames (0 failed); measured motion 283.8 mas/yr (2.3 sigma), expected [7.2, -20.3] (difference 1.6 sigma); brightness test: tested; claim level: **observed change**.
- Detector 2: done, 54 frames (0 failed); measured motion 211.9 mas/yr (1.5 sigma), expected [7.2, -20.3] (difference 1.0 sigma); brightness test: tested; claim level: **observed change**.
- Detector 3: done, 55 frames (0 failed); measured motion 599.1 mas/yr (3.3 sigma), expected [7.2, -20.3] (difference 2.5 sigma); brightness test: tested; claim level: **observed change**.
- Detector 4: done, 56 frames (0 failed); measured motion 1078.5 mas/yr (3.2 sigma), expected [7.2, -20.3] (difference 2.7 sigma); brightness test: insufficient; claim level: **no significant change**.
- Detector 5: done, 56 frames (0 failed); measured motion 593.9 mas/yr (3.2 sigma), expected [7.2, -20.3] (difference 2.2 sigma); brightness test: tested; claim level: **observed change**.
- Detector 6: done, 56 frames (0 failed); measured motion 8044.7 mas/yr (5.1 sigma), expected [7.2, -20.3] (difference 3.8 sigma); brightness test: tested; claim level: **observed change**.
- All-sky cube spectrum: 85 of 102 channels valid.

### R Draconis
- SIMBAD: **V* R Dra**, J2000 RA 248.167611, Dec +66.754979; proper motion (-20.643, 6.149) mas/yr; parallax 1.2509 mas.
- Position at epoch 2026.0 (propagated): RA 248.16723, Dec +66.75502.
- SPHEREx frames covering the position: **554** from 2025-05-16T22:57:21.196 to 2026-07-16T20:58:24.971 (span 425.9 days); by detector {'1': 92, '2': 94, '3': 91, '4': 92, '5': 94, '6': 91}; QR3 127, DR1 427.
- Detector 1: done, 79 frames (0 failed); measured motion 789.3 mas/yr (0.8 sigma), expected [-20.6, 6.1] (difference 0.6 sigma); brightness test: saturated; claim level: **no significant change**.
- Detector 2: done, 77 frames (0 failed); measured motion 8584.7 mas/yr (4.4 sigma), expected [-20.6, 6.1] (difference 3.0 sigma); brightness test: saturated; claim level: **no significant change**.
- Detector 4: done, 77 frames (0 failed); motion not fitted: Only 2 frames have a detection with signal-to-noise of at least 5. (detected 0 of 0 usable frames, median SNR None); brightness test: saturated; claim level: **no significant change**.
- All-sky cube spectrum: not run yet.
