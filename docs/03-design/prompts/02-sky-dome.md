# Prompt 02 — Interactive 3D sky dome (Sky Explorer)

Paste everything below the line into the agent. Run it after prompt 01 (the landing page links to `/explore`).

---

Build the **Sky Explorer sky dome**: an interactive 3D celestial sphere seen from Earth, with the real IAU constellation regions drawn as red boundary lines. It replaces the `/explore` stub and is the entry point for choosing sky coordinates.

## Read first (in this order)

1. `AGENTS.md` — project rules and Design System. The `(app)` typography rule applies: **all text 9px, regular weight only**, including every label on the dome.
2. `node_modules/next/dist/docs/01-app/` — Next.js 16 has breaking changes. Read the guides on Client Components, `next/dynamic`, route groups and the `public/` folder before coding.
3. `docs/03-design/assets/sky-dome-reference.jpg` — a **screenshot of Stellarium**, used only as the look-and-feel target (dark sky, faint stars with names, thin red region boundaries, region names, cardinal markers, bottom status bar). Do not copy Stellarium's data files, textures or code. Do not claim it is our work.
4. `docs/01-project/project-reference-v1.0.pdf`, section 3.3 (Sky Explorer: coordinate input, field of view, retrieval, viewer).

## Goal

The user stands on Earth (default **Addis Ababa, 9.03° N, 38.74° E**) inside a dome of sky. They drag to look around, zoom, hover a constellation region to highlight it, click to select it, and read exact **RA/Dec (J2000)** for any point. The selected position and field of view become the input for later SPHEREx retrieval.

## Scope for this pass

In scope: the dome, stars, constellation boundaries and labels, interaction, readouts, the status bar, an accessible non-3D alternative, URL state.
Out of scope: SPHEREx data retrieval, image cutouts, planets/Sun/Moon (need an ephemeris), Milky Way imagery, sonification, the backend. Do not add them.

## Dependencies

Approved: `three` and `@types/three` only (plain three.js, no wrapper libraries). Ask before adding anything else. Load the 3D scene as a Client Component with a dynamic import so it never runs on the server.

## Data (must be real, never invented)

- **Constellation boundaries:** the 88 IAU regions (Delporte boundaries). Use a properly licensed public source in J2000 coordinates, such as IAU boundary data from CDS VizieR (VI/49, B1875, must be precessed to J2000) or `d3-celestial` boundary data (already J2000). Check the licence, and note that some constellations (for example Serpens) consist of more than one polygon.
- **Stars:** a real catalogue (Hipparcos or Yale Bright Star Catalog, via a licence-compatible redistribution). Limit to roughly V ≤ 6.5 mag (about 9,000 stars) and keep the file small. Proper names only where the catalogue provides them.
- **Constellation names:** IAU names and abbreviations as given by the source. Do not translate or invent names.
- Vendor the processed data in `public/data/` (compact JSON or a binary buffer), and keep the build script in `scripts/` so the data can be regenerated. Do not hand-type coordinates.
- Record every source, licence and attribution in `docs/01-project/data-credits.md`, and show a one-line credit in the UI footer.
- Label in the UI: *"Reference star map from catalogue data. Not SPHEREx data."*

## Rendering

- Scene: camera at the origin inside a sphere (radius ~100). Perspective camera, default FOV **60°**, range about 5°–100°. Drag rotates (yaw/pitch, clamp pitch at ±90°, no roll), wheel and pinch zoom, with inertia.
- **Stars:** one `Points` object with a custom shader. Size and brightness from magnitude, device-pixel-ratio aware. Colour: cream only (`--color-cream`). Faint stars dimmer than bright ones. Optional faint colour tint is out of scope.
- **Boundaries:** one `LineSegments` object in red (token `--color-region`, see below). IAU boundaries run along lines of constant RA and constant Dec, **not great circles**, so subdivide each edge along the correct parallel or meridian. Straight chords between vertices would look wrong near the poles.
- **Region labels:** HTML overlay (not canvas text) at each region's visual centre, cream, 9px, regular weight, `pointer-events: none`, hidden when behind the camera, and thinned out when crowded or when zoomed out. Bright star names appear only at narrower FOV.
- **Frames:** default is the **equatorial frame** (RA/Dec fixed to the sphere). A "Horizon" toggle switches to local alt/az for the user's location and current time. It adds a subtle horizon ring or ground fade and cardinal markers (N, NE, E, SE, S, SW, W, NW, as in the reference). Compute sidereal time with a standard GMST formula in `src/lib/astro/`, with no extra dependency.
- Add an optional faint RA/Dec grid toggle. Default off.
- Colours: background ink `#111111`, stars and labels cream. Region lines red (below). Selection and hover use blue (`#1F48FF`) as **line fill and glow only, never as text**.
- Keep it at 60 fps on a mid laptop. No per-frame allocations, and cap the pixel ratio at 2.

