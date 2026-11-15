## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

---

# HANOS — Agent Instructions

HANOS (working name in the docs: COSMIC PULSE) is our entry to the **2026 NASA Space Apps Challenge, "Planet X and SPHEREx"**, Addis Ababa local event. Users enter sky coordinates, see real SPHEREx observations as a time sequence, can spot objects that move or change brightness, and can hear the data (sonification).

Read `docs/README.md` first. Source of truth for scope: `docs/01-project/project-reference-v1.0.pdf`. Read the briefings in `docs/02-research/data-briefings/` before touching any data code. Where a briefing corrects the project reference, the briefing wins.

## Deadlines (Addis Ababa local time)

- Sun 15 Nov, **1:00 PM**: slides due. Pitch 2:00–4:00 PM.
- Sun 15 Nov, **11:59 PM**: global submission closes.
- Prefer a thin working end-to-end slice over unfinished breadth. Feature freeze Day 2 afternoon.

## Priorities

Finish all MUST items before SHOULD, and SHOULD before COULD.

| Priority | Items |
|---|---|
| MUST | RA/Dec input, real SPHEREx retrieval, time-ordered image display (timeline, play/pause, speed), basic image comparison (blink, difference), test on the five targets |
| SHOULD | Change detection (motion, brightness), sonification, 102-channel spectral explorer |
| COULD | Gaia/WISE overlays, citizen classification ("Discovery Room"), shareable `?ra=&dec=&fov=` URLs, advanced anomaly detection |

Five required test targets: **Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis.** Only WISE 0855's coordinates came from NASA (RA 08h 55m 10.831s, Dec −07° 14′ 42.53″). Resolve the other four at runtime (SIMBAD) and apply proper motion for the observation epoch. Never hard-code coordinates from memory. WISE 0855's WiseView position differs by ~32″, so epoch-correct it too.

## Application sections

1. **Sky Explorer** — coordinates (RA/Dec or name), field of view, retrieval, image viewer.
2. **Cosmic Time Machine** — time-lapse, playback, comparison, motion trails (from measured centroids only).
3. **Discovery Lab** — difference imaging, candidates, brightness.
4. **Cosmic Sound** — motion, brightness and spectral sonification (Web Audio API).
5. **Spectral Explorer** — flux vs. wavelength with error bars.

## Scientific rules (non-negotiable)

- **Never fabricate data.** No invented observations, dates, spectra or detections. Anything illustrative or placeholder must be labeled as such in the UI and code.
- Claim levels: *observed change* → *candidate* ("possible mover/variable; needs verification") → never "discovery". Differences between images are not proof (wavelength, PSF, alignment, artifacts). Show an **Evidence Card** for highlighted objects.
- **Data-honesty bar** under every image: release (DR1/QR3), date, detector, wavelength, flag summary. Native SPHEREx pixel scale is 6.15″/pixel.
- **Time and wavelength are entangled** in SPHEREx. Default to wavelength-matched frame sequences, and compare same-band images across dates.
- **Co-added products (mosaic cube, HiPS, all-sky cube) cannot show motion or brightness change.** Use them for spectra only, and label them as stacked. Time-domain features use single-exposure cutouts.
- **Stacking (Item 7):** Stacking is strictly per-detector. Never co-add or blend frames across different detector arrays (1–6) or across disparate wavelength bands; reproject and stack only within a single detector.
- **Releases:** prefer DR1 + QR3 (uniform calibration across Surveys 1–4). QR2 is officially retired and omitted from primary pipeline queries. Read collection names from IRSA dynamically, not hard-coded. Put the release label in every cache key and API response.
- **FLAGS:** bit 21 means SOURCE, not "good pixel". Build masks from bad-pixel bits and read the names from each file's header keywords.
- **PSF:** accept both the legacy PSF layer and the `EPSF` table (version 7+). Never hard-code zone counts. Prune the full 441-zone table down to the single applicable zone stamp for storage efficiency.
- **ZODI** is not subtracted from IMAGE. Check headers before subtracting, and never subtract twice.
- Convert MJy/sr to µJy (Solid Angle Pixel Map) before comparing objects.
- Gaia positions need proper-motion propagation to the observation date (Gaia DR3 reference epoch 2016.0 — confirm in the catalogue header).
- Code against FITS extension names and header keywords, not fixed pixel numbers. Watch 0- vs 1-based pixel indexing (keep the unit test).
- **Sound** comes only from real measurements. Show the mapping table in the UI, state that sound does not travel from space, give every audio view a text/numeric equivalent, volume limit, stop button and a visual cursor. Start audio only after a user gesture.
- **Photosensitivity:** blinking ≤ 3 flashes/s by default (500 ms default), with a step-through mode.
- Credit every dataset and tool actually used: SPHEREx and NASA/IPAC IRSA (required), plus Gaia/ESA, WISE/NEOWISE, WiseView if used. Do not copy WiseView code or images.
- NEOSSat and CADC material, as well as DSS optical imagery, are optional background/context layers only. Do not spend time on them before the MUST items work.

