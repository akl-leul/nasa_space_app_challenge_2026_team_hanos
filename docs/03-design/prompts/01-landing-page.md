# Prompt 01 — Build the HANOS landing page

Paste everything below the line into the agent.

---

Build the HANOS landing page: the first screen of our NASA Space Apps 2026 app ("Planet X and SPHEREx").

## Read first (in this order)

1. `AGENTS.md` — project rules and the **Design System** (colours, the landing-vs-app typography split). It overrides anything below that conflicts.
2. `node_modules/next/dist/docs/01-app/` — this is Next.js 16 with breaking changes. Read the guides on layouts and pages, route groups, fonts (`next/font`), CSS and metadata before writing code.
3. `docs/03-design/assets/landing-mockup.jpg` — the **approved visual target**. Open it and match it.
4. `docs/03-design/landing-page-implementation-prompt.md` — use it for composition, layering, the blob-reveal behaviour, animation, responsive and accessibility detail. Ignore its brand name ("VOYAGER"), hex colours and placeholder copy; the mockup and `AGENTS.md` win.

## Scope

One page at `/` with two states: **Hero** and **Challenge reveal** (a black blob panel that opens over the hero). Plus a tiny stub for the EXPLORE destination. Do not build any app feature, data fetching or backend.

## Structure

- Create route groups: `src/app/(landing)/` (layout + `page.tsx` for `/`) and `src/app/(app)/` (layout with the `app-shell` class from `AGENTS.md`).
- Move the display fonts into `(landing)/layout.tsx` only (`next/font/google`), so no other route loads them.
- Keep `src/app/layout.tsx` minimal (html, body, metadata). Replace the "Create Next App" title and description with real HANOS metadata.
- Delete the create-next-app starter content and unused starter SVGs in `public/`.
- Put colour tokens in `src/app/globals.css` via Tailwind v4 `@theme`: `--color-blue #1F48FF`, `--color-cream #F5F3ED`, `--color-ink #111111`. No other colours, no hard-coded hex elsewhere.
- Components in `src/components/landing/` (for example `Header`, `Hero`, `Blob`, `Sparkle`, `Asteroid`, `ChallengePanel`). Colocate small helpers. Server Components by default; `"use client"` only for the reveal and any pointer/scroll effects.
- Add `(app)/explore/page.tsx` as a stub (one line of text, using the 9px / regular-weight rule) so the EXPLORE button has a real target. It lives under `(app)`, not `(landing)`.

## Visual spec (from the mockup, ~1280×806; positions approximate, % of viewport)