## Interaction

- **Hover** a region: its boundary brightens and the region gets a very light cream-tinted fill. The label shows even if it was thinned out.
- **Click** a region: select it (blue boundary), smoothly rotate it to the centre (skip the animation under `prefers-reduced-motion`), and open the info panel: IAU name, abbreviation, centre RA/Dec, area in square degrees (computed from the boundary), and the brightest catalogue stars inside it.
- **Hit-testing:** do not raycast the line geometry. Build a lookup that maps any direction to a constellation, such as a precomputed RA/Dec grid of region IDs (for example 1440×720 cells) generated by point-in-polygon tests at load or build time. Hover and click are then O(1). Account for polygons that wrap across RA 0h/24h and for the polar regions.
- **Click-and-hold or Shift+click** anywhere: place a crosshair and show that point's RA/Dec (decimal degrees and sexagesimal, **labelled J2000**) with a "Copy coordinates" button.
- **Search box:** find a constellation by name or abbreviation and fly to it. Also accept typed RA/Dec in the AGENTS.md coordinate validation range (RA 0–360°, Dec −90…+90°) and fly there with a clear error message on invalid input.
- **URL state:** sync `?ra=&dec=&fov=` (view centre and FOV) with `history.replaceState` (debounced) so a view is shareable, and read it on load. Validate every value.
- **Callback API:** expose the selection as a typed `onSelect({ ra, dec, fov, constellation })` prop, defined in `src/types/sky.ts`, so later prompts can plug in SPHEREx retrieval. Do not wire retrieval yet.

## HUD and layout

- Full-viewport scene, `100dvh`, no page scroll.
- **Status bar** at the bottom, like the reference: location (*Earth, Addis Ababa*), local date and time (with UTC offset), FOV, and the RA/Dec under the cursor. 9px, regular weight, cream on ink with a thin cream rule above.
- **Top-right controls** (real `<button>`s with accessible names and visible focus): Horizon toggle, Grid toggle, Region labels toggle, Reset view. Icon-free text buttons are fine.
- **Left drawer / panel:** search, then the constellation list (all 88, filterable), then the info panel for the selection. It collapses on small screens.
- The HANOS wordmark links back to `/`.

## Colour

Follow `AGENTS.md`. The sky dome adds **one allowed exception**: a region-line red, defined once as `--color-region` in `src/app/globals.css` (suggested `#1F48FF`, used at about 50% opacity by default and 100% on hover). Confirm or adjust it against the reference. No other new colours.

## Typography

Everything the user reads is 9px and weight 400 (labels, buttons, list, status bar, tooltips), per the `(app)` rule. Use letter-spacing (about 0.04–0.08em), uppercase and colour for hierarchy. Never bold, even for the selected constellation. Set `font-synthesis: none`.

## Accessibility

- A WebGL canvas is not accessible by itself. Provide: the constellation list (keyboard-operable, Enter selects and centres), a text readout of the current view centre and selection in an `aria-live="polite"` region, and keyboard control of the dome (arrow keys rotate, `+`/`-` zoom, `Home` resets, `Esc` clears the selection).
- Visible focus on all controls. Hit targets at least 24×24px. Text contrast AA (cream on ink). No blue text on ink.
- `prefers-reduced-motion`: no inertia, no fly-to animation, and no label fading. Jump instead.
- No flashing. Star twinkle is not allowed.
- Touch: one-finger drag, two-finger pinch, and tap to select.
- Handle WebGL being unavailable with a plain message and the list-based fallback, not a blank page.

## Honesty and labelling

Show the catalogue credit and the "not SPHEREx data" label. Do not mark any object as a SPHEREx target, mover or discovery. The five required targets must not be drawn from memory. A later prompt will resolve them at runtime.

## Done when

1. `npm run lint`, `npm run typecheck` and `npm run build` pass, and `/explore` renders the dome without console errors.
2. **Data checks** (add as unit tests or a script run in the final report): all 88 constellations present, every grid cell assigned to exactly one region, and these known points fall in the right region: Polaris (RA ≈ 37.95°, Dec ≈ +89.26°) → Ursa Minor, Sirius → Canis Major, M31 (RA ≈ 10.68°, Dec ≈ +41.27°) → Andromeda, Fomalhaut → Piscis Austrinus, Alpha Centauri → Centaurus. Also check the RA 0°/360° wrap and both poles.
3. In the browser, test drag, zoom, hover, click-to-select, Shift+click coordinates, search, Horizon toggle, URL round-trip and keyboard-only operation. Compare with `sky-dome-reference.jpg` at 1280×720 and 390 wide. Report only comparisons you actually made, and do not claim a match to Stellarium.
4. The final message lists files created, data sources and licences, the red value used, performance observed (be explicit if you could not measure it), and anything left as an assumption.
5. Do not commit or push.