## Architecture

- **Frontend:** this repo — Next.js (App Router) + React + TypeScript + Tailwind CSS 4, code in `src/`. Plotly for plots; Web Audio API for sound.
- **Backend:** FastAPI + Astropy/Photutils/NumPy with a SQLite and `.npz` cache, in `services/api/` (run it with `npm run dev:all`). Keep FITS processing in Python, not Node. Observation search uses IRSA SIA2 (TAP is too slow and was the cause of a false "no observations" bug); archive failures are retried and raised, never swallowed or cached.
- **Data flow:** browser → API validates RA (0–360°), Dec (−90…+90°), FOV, dates → IRSA SIA2 + cutout service (Astroquery IRSA first, PyVO/TAP fallback; new data appear in TAP before SIA2) → Astropy processing → JSON (numbers, metadata) + PNG (server-rendered cutouts with a documented stretch) → React.
- **API (implemented, real data only):** `/api/health` (live archive probes), `/api/releases`, `/api/resolve`, `/api/observations`, `/api/track` (background job: frames, measured positions and fluxes, motion fit, brightness test, Evidence Card), `/api/frame.png`, `/api/spectrum` (`allsky` cube or `exposures`), `/api/stack`, `/api/difference`, `/api/overlays`, `/api/detectors`, `/api/moving`, `/api/context/*`. Documented in `services/api/README.md`. **Never add mock, sample or simulated data, not even for UI development**: if an archive is slow, show progress and use the last real stored result.
- **Demo reliability:** pre-compute and cache the five targets. The live demo must not depend on network speed.
- **Production:** `https://hanos.surf`. The website is on Vercel (`next build`, `/api/*` rewritten to `API_BASE_URL`, required on Vercel); the API is a single-instance Docker web service on Render with a persistent disk at `/data` (`render.yaml`, `services/api/Dockerfile`). Procedure and checklist: `docs/DEPLOYMENT.md`. Do not add user-facing text that mentions local development. Requests slower than ~25 s must use the 202 + polling pattern (`services/api/longjobs.py`, `src/lib/api/poll.ts`), never a longer request.
- Handle missing data gracefully ("no observations found"). Keep queries small (arcminutes).

## Repository conventions

```
src/app/          routes, layouts (route groups: see Design System)
src/components/   shared UI      src/lib/    helpers, clients
src/config/       constants      src/types/  shared types
docs/             documentation (update it when behavior or architecture changes)
```

- Import with the `@/` alias (maps to `src/`).
- Before finishing a change run `npm run lint`, `npm run typecheck`, `npm run build`; for the API run `PYTHONPATH=. python -m pytest services/api/tests -m "not live"`. When you touch `src/lib/sonify/` also run `npm test` (Cosmic Sound mapping, tuning, MIDI, WAV; method in `docs/HANOS_METHOD_MASTERPROMPT.md`).
- Conventional Commits, short-lived branches, small PRs. Do not commit or push unless asked. Never commit secrets (`.env*` is ignored; document variables in `.env.example`).
- TypeScript strict. No `any` without a comment. Server Components by default; `"use client"` only for interactivity (player, audio, viewers).
- Accessibility baseline everywhere: keyboard reachable, visible focus, semantic HTML, WCAG AA contrast, colour-blind-safe plots, units always shown.

---

# Design System

These rules **override** the "dark astronomical theme" in the project reference and the colours, brand name ("VOYAGER") and placeholder copy in `docs/03-design/landing-page-implementation-prompt.md`. Keep that file for composition, layout and motion only.

## Colour tokens (the only colours allowed)

| Token | Value | Use |
|---|---|---|
| `--color-blue` | `#1F48FF` | Accent: primary buttons, links, focus, active state |
| `--color-cream` | `#F5F3ED` | Page background, text on black |
| `--color-ink` | `#111111` | Text, blobs, panels |

**One approved exception — the sky dome (`/explore`):** a region-boundary red, `--color-region` (suggested `#1F48FF`, about 50% opacity at rest, 100% on hover), used only for constellation boundary lines. Stars and labels stay cream on an ink background, and selection uses blue as line/glow only. See `docs/03-design/prompts/02-sky-dome.md`.

**Landing page exception (`/` and `/challenge`, route group `(landing)`):** the landing page is a port of the team's own page, github.com/melat320/hanossurf (day and night modes, blue-navy blobs and rings, the three self-hosted faces, team portraits). It keeps that page's palette and type exactly, so the three-colour rule and the font rules below do not apply to it. Every landing colour lives in `src/app/(landing)/landing.css` as variables on `.hanos`; the landing CSS is scoped under `.hanos`, so nothing leaks into `/explore`. The rest of this section still applies to `(app)`.

**Share card exception:** Share card (canvas/PNG only): follows the team's Hanos Cards artwork in docs/03-design/. It may use the Hatton and Inter fonts, textured backgrounds tinted gold, slate or graphite, frosted glass slabs and a stylised star flare. Hues other than cream, ink and blue are allowed only inside the card canvas. The dialog and the rest of the app are not affected.