- **Background:** cream `#F5F3ED` with a subtle paper grain (SVG `feTurbulence` or tiny tiled noise). Strict monochrome: cream, ink, plus blue on the button only.
- **Header** (transparent, no divider): wordmark **HANOS** at left (bold slab, ~x 9%, y 6%). Five right-aligned nav links in condensed uppercase with tracking: NEWS, OBSERVING, RESOURCES & EDUCATION, COMMUNITY, ABOUT US. These labels are placeholders from the reference design, so render them as inert `href="#"` links and note that in a comment.
- **Title:** "EXPLORE" over "THE SPACE", centred (x ~24–76%, y ~29–56%), huge heavy slab caps. White fill, thick ink outline, hard ink extrusion toward the lower-left, no blur. Very tight leading (~0.9). Use `<h1>`. Build the extrusion with stacked `text-shadow` and `-webkit-text-stroke` / `paint-order`, and verify it reads cleanly at small widths.
- **Subtitle:** two lines, centred, condensed uppercase, wide tracking (~y 63–67%). **Placeholder copy**: the mockup text is a lorem-style line about affiliate programs. Replace it with real copy: *"Explore real SPHEREx infrared observations of the sky across time, spot what moves or changes, and hear the data."* Use the byline slot for *"2026 NASA Space Apps · Planet X and SPHEREx"* in the bold slab face (the mockup's "James Singleton" is placeholder).
- **EXPLORE button:** centred under the byline (~y 80%), pill shape, 2px blue outline, blue condensed uppercase text, transparent fill. Real `<a>` to `/explore`. Hover/focus: fill blue with cream text. Visible focus ring.
- **Blobs:** solid `#111` organic SVG paths, smooth curves, no straight edges. Left-middle (x 3–25%, y 19–63%), far-left sliver (x 0–3%, y 29–50%), bottom-left large and cropped (x 0–29%, y 65–100%), top-right tall (x 80–97%, y 13–61%), right sliver (x 98–100%, y 41–60%), bottom-right large and cropped (x 70–100%, y 74–100%).
- **Sparkles:** 4-point cream stars inside the blobs, a few sizes (left blob at ~x 20% y 27% and x 17% y 34%; far-left ~x 1.5% y 39%; bottom-left ~x 3% y 77% and x 21% y 89%; bottom-right ~x 93% y 88%).
- **Asteroids:** two small sketchy ink-line rocks right of the title (~x 76% y 60% and x 70% y 73%).
- **Illustrations from the earlier brief** (astronaut, Saturn, alien, moon, UFO, telescope) are **not** in this mockup. Do not add them in this pass.
- **Layering:** paper → blobs → sparkles/asteroids → title and text → button.
- The page is a fixed-viewport composition (`100dvh`). Position by percentage or `vw`/`vh` units so it holds at 1280×800, 1440×900 and 1920×1080. The title scales with `clamp()`.

## Typography (landing only)

Heavy slab display for the title, wordmark and byline. **Bebas Neue** for nav, subtitle and button. The exact mockup fonts are unidentified: pick a slab from Bowlby One, Chango or Alfa Slab One by comparing against the mockup, and say which you chose and why. Do not claim it is the original font. No text on this page should depend on the 9px rule; that rule is for `(app)` only.

## Interaction: Challenge reveal

- A focusable `<button>` wraps the **left-middle blob**, with accessible name "Open: about the challenge". Click/tap, Enter or Space opens it.
- A black organic shape expands from that blob over about 1–1.5 s (SVG `clip-path`, mask or scaled blob path, liquid leading edge) until it covers the centre. Hero title and subtitle are covered. White text fades in inside it. Closing reverses it in ~1 s, and the hero title slides back in from the left (about −20% to 0 with a fade).
- Panel content (real, from the project docs; all cream text on ink, `<h2>`): heading **"Where do things move?"** and 2–3 short paragraphs: SPHEREx is mapping the whole sky in infrared (0.75–5 µm, 102 colours) since March 2025. Historically astronomers found new objects by comparing images from different dates, as with Pluto, and SPHEREx produces too much data to compare by hand. Our app lets anyone enter sky coordinates, see real observations over time, and notice what moves or changes. "Planet X" is the scientific motivation, not a promised result. Do not claim any discoveries.
- Close with the close control, Esc, **Back to exploring**, or a click on the black surface. On open, move focus to the heading, and on close restore it to the trigger and preserve scroll. Make the rest of the page `inert` while it is open. Lift the nav above the blob in cream so it stays readable (mark this as a deliberate departure from the reference).
- A circular ring cursor (2px cream outline, eased follow) is optional and only on fine-pointer devices. Skip it if it adds risk.

## Motion

- Intro, once on load: title fades from ~10% to full opacity with its extrusion over ~1 s (ease-out).
- Subtle idle drift on sparkles and asteroids (a few px and a couple of degrees over 6–8 s, alternating), via `transform` only.
- `prefers-reduced-motion: reduce`: no intro, drift or morph. Swap states with a ~150 ms opacity crossfade.

## Responsive

- ≥1024px as above. 768–1023px: title ~9vw, keep the composition. <768px: nav collapses to a menu button (a real `<button>` with an open/close dropdown), title ~14–16vw, blobs scaled and cropped, panel text ~14–15px and scrollable inside the black shape if it overflows. No horizontal scroll at any width.

## Accessibility

Semantic landmarks (`header`, `nav`, `main`), one `<h1>`, `<h2>` in the panel. Decorative SVGs get `aria-hidden`. Text contrast AA (ink on cream, cream on ink; never blue text on ink). All controls keyboard operable with visible focus. Subtitle at least 14px on real screens.

## Out of scope

Any data fetching, backend, forms, auth, analytics, other pages beyond the `/explore` stub, the astronaut/Saturn/UFO illustrations, new dependencies (ask first), and committing or pushing.

## Done when

1. `npm run lint`, `npm run typecheck` and `npm run build` pass.
2. Run the dev server and check `/` in the browser at 1280×800, 1920×1080, 768 and 390 wide against `landing-mockup.jpg`. Report only comparisons you actually made, and do not claim a pixel-perfect match.
3. The reveal opens and closes by mouse and keyboard (Enter, Space, Esc) with correct focus handling, and works with reduced motion.
4. `/explore` renders its stub and follows the 9px / regular-weight rule, and `/` loads the display fonts while `/explore` does not.
5. Final message lists the files created, the slab font chosen, any assumptions, and anything left as placeholder.
