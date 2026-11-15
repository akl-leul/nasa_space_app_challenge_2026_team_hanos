# Documentation

Documentation for **HANOS / COSMIC PULSE**, our entry to the 2026 NASA Space Apps Challenge ("Planet X and SPHEREx"), Addis Ababa local event, 14–15 November 2026.

## Structure

```
docs/
├── 00-program/          Event logistics and deadlines
├── 01-project/          Project concept, scope, architecture, roadmap (source of truth)
├── 02-research/
│   ├── data-briefings/  Team briefings: plain-language summary + cross-check vs. project reference
│   └── source-extracts/ Raw reference material the briefings were written from
└── 03-design/           Landing page / UI design specs and visual assets
```

Numeric prefixes give reading order. File names are lowercase kebab-case.

## Index

| Path | Contents |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment: website on Vercel, API container with a cache disk on Render; settings, rollback, checklist. |
| [00-program/addis-ababa-local-event-program.pdf](00-program/addis-ababa-local-event-program.pdf) | Local event schedule. Slides due **Sun 15 Nov, 1:00 PM**; global submission closes **11:59 PM** the same day. |
| [01-project/project-reference-v1.0.pdf](01-project/project-reference-v1.0.pdf) | Project Reference v1.0 (12 Nov 2026): challenge, science, the seven features, architecture, team roles, roadmap, risks, success criteria, links. |
| [02-research/data-briefings/](02-research/data-briefings/) | Eight briefings (see below). |
| [02-research/source-extracts/](02-research/source-extracts/) | Eight raw extracts, numbered to match the briefings. |
| [02-research/link-review.md](02-research/link-review.md) | Review of every challenge resource link (pages, notebooks, tools, figures), exact endpoints and corrections to earlier docs. |
| [03-design/landing-page-implementation-prompt.md](03-design/landing-page-implementation-prompt.md) | Full spec for the monochrome illustrated landing page with blob-morph reveal (the "Voyager" reference design). |
| [03-design/landing-page-notes.md](03-design/landing-page-notes.md) | Notes on the illustrated presentation page (scroll flow, interaction, assets). Written against an earlier build; see caveat below. |
| [03-design/prompts/](03-design/prompts/) | Copy-paste agent prompts: `01-landing-page.md`, `02-sky-dome.md` (interactive 3D sky dome), `03-build-sky-dome-on-explore.md`, `04-sky-dome-performance.md`, `05-selection-visualizer.md` (star ring and region dashed outline with Play/Info/Share capsule), `06-share-card.md` (Share opens a downloadable PNG card with a QR code), `07-liquid-glass-share-card.md` (superseded by 08), `08-share-card-pixel-match.md` (share card matches the Hanos Cards artwork, with a pixel-diff harness), `09-top-right-toolbar.md` (icon toolbar implementing all NASA required and suggested features with real SPHEREx data). |
| [03-design/assets/](03-design/assets/) | Visual references: `landing-mockup.jpg`, `share-card-reference.jpg` (first layout reference for the share card), `share-card/` (renders and textures extracted from `Hanos Cards (Twitter Post) (1).pdf`), `sky-dome-reference.jpg` (a Stellarium screenshot, look-and-feel only), `selection-star.png` and `selection-region.png` (frames of the selection visualizer), `sky-map-visualizer-cards.pdf` (the two-page Canva export they come from). |

## Research briefings

Each briefing N pairs with the source extract of the same number. Priority is from each briefing's own label.

| # | Topic | Priority |
|---|---|---|
| 01 | SPHEREx data representations and product reference (releases DR1/QR3/QR2, MEF layout, IRSA tools) | Core |
| 02 | SPHEREx tutorial notebooks (query, cutouts, PSF, source discovery, mosaic, HiPS) | Core |
| 03 | WiseView multi-epoch blink tool (WISE/NEOWISE) | Supporting |
| 04 | ESA Gaia archive (astrometry, proper motion) | Supporting |
| 05 | NEOSSat mission archive | Optional |
| 06 | Canadian Astronomy Data Centre (SSOIS, DSS) | Optional |
| 07 | NEOSSat data extraction tutorial | Optional |
| 08 | NEOSSat open-data record (licensing and credits) | Optional |

## Key findings carried by the briefings

Cross-checked 14 Nov 2026 against the project reference:

- **DR1 exists** (Nov 2026+) and should be preferred alongside QR3; the project reference only lists QR2/QR3.
- **FLAGS bit 21 means SOURCE, not "good pixel".** Build masks from bad-pixel bits and read the header keywords.
- **EPSF replaces the legacy PSF layer** in files of version 7+; loaders must accept both.
- **WISE 0855 coordinates differ by ~32″** between WiseView and NASA's supplied position; epoch-correct all five targets.
- **Mosaic and HiPS cubes are co-added**: fine for spectra, unusable for motion or brightness change.
- NEOSSat and CADC material is background only and not needed for MUST items.

## Caveats

- `03-design/landing-page-notes.md` refers to `dist/index.html`, `SOURCES.md`, `.openai/hosting.json` and `../versions/…`, none of which are in this repository. Treat it as historical.
- The Project Reference, briefings and design prompt use the working name **COSMIC PULSE** while the repo and design assets use **HANOS**; naming is not yet reconciled.
- The design prompt describes a fictional "Voyager" brand as a reference; it is not our final copy.
- Archive details change. Re-check IRSA links before relying on any technical detail.