Define them once in `src/app/globals.css` (Tailwind v4 `@theme`) and never hard-code hex values elsewhere. Do not add other hues, gradients or shadows. Tints may be made with opacity of these three only. Image data is the exception: plots and cutouts need a colour-blind-safe scale, kept inside plot components.

Contrast: ink on cream is fine. Blue on cream is about 5.5:1 (OK). **Blue text on ink is about 3:1 and fails AA for small text**, so don't use it. On ink use cream text, and blue only for borders, fills and large elements.

## Typography — two separate regimes

### 1. Landing page only (`/` and `/challenge`, route group `(landing)`)

Ported from github.com/melat320/hanossurf (see the exception above). Three self-hosted faces in `public/landing/fonts` (licences in `public/landing/licenses`), declared with `@font-face` in `landing.css`:

| Face | Used for |
|---|---|
| Hanos Display (`title.woff2`, cut to the glyphs of "EXPLORE THE SPACE") | The extruded hero title |
| Hanos Serif (`serif.woff2`) | Wordmark, names, headlines |
| Hanos Condensed (`condensed.woff2`) | Body text, navigation, buttons |

How it is built (read this before changing the landing page):

- Markup is server-rendered React in `src/components/landing/` (the page is complete HTML without JavaScript). Team data is in `src/config/team.ts`.
- Behaviour is TypeScript in `src/lib/landing/` (smooth scroll with vendored Lenis, the liquid challenge reveal, the pinned team story, the dock-and-gather, theme switch, page wipe). `LandingController` loads it as a separate chunk after the page paints, and `init.ts` undoes everything on route changes.
- `landing.css` was generated from the reference stylesheets by prefixing every selector with `.hanos` (state classes live on that wrapper), then a block that restores the browser's own defaults (the reference was written against them; Tailwind's reset would otherwise change sizes). Keep new landing rules inside `.hanos`.
- Ours, not the reference's: the two sky-map buttons ("SKY MAP" in the hero, "open Sky Map" in Our project) are links to `/explore`; the reference opened a dialog, which was removed.
- The picture in the project device frame (`public/landing/app-preview.svg`) is a label-free **illustrative placeholder**, not a screenshot and not SPHEREx data. Do not present either as real data.
- Fixed rules still apply: photosensitivity (no flashing), reduced motion honoured, keyboard reachable, visible focus.

### 2. Every other page (`(app)` route group)

- **Font size: 9px, everywhere.** Body, headings, labels, buttons, inputs, table cells, tooltips, plot text, nav. No exceptions.
- **Weight: regular (400) only.** No bold, semibold or medium. No `<strong>`/`<b>` styling, no bold `<th>`, no synthetic bold.
- Typeface: Geist Sans (UI) and Geist Mono (numbers, coordinates, code), already in `layout.tsx`. This is an assumption. Confirm it with the team.
- Build hierarchy without size or weight: **colour (ink vs. blue), uppercase, letter-spacing, spacing, rules/borders, position**.
- Implementation, so it can't drift:
  - Put the rule in a scoped base style, for example `.app-shell, .app-shell * { font-size: 9px; font-weight: 400; font-synthesis: none; }`, and apply `app-shell` in `src/app/(app)/layout.tsx`.
  - Load only weight-400 font files for these routes.
  - Do not use Tailwind `text-*` size or `font-*` weight utilities inside `(app)`.
  - Set plot libraries' font size and weight explicitly (Plotly `font.size: 9`).
  - Give headings, `button`, `input` and `select` `font: inherit`.
- **Accessibility caveat:** 9px is below the usual 12px minimum. We follow the product decision, so compensate. Use generous letter-spacing (≈0.04–0.08em) and line-height (≥1.5), AA-contrast colours, ≥ 24×24px hit targets, and respect browser zoom (never disable it). Flag any place where a 9px label is the only carrier of critical information.

## Layout and motion

- Landing and app are separate route groups with separate layouts. The root layout stays minimal (html, body, metadata).
- Landing: fixed-viewport composition, blob-morph reveal built as a real `<button>` (Enter/Space/Esc, focus moved to the panel heading and restored on close). Honour `prefers-reduced-motion` (no drift/morph, ~150 ms crossfade). No horizontal scroll at any width. Collapse nav to a menu below 768px.
- App: calm and data-first. Cream surface, ink text, thin ink rules, blue only for the primary action and the active state. Decoration must never hide data.
- Illustrations are decorative (`alt=""` / `aria-hidden`), and are not mission imagery or evidence. Label them as illustrative.

## Do / Don't

- Do ask before introducing a new dependency, colour, font or route group.
- Do mark assumptions in code comments and in `docs/`.
- Don't use bold or non-9px text outside the landing page. Don't use blue text on ink.
- Don't present illustrative figures as real SPHEREx data, and don't claim discoveries.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
