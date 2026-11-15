# Prompt 09 — Top-right toolbar: all NASA REQUIRED and SUGGESTED features, with real data

Paste everything below the line into the agent. Run it after the dome, the selection visualizer and the share card exist (prompts 02 to 08).

Decisions behind this prompt (from the team): real, working SPHEREx data (no mock data); all 10 requirements in one pass; 8 requirement icons plus one View icon; the old Horizon, Grid, Labels, zoom and Reset buttons fold into the View panel; every link on the challenge Resources tab is reviewed and used (see `docs/02-research/link-review.md`).

Source list: `docs/01-project/project-reference-v1.0.pdf`, section 1.5, items 1 to 6 are NASA REQUIRED and items 7 to 10 are NASA SUGGESTED. The official challenge text (reviewed 14 Nov 2026) refines items 7 and 10, see section 0.

---

TOP-RIGHT TOOLBAR PROMPT: implement every NASA REQUIRED and NASA SUGGESTED item as a working feature, opened from icons at the top right of /explore

READ FIRST, in this order:
1. AGENTS.md (design system, 9px/regular-weight rule, scientific rules, "ask before a new dependency, colour or font"). Next.js here is v16 with breaking changes, so read the relevant guides in node_modules/next/dist/docs/ (rewrites, dynamic imports, route handlers, Client Components) before coding.
2. **docs/02-research/link-review.md** (mandatory). It records what every resource link actually contains, including figures, exact endpoints, file layouts, unit formulas, FLAGS bit names and corrections to our earlier documents. Treat its "Corrections" section as overriding the project reference and the briefings. Anything marked "verify" there you must verify yourself against the live page or service before relying on it. The figures are in docs/02-research/assets/link-review/.
3. docs/01-project/project-reference-v1.0.pdf: sections 1.5 and 1.6 (requirements and the five targets), 2 (what the data can and cannot do), 3 (features, Evidence Card, data-honesty bar), 4 (architecture, API, new releases), 7 (risks, claim levels), 8 (test matrix).
4. The briefings docs/02-research/data-briefings/01 to 04. Briefings 05 to 08 are background, but their links are now used as optional context layers (section 4.9).
5. The SPHEREx Explanatory Supplement PDF at https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf: read Table 16 (FLAGS) and Sections 2.2 and 2.5 (spectral images and the all-sky cube). The link review did not read it.
6. The existing code: src/components/explore/*, src/lib/astro/*, and prompts 02 to 08 in docs/03-design/prompts/.

NON-NEGOTIABLE: this must work with REAL data. No mock data, no placeholder observations, no invented dates, spectra or detections. If a real call fails (network, no coverage, archive outage), show an honest message ("no observations found", "archive unreachable") and say so in your report. Never fake a result to make a panel look finished.

0. REQUIREMENT MAP (what must exist when you finish)

| # | NASA requirement | Priority | Icon / panel | What the user can do |
|---|---|---|---|---|
| 1 | Enter celestial coordinates as RA and Dec | REQUIRED | Search | Type RA/Dec (decimal or sexagesimal), a target name, a constellation, or a solar-system object name; go there |
| 2 | Retrieve SPHEREx observations of the selected sky region | REQUIRED | Observations | Query the real IRSA archive for the position and field of view and list the results |
| 3 | Display observations from different dates | REQUIRED | Observations, Time-lapse | See frames in true date order, with date, detector, wavelength and release |
| 4 | Present them as a sequence, like a video or time-lapse | REQUIRED | Time-lapse | Play, pause, step, change speed and scrub through the frames |
| 5 | Make it easy to notice objects that move or change brightness | REQUIRED | Compare, Change | Blink, difference, centroid tracks, flux series and highlighted candidates |
| 6 | Test the app on the five named targets | REQUIRED | Targets | Fly to each target and run a live availability and pipeline test; see a pass/fail/no-data matrix |
| 7 | Combine the detector arrays where appropriate; explore the 102 channels; generate spectra dynamically | SUGGESTED | Spectra | See which detectors and bands cover the position, **stack each detector separately** to raise signal-to-noise, explore channels, build spectra on demand |
| 8 | Add or subtract observations from different dates; choose field of view | SUGGESTED | Compare, Search | Add (A+B) or subtract (A-B) frames; set the field of view and cutout size |
| 9 | Overlay Gaia and WISE information; show metadata and contamination flags | SUGGESTED | Overlays | Toggle Gaia and WISE markers on the image; read frame metadata and flag summaries |
| 10 | Support coordinate-based URLs; make new data releases easy to add | SUGGESTED | Search, Overlays | Share, restore and **embed** views from the URL; the release list comes from the archive, not from code |

Interpretation fixes from the official brief (override the project reference):
- Item 7 means: "separately add together all the data taken by each of the six detector arrays to improve the signal-to-noise". Implement a **per-detector stack** (co-add of aligned frames of ONE detector, optionally per time window). **Never merge detectors or wavelengths into one brightness.** Stacks mix dates, so the stack is limited to a chosen time window and labelled "stacked".
- Item 8: larger fields of view help track faster movers at the cost of longer transfers. Show that trade-off next to the field-of-view control.
- Item 10: the brief wants views that can be embedded in other websites. Add an `embed=1` parameter that hides the chrome (toolbar, status bar) and keeps only the viewer.

Icons, left to right (8 requirement icons, then a divider, then View): Search, Targets, Observations, Time-lapse, Compare, Change, Spectra, Overlays, | View. The five required targets are Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae and R Draconis. They are test targets, not claimed discoveries.

0.1 RESOURCE REGISTRY (every link, and exactly how it is used)
Credit all of these in docs/01-project/data-credits.md and in a "Data and credits" section of the Overlays panel, with the link and the required wording (DR1 DOIs 10.26131/IRSA678 and 10.26131/IRSA679 plus the acknowledgement text from the DR1 overview page).

| Link | How the app uses it | Integration level |
|---|---|---|
| NASA/IPAC IRSA SPHEREx page (irsa.ipac.caltech.edu/Missions/spherex.html) | Source of all SPHEREx data and documents; links and credits | REAL (SIA2, TAP, cutouts, cloud, browsable files) |
| SPHEREx tutorial notebooks: Data Overview, Cutouts, PSF, Source Discovery, Mosaic Cube, HiPS Cube | The backend recipe: SIA2 and TAP queries, cutout URLs, ePSF and WCS handling, unit conversion, background and reprojection, aperture photometry, all-sky cube quick-look spectra | REAL (reimplemented in our own code, with credit) |
| WiseView (byw.tools/wiseview) | UX model for the time-lapse and compare viewer (section 3.4 and 3.5), and an **"Open in WiseView" deep link** for the current position built with its real hash parameters (`#ra=&dec=&size=&band=`) | Model plus link-out. Never copy its code or images |
| Gaia mission data (archive.stsci.edu/missions-and-data/gaia, ESA Gaia Archive) | Gaia **DR3** overlay and expected positions via proper motion | REAL (astroquery Gaia/TAP; MAST as a documented alternative) |
| NEOSSat mission page, NEOSSat dataset record, NEOSSat data tutorial | Optional context layer: NEOSSat observation list for a position and the frames, plus credits and licence (Open Government Licence - Canada) | REAL but COULD (section 4.9) |
| Canadian Astronomy Data Centre (CADC) | Optional context layers: DSS historical optical cutout, SSOIS known solar-system object check, NEOSSat search through CADC TAP | REAL where an API is confirmed, otherwise link-out (section 4.9) |
| IRSA Data Explorer, Spectrophotometry Tool, Mosaic Tool | No confirmed API (the Mosaic Tool has none) | **Link-out buttons only**, never scraped |
| IRSA MOST (Moving Object Search, `catalog=spherex`) | Known solar-system object lookup by name, to find SPHEREx frames that contain it | REAL |
| 3I/ATLAS table `obscore_3I_Atlas.vot` | Optional extra demo target with predicted comet positions per exposure (extended source) | REAL, COULD |
| SPLICES catalog (about 9 million ice-source targets) | Optional overlay of catalogue sources | COULD |

1. THE TOOLBAR AND PANELS (UI)
- Replace the current top-right text buttons with an icon toolbar (src/components/explore/TopToolbar.tsx). Keep the same top-right position and respect the safe area on phones.
- Each icon: a round button, at least 32 px (never under a 24 px hit area), inline SVG icon (no icon library), cream outline on ink, active state with a blue ring or fill and cream icon. **Hover and keyboard focus show a tooltip with the name** (9px, regular weight, uppercase, letter-spaced). Accessible name on every button, aria-expanded on the toggled panel, and a visible focus ring.
- Click an icon: open its panel in the top-right corner, docked under the icon row (about 340 px wide on desktop, max height about 70 vh with its own scroll). One panel open at a time. Click the same icon again, press Esc, or use a Close button to close it, and return focus to the icon. The dome stays interactive behind it (the panel is not modal). Under 768 px the panel becomes a bottom sheet of full width.
- Panels that show images (Time-lapse, Compare, Overlays) have an Expand button that enlarges the panel to a larger floating viewer (about 60 percent of the viewport width). Expand state does not lose any state.
- Keyboard: arrow keys move between toolbar icons, Enter or Space opens, Esc closes. Panel content is in the normal tab order.
- App typography and colour rules apply everywhere in the toolbar and panels: **9px, regular weight (400) only**, hierarchy from uppercase, letter-spacing, spacing and thin rules. Ink panels with cream text. Blue only for the primary action and the active state, never as text on ink. No glass, gradients or shadows. Letter-spacing about 0.04 to 0.08em, line-height at least 1.5. Tables use 9px with enough row height to stay readable.
- Load every panel lazily (dynamic import on first open, prefetched on hover or focus of its icon). The initial /explore bundle must not grow. Charts use Plotly's basic distribution (`plotly.js-basic-dist-min`, approved), imported only when a chart first appears, font size 9, weight 400.
- A shared state container (React context and reducer, no extra state library) holds: the current centre and field of view, the selected object, the observation list and filters, the current frame, the compare pair, overlay toggles, analysis results and the open panel. The dome and the panels talk through it. Keep the dome's performance rules from prompt 04: no React state per frame, live readouts written straight to the DOM.

2. BACKEND (real data) in services/api/
Per AGENTS.md, FITS processing lives in Python. Build a FastAPI service.
- Stack (approved): Python 3.11+, fastapi, uvicorn, astropy, astroquery, pyvo, numpy, scipy, photutils, **reproject, sep, hpgeom** (all used in the IRSA tutorials), pillow, httpx, pytest. Pin versions in services/api/requirements.txt and use a virtual environment in services/api/.venv (git-ignored). The developer machine is Windows, so give both PowerShell and bash commands in services/api/README.md. Ask before adding any other package.
- Run: add a dependency-free `scripts/dev-all.mjs` and `npm run dev:all` that starts the API and Next.js together. Next.js proxies /api/* to the service with a rewrite in next.config.ts (target from the API_BASE_URL environment variable, default http://127.0.0.1:8000). Document the variable in .env.example.
- **Phase 0, before anything else:** verify from this machine that you can reach IRSA (the SIA2 endpoint `https://irsa.ipac.caltech.edu/SIA?`, TAP, the cutout service, the HiPS files, the MOST endpoint), SIMBAD, the ESA Gaia archive and WISE/NEOWISE tables, and that the Python packages install on Windows. Report what works. If something is unreachable, stop and tell me instead of building on mocks.
- Endpoints (JSON unless noted; all validate inputs: RA 0 to 360, Dec -90 to +90, sensible field-of-view and cutout limits, dates, release names):
  - GET /api/health: archive connectivity and the service version.
  - GET /api/releases: SPHEREx collections discovered from IRSA at startup (`Irsa.list_collections(servicetype="SIA", filter="spherex")`). Today these are `spherex_dr1`, `spherex_dr1_deep`, `spherex_dr1_cube` (the all-sky cube), `spherex_qr3`, `spherex_qr3_deep`. Derive a release label (DR1, QR3) from the collection name. **QR2 is no longer searchable and QR1 is retired, so do not build QR2 support.** Nothing about collection or release names may be hard-coded in the frontend or the analysis code: adding a release must need no code change beyond optional display labels in one config file. Search `spherex_dr1` and `spherex_qr3` together by default (same calibration, one time series, release label shown on every frame), with the deep collections as an option.
  - GET /api/resolve?name=: SIMBAD resolution at runtime with proper motion and epoch. The one allowed constant is WISE 0855: RA 08h 55m 10.831s, Dec -07 deg 14' 42.53" as supplied by NASA, with its epoch noted (WiseView shows a position about 32" away, so epoch handling matters). Never type the other four targets' coordinates from memory. Apply proper motion to the observation epoch.
  - GET /api/observations?ra&dec&fov&release&from&to&detector: a real query. Use TAP on `spherex.artifact` joined to `spherex.plane` (`CONTAINS(POINT('ICRS', ra, dec), p.poly)`, filter on `p.energy_bandpassname` = `SPHEREx-D1` to `SPHEREx-D6`, order by `p.time_bounds_lower`) because it sees new data first, and SIA2 as a faster fallback (it lags about a day). **A TAP query took about 20 s in IRSA's own tutorial**, so run it asynchronously, show progress, cache it, and allow cancel. Return a time-sorted list with obs_id, observation time from the archive metadata (never assume spacing), detector (1 to 6), central wavelength and bandwidth, release label, the cutout URL, a flags summary when known, and a footprint check (does the footprint actually cover the position). Some pointings lack some bands, so never assume six frames per pointing.
  - GET /api/cutout/{id}.png and /api/cutout/{id}/meta: use the archive's server-side cutout service by appending `?center=RA,Dec&size=DEG` (degrees) to an on-premises access URL, instead of downloading 70 MB files. Read the MEF by extension name (IMAGE, FLAGS, VARIANCE, ZODI, EPSF or PSF, WCS-WAVE) and header keywords, never fixed pixel numbers. Retry transient read errors with backoff (the tutorials do). Expect **cutouts that are truncated at detector edges and have different shapes**, and visible hot, cold and flagged pixels. Render the PNG with a documented stretch (asinh with percentile clipping, with an invert option, like WiseView's asinh stretch) and return metadata (units, stretch parameters, WCS summary, flag summary, release, date, detector, wavelength). Get the wavelength per pixel from the spectral WCS (`WCS(header, fobj=hdulist, key="W")` with `sip = None`); within a small cutout it is nearly constant because wavelength varies mainly along detector rows. Unit-test the 0-based versus 1-based pixel conventions, including `xpix_orig = 1 + xpix_cutout - CRPIX1A` for ePSF zone lookup.
  - GET /api/analysis?ra&dec&fov&release: per-exposure centroid and flux of the target and neighbours using Photutils, PSF-aware (the **EPSF table** in DR1 and QR3, 33x33 oversampled by 5, one per zone; zone grids are 21x21 except **detector 3 which is 11x41**, so read zone counts from the file), uncertainties from VARIANCE, masked by FLAGS. Build the bad-pixel mask from the bit names in each file's header (`MSKNnnnn` and `MSKDnnnn`; bits include TRANSIENT, OVERFLOW, SUR_ERROR, NONFUNC, DICHROIC, MISSING_DATA, HOT, COLD, NONLINEAR, PERSIST, OUTLIER, CROSSTALK, GHOST variants, STREAK, BLOOM, SNOWBALL, HALO). **Bit 21 is SOURCE ("pixel mapped to a known source") and most pixels carry it, so it is never a good-pixel test and never a reason to mask.** Decide which bits count as bad from Table 16 of the Explanatory Supplement and document it. Compare same-detector, similar-wavelength frames because the PSF changes with position and wavelength. **Align frames on the sky (WCS, reference stars) before any differencing**: the NEOSSat tutorial shows that differencing unaligned frames flags every star as moving. Compute the expected position from proper motion and compare it with the measured track. Candidates follow the claim levels in project reference 7.2. Return numbers, uncertainties and the evidence used.
  - GET /api/stack?ra&dec&size&detector&from&to: **per-detector stack** (item 7). Co-add aligned frames of ONE detector within the time window (reproject onto a common grid, local background with `sep`, FLAGS masks, convert units first), return a PNG, the number of frames and the date span, and a "stacked" label. Never mix detectors.
  - GET /api/spectrum?ra&dec&source=exposures|allsky: flux versus wavelength for the position.
    - `exposures`: aperture photometry (aperture minus an annulus, as in the Mosaic tutorial, radii scaled to the 6.15" pixel) per single exposure, per detector, with VARIANCE errors and flagged points removed. Because it comes from single exposures it keeps dates, and the response says the points come from different times.
    - `allsky`: a fast quick-look from the DR1 **All-Sky Cube** tile (HEALPix order 5, NESTED, 12,288 tiles about 1.8 degrees, 512x512 pixels at 12.9", 102 channels = 6 bands x 17, channels 51 and 52 blank, ZODI already subtracted). Locate the tile with hpgeom, read `properties` from the HiPS root, build the tile URL as `.../hips5_cube/hips_20261026/Norder5/Dir{(ipix//10000)*10000}/Npix{ipix}_cube.fits` (read the real root from the archive, do not hard-code the date), and use SPECTRAL_CHANNELS and WCS-WAVE for wavelengths. Label it "stacked, no time information", never use it for motion or brightness change, mention possible stripes near bright emission lines (helium 1.083 micron), and do not use the HiPS PNGs for science (they are display only with a fixed 0 to 40 MJy/sr stretch).
    - Unit conversion: convert MJy/sr to uJy per pixel by multiplying by the Solid Angle Pixel Map (arcsec squared, one file per detector from the browsable calibration folder or the cloud bucket). The factor is `uJy = MJy/sr * 23.5045 * solid_angle_arcsec2` (the Mosaic tutorial uses the same constant for mJy: `* 23.5045 * pixscale^2 / 1000`). Confirm the constant against astropy units in a unit test.
  - GET /api/difference?a&b&ra&dec&size&mode=subtract|add: align the two cutouts on the sky with the WCS, apply background and flag handling, return a PNG plus statistics. Default to wavelength-matched pairs (same band). If the pair is not wavelength-matched, return a warning the UI must show.
  - GET /api/overlays?ra&dec&fov&date: Gaia **DR3** sources (positions propagated with proper motion from the catalogue reference epoch, confirmed from the catalogue header, to the frame date) via the ESA Gaia archive (astroquery.gaia or TAP; MAST as a documented fallback), and WISE/NEOWISE catalogue sources with their epochs, in the cutout's pixel coordinates and in RA/Dec. Gaia has no infrared fluxes (its G band spans about 330 to 1050 nm), so use it for positions, motion and reference stars, never as a flux comparison.
  - GET /api/detectors?ra&dec&release: which of the six detector arrays and bands have exposures covering the position, grouped by pointing, with band ranges and resolving powers read from the data and archive documentation (about 0.75 to 5.0 micron, R from 35 to 128), plus the observation count (a hits-style coverage summary).
  - GET /api/moving?name&from&to: IRSA MOST with `catalog=spherex` (`https://irsa.ipac.caltech.edu/cgi-bin/MOST/nph-most?...`, output as a VOTable or ASCII table; verify the exact parameter names because the page documents both `outfmt` and `output_mode`). Returns the SPHEREx images that contain a named asteroid, comet or planet, with predicted positions.
  - Optional (COULD, section 4.9): GET /api/context/dss, /api/context/ssois, /api/context/neossat.
- Combining detectors is per-detector stacking only (above). The Mosaic Tool has no API and the Spectrophotometry Tool is a GUI batch job, so they are link-outs.
- Cache: disk cache plus SQLite, keyed by release label, endpoint and parameters. Add scripts/prewarm_targets.py that runs the real queries for the five targets and fills the cache, so the pitch works if the network is slow. This is a cache of real results only, never synthetic. Responses state whether they came from the cache and when they were fetched.
- Errors: timeouts and retries with backoff, clear messages, no stack traces to the browser. Keep queries small (arcminutes). Fetch cutouts in parallel with a modest limit (the tutorial used 10 workers; be gentler to the public server).

3. THE EIGHT PANELS (behaviour)
Every image shown anywhere carries the **data-honesty bar** directly under it: release, date (UTC), detector, wavelength, flag summary. Units are always shown.

3.1 SEARCH (items 1, 8 field of view, 10 URLs)
- One input accepting a target name (resolved through /api/resolve), RA/Dec in decimal degrees or sexagesimal (colons, spaces or h m s d m s letters, as WiseView accepts), with the validation messages from the project reference (RA 0 to 360, Dec -90 to +90), and a constellation or catalogue-star search that reuses the dome's data.
- A **solar-system object** search by name (asteroid, comet, planet) through /api/moving, listing SPHEREx frames that contain it, and "go to this frame".
- Field of view control (view FOV for the dome and cutout size for images, with presets and a numeric field) with the note that larger fields track faster movers but take longer to transfer.
- Coordinate-based URL: reflect centre and field of view as ?ra=&dec=&fov=, plus the panel state that matters (release, date range, target, selected frame, and `embed=1`) with strict validation. A "Copy view link" and a "Copy embed code" (an iframe snippet) button. The share-card QR keeps its selection-only URL from prompt 06, which must not break.
- Show the epoch of every coordinate that is displayed.

3.2 TARGETS (item 6)
- A list of the five targets. Each row has "Fly to" and the resolved coordinates (with epoch, proper motion applied), plus a state: not run, running, or the result.
- "Run test" per target and "Run all": for each target run the real pipeline (resolve, query observations, retrieve at least one cutout, run the analysis). Fill a **test matrix** with pass, fail or no-data per step (resolve, observations found with count and date range, cutout retrieved, analysis ran), with the reason when it is not a pass. Record the final matrix in docs/01-project/test-matrix.md with the date it was run.
- Optional bonus row: **3I/ATLAS** (SPHEREx observed it in August and December 2025), using the observation table's predicted comet positions per exposure. It is extended, so label it and do not run point-source photometry on it. Label predicted positions "predicted".
- State on the panel that these are test targets and not claimed discoveries, and show the WISE 0855 epoch note.

3.3 OBSERVATIONS (items 2, 3)
- "Retrieve for this view" (centre and field of view from the dome) or "Retrieve for the selection". Filters: release (from /api/releases), detector, date range, "wavelength-matched only" (default on).
- A time-ordered table (true date, not index) with date, detector, central wavelength, release, flags summary and a coverage tick. Selecting rows sets the frames used by Time-lapse and Compare. Show the count, the date span, a clear "no observations found" state, and the reminder that SPHEREx revisits each position about every six months.
- A mini timeline on a true time axis so uneven spacing is visible, grouped by survey epoch where it can be derived.
- Per-frame metadata (item 9): a "Metadata" disclosure showing key FITS header fields, units, WCS summary and release, and the **flagged-pixel counts** from the `L2 N_*` header keywords.

3.4 TIME-LAPSE (item 4)
Model the viewer on WiseView's ideas (credit them, never copy code or images):
- An image viewer for the retrieved cutouts in date order: play and pause, previous and next, speed control, loop, a scrubber on the true time axis, first-vs-latest toggle, zoom and pan, invert and stretch controls (asinh with a "linearity" control and percentile or fixed trim), and click to re-centre.
- A large **epoch label** for the current frame, an **epoch legend** (marks showing which frames are shown, added, subtracted or unused), and a **dashed border flash when the loop restarts** so users can tell real consistent motion from a reset.
- A **sliding time window** option (stack the frames of one detector inside a half-year window, using /api/stack) to raise signal-to-noise, always labelled "stacked".
- **Default speed 500 ms per frame (2 per second), never above 3 flashes per second by default, and a step-through mode.** Autoplay is off. Under prefers-reduced-motion start paused in step mode.
- Handle truncated and differently shaped cutouts by padding to the field with a visible "outside the detector" mask, never by stretching.
- Preload frames sequentially with a small concurrency limit and a memory cap (for example 120 frames), as bitmaps drawn to a canvas. Playback uses requestAnimationFrame and refs, not React state per frame; the scrubber and the data-honesty bar update through direct DOM writes.
- Motion trails appear only from measured centroids (from /api/analysis), never from predictions. Predicted positions are drawn differently and labelled "predicted".
- Connect the **Play button of a selected region** (from prompt 05): it opens this panel centred on the region's centre with the current cutout size and shows a plain notice: "Showing a cutout at the region centre, not the whole constellation." Remove the old "Time Machine is not connected yet" message once it works.
- Link-outs: "Open in WiseView" for the current position (`http://byw.tools/wiseview#ra=RA&dec=DEC&size=ARCSEC&band=3`), and "Open in SPHEREx Data Explorer".

3.5 COMPARE (items 5, 8)
- Pick frame A and frame B (from the retrieved list, defaulting to the first and latest wavelength-matched pair). Modes: **blink** (A/B alternation, default 500 ms, at most 3 flashes per second, with a step-through mode), **side by side**, **difference** (A minus B), **add** (A plus B) and **subtract** (B minus A). Show an epoch legend like WiseView's.
- If A and B are not wavelength-matched, show a visible warning that differences may come from wavelength and not from change. Show the statistics from /api/difference. Frames are aligned on the sky before any arithmetic.
- Invert, stretch and zoom controls shared with the viewer.

3.6 CHANGE (item 5)
- "Analyse this field": runs /api/analysis and shows the centroid track (arcsec versus time) and the flux series (with error bars) for the target and a few neighbours, in Plotly.
- Candidates list with an **Evidence Card** for each: frames used, dates, detector, wavelength, flags, measured versus predicted position, and a plain-language confidence note. Use only the claim levels "observed change" and "candidate (possible mover or variable, needs verification)". Never use the word "discovery" and never present a candidate as confirmed. Include the false-positive checks from project reference 7.2 (reference stars aligned, Gaia or WISE or SIMBAD predictions, persistence across independent frames, and a note that unaligned differencing creates false motion).
- Highlight candidates on the viewer with markers, and let a click on a candidate jump to the frames used.

3.7 SPECTRA (item 7)
- A detector overview for the position: the six bands, which have coverage, their wavelength ranges, resolving powers and the number of exposures per band (a hits-style summary).
- **Stack by detector**: per-detector stacks with the frame count and date span, shown side by side for the detectors that have coverage. Never combine them into one brightness. An optional **false-colour composite** may show up to three detector stacks as labelled channels, marked "not natural colour".
- A **channel explorer** over the 102 channels (6 bands x 17 channels, with channels 51 and 52 shown as blank): choose a channel with a slider and a numeric field, and show the nearest real frame for it, with its true wavelength from the file, not a rounded table value. Never hard-code zone counts or pixel numbers. Offer the **narrow-band map** technique from the Mosaic tutorial: an on-band channel minus the average of nearby continuum channels (for example for the PAH 3.3 micron feature), labelled as a stacked derived map.
- "Generate spectrum": build the spectrum for the current position on demand (/api/spectrum), flux versus wavelength with error bars, flagged points removed, units shown (uJy or mJy), and an optional second position to compare against. Mark known spectral features (Pa-beta, Pa-alpha, Br-gamma, Br-beta, Br-alpha, PAH 3.3 micron, CO and others) as optional dotted guides, taking the wavelengths from a cited source, and note that **small offsets between detectors are expected** (they are visible in IRSA's own mosaic spectrum). State on the chart which source was used (`exposures`: different times, or `allsky`: stacked, no time information).
- Link-outs: "Spectrophotometry Tool" and "Mosaic Tool" in the SPHEREx Data Explorer, with the note that those are batch jobs that take minutes to hours.

3.8 OVERLAYS (items 9, 10)
- Toggles for **Gaia DR3** and **WISE/NEOWISE** markers on the viewer, with the epoch handling above, and a click on a marker shows its catalogue values. Optional (COULD): SPLICES ice-source targets as a third catalogue. Show the credit for each catalogue in the panel.
- Frame metadata and a contamination and quality summary for the current frame: counts by flag name from the `L2 N_*` keywords, percent of the cutout masked, source, saturated and persistence pixel counts, and a note that the SOURCE flag marks known sources and is not a defect.
- A **releases section** driven by /api/releases (names, the label used everywhere, last ingest time when available) that shows how new releases appear automatically, with the SPHEREx release timeline in plain words (DR1 for Surveys 1 and 2, QR3 for Surveys 3 and 4) and the required DR1 citation and acknowledgement.
- The **"Data and credits"** block listing every link in section 0.1.
- The context archives (section 4.9) when enabled.

3.9 VIEW (the old buttons)
Move the existing Horizon, Grid and Labels toggles, zoom in and out, and Reset view into this panel with the same behaviour and the same keyboard shortcuts, and remove the old text buttons. Add an "Embed mode" note describing the `embed=1` URL parameter.

4. SCIENTIFIC AND HONESTY RULES (from AGENTS.md and the link review)
- Time and wavelength are entangled in SPHEREx: default to wavelength-matched sequences and compare same-band images across dates. The wavelength of a cutout comes from the spectral WCS.
- Never fabricate data. Illustrative or placeholder things are labelled. Real failures are shown as failures.
- ZODI is not subtracted from IMAGE in spectral images (it is subtracted in the all-sky cube): check headers and never subtract twice. Do local background handling.
- Differences between images are not proof of motion or change. Use the claim levels, show the Evidence Card, and align before differencing.
- PSF changes with position and wavelength: compare same-detector, similar-wavelength frames.
- Credit every dataset and tool really used (SPHEREx and NASA/IPAC IRSA are required, with the DR1 DOIs and acknowledgement; Gaia and ESA; WISE and NEOWISE and unWISE for WiseView ideas; SIMBAD; Astropy, Astroquery and the other packages; CADC and CSA with the Open Government Licence - Canada where used).
- 4.9 **Optional context layers (COULD, after every MUST and SHOULD item works).** The team wants the NEOSSat and CADC links used, but they are different missions and wavelengths and **never SPHEREx data**. Each result carries a clear label ("optical, different mission, context only") and its own credit. Implement only what you can verify is reachable from code, otherwise provide the link-out:
  - **DSS historical image** for the current position (epochs about 1950 to 2002, 1.0 to 1.7" pixels) as a long-baseline comparison beside the latest SPHEREx frame, for example for Barnard's Star. Find and verify a programmatic DSS endpoint (CADC DSS, the STScI DSS server or NASA SkyView), show the plate survey, epoch and copyright from the FITS header, and note that brown dwarfs are invisible in optical light.
  - **SSOIS** known solar-system object check (by name, with the CADC, JPL Horizons or MPC ephemeris option) to help decide whether a "mover" is a known object; cite Gwyn, Hill and Kavelaars (2012). Use MOST first; use SSOIS only if a programmatic route is confirmed, otherwise link out.
  - **NEOSSat** observation list for the position through the CADC TAP service (collection NEOSSAT, ADQL on caom2.Plane as in the NEOSSat tutorial, or astroquery.cadc), with date, exposure and a link to the CADC and CSA data; cutouts through the CADC SODA/caom2ops service when confirmed. NEOSSat frames are about 1000x1000 pixel optical images, so label them and do not compare brightness with SPHEREx.
  - Credits and licences: NEOSSat dataset record (Open Government Licence - Canada, record ID 62d8033b-87b6-4322-8d5f-e26bebf934c1) and the CADC notice that its data are for professional use.
  This overrides the AGENTS.md line that calls NEOSSat and CADC background only: update that line when you finish, saying they are optional context layers after the MUST and SHOULD items.

5. PERFORMANCE AND COMPATIBILITY
Keep the dome fast (docs/03-design/prompts/04-sky-dome-performance.md): render on demand, no React state per frame, lazy-loaded panels, no growth of the initial bundle (report its size before and after). Image playback must stay smooth on a mid laptop and not stall the main thread for over 50 ms. The UI must work in current Chrome, Edge, Firefox and Safari, and on phones. Backend calls are cancellable, show progress, and never block the dome. Public archive servers are shared: limit concurrency and cache aggressively.

6. ACCESSIBILITY
Toolbar and panels as in section 1. Every chart and image has a text or numeric equivalent (a table of the plotted values, the data-honesty bar). Results and errors are announced in aria-live regions. Forms have labels. Blink and play controls respect the photosensitivity rules. All controls work by keyboard. Contrast is AA, with no blue text on ink.

7. VERIFICATION (report honestly)
- Backend: pytest unit tests (WCS 0/1-based indexing including the CRPIX conversion, FLAGS masking by bit name with bit 21 not masked, flag bits read from headers, uJy conversion against astropy units, proper motion propagation using Barnard's Star as a check against SIMBAD values, HEALPix tile lookup against the tutorial's example (RA 60.8109955, Dec 51.3404038 gives order 5 nested pixel 445), input validation, cache keys include the release label, detector 3 zone shape 11x41) and a separate `live` test group that hits the real archive. Say which pass.
- Run the real pipeline end to end for all five targets and fill docs/01-project/test-matrix.md with the honest result of each step. If a target has no SPHEREx coverage yet, it is "no-data" with the reason, not a failure of the app.
- Verify every "verify" item from docs/02-research/link-review.md against the live service and report the outcome (MOST parameter names, the cutout parameter page, DSS and SSOIS programmatic routes, Gaia access, cloud paths).
- Cross-check: for at least two targets, confirm that every returned footprint covers the requested position, and compare the obs_id list and dates with what IRSA's SPHEREx Data Explorer shows (say clearly if you could not do this comparison).
- Browser (show the Browser pane first so the viewport is non-zero): walk through each icon and panel with real targets (for example WISE 0855 and Barnard's Star): search by name, by RA/Dec and by solar-system object, retrieve observations, play the time-lapse, blink and difference two frames, run the change analysis, stack one detector, build a spectrum from exposures and from the all-sky cube, toggle Gaia and WISE overlays, open the metadata and flags, open the WiseView and Data Explorer link-outs, copy a view link and an embed link and reload each to confirm the view is restored. Take a screenshot of each panel.
- Keyboard-only operation, 390 px wide, prefers-reduced-motion, and the tooltip names on hover and focus.
- Test in Chromium, Firefox and WebKit if available, and say which you could not run.
- Run npm run lint, npm run typecheck and npm run build, plus the backend tests. Do not commit or push.

8. ORDER OF WORK
Phase 0 (connectivity, installs, verify items) then the thin backend slice (resolve, observations, cutout PNG, tested on WISE 0855) then the toolbar and the Search, Targets and Observations panels (requirements 1, 2, 3, 6) then Time-lapse (4) then Compare and Change (5, 8) then Spectra with per-detector stacking and the all-sky quick-look (7) then Overlays, URLs, embed mode and releases (9, 10) then the View panel and cleanup, then full verification, and only then the optional context layers (4.9) and the optional extras (3I/ATLAS, SPLICES). After each phase, run the checks and keep the app working. If you are blocked, stop and report the blocker precisely instead of working around it with fake data.

9. DOCUMENTATION UPDATES
Update AGENTS.md where it is now wrong (NEOSSat and CADC line, the item 7 meaning, QR2 not searchable, the 6.15" pixel scale), add docs/01-project/data-credits.md, docs/01-project/test-matrix.md and services/api/README.md, and list in your report anything in docs/02-research/ that you found to be wrong.

OUT OF SCOPE
Sonification (a separate feature), the Discovery Room, restyling the share card or dialog, new dependencies beyond those approved above (ask first; for example Aladin Lite, which the challenge text suggests, needs approval), scraping any GUI-only tool, and committing or pushing.

FINAL REPORT
A table with each of the 10 NASA requirements, its status (working, partial, not done), where it lives, and the evidence (test result or screenshot). Then: what real data was retrieved for each target, the test matrix summary, what was cached, the dependencies added, bundle size before and after, the result of each "verify" item, what you could not verify, known limitations, and anything that needs a team decision (for example region tiling for Play).
