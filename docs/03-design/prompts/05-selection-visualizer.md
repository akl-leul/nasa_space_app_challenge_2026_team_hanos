# Prompt 05 — Sky map selection visualizer (star and region)

Paste everything below the line into the agent. Run it after the dome exists (prompts 02/03) and, ideally, after the performance pass (prompt 04).

What the reference shows (`docs/03-design/assets/selection-star.png` and `selection-region.png`, rendered from the team's `SkyMapVisualizer.pdf`):
- **Star selected:** a dotted circle ring around the star, a dashed elbow leader line, and a dashed capsule holding **two** round buttons: **Info** and **Share**. No Play button.
- **Region selected:** the region's whole outline turns into a thick dashed white line, and the dashed capsule holds **three** buttons: **Play**, **Info**, **Share**.

---

SELECTION VISUALIZER PROMPT: star and region selection on the /explore sky dome

Read AGENTS.md first (design system, 9px/regular-weight rule, colour tokens, scientific rules), then docs/03-design/prompts/02-sky-dome.md and 04-sky-dome-performance.md for the dome you are extending. Next.js here is v16 with breaking changes, so read the relevant guides in node_modules/next/dist/docs/ before coding. Look at BOTH reference images first: docs/03-design/assets/selection-star.png and selection-region.png.

GOAL
Add a selection visualizer on top of the existing dome. The user can select a single star or a whole constellation region. Each shows its own highlight and a small floating action capsule.

| Selected | Highlight | Capsule buttons |
|---|---|---|
| Star | Dotted circle ring centred on the star | Info, Share (NO Play) |
| Region | Region outline drawn as a dashed line | Play, Info, Share |

This overrides one thing in 02-sky-dome.md: selection is shown with the dashed cream outline described here, not a blue outline. Keep the red region boundaries (--color-region) for all unselected regions.

1. SELECTING
- Click or tap picks a star if one is within about 12 CSS px of the pointer (use at least 16 px for touch), otherwise it picks the region under the pointer. A star always wins over the region it sits in.
- Star picking must be cheap: build a spatial index of star screen or sky positions (for example an RA/Dec grid of star indices built in the worker or at load) and test only nearby cells. No loop over all stars at pointer-move time. Prefer the brightest star when several are within range.
- Hovering shows only a light hover cue (region boundary brightens, or a faint ring on a star). The full capsule appears on click, not on hover.
- Clicking empty sky inside the same region as the current selection, pressing Esc, or clicking the same item again clears the selection. Clicking another star or region switches to it.
- Keep the existing smooth rotate-to-centre, but never centre so that the capsule would sit off-screen. Skip animation under prefers-reduced-motion.

2. STAR VISUAL (see selection-star.png)
- A dotted circle ring (1.5 px, round dots, cream), about 52 px diameter at 1440x810, centred on the star. Scale it with the brightness of the star only slightly, with a minimum of 36 px so it is easy to see and hit.
- A dashed leader line (cream, about 2.5 px, dashes about 10 px, gaps about 7 px) from the ring edge: a short horizontal run, a diagonal rise, then a horizontal run into the capsule, exactly like the reference.
- The capsule holds two buttons stacked vertically: Info on top, Share below.

3. REGION VISUAL (see selection-region.png)
- The selected region's complete outline is drawn as a dashed cream line (about 3 px, dash about 10 px, gap about 7 px), on top of the red boundaries.
- Implement it as an SVG overlay path that is re-projected only when the camera changes or the selection changes. It only draws the one selected region, so keep the vertex count small and use the same subdivided boundary points as the dome. Clip segments that fall behind the camera and split the path into sub-paths where the projection breaks, so no stray lines cross the screen.
- Regions with more than one polygon (for example Serpens) must show every polygon dashed.
- A short horizontal dashed connector joins the region's boundary to the capsule, which sits just outside the region on its right side, around the vertical middle of the visible part of the region.
- The capsule holds three buttons stacked vertically: Play on top, then Info, then Share.

4. THE CAPSULE
- A vertical pill outline (cream, dashed, about 2 px, long dashes) with round buttons inside: cream (#F5F3ED) fill, ink (#111111) icon, about 32 px diameter at 1440x810, never smaller than 24x24 px hit area, with a visible focus ring (blue is allowed as a ring, never as text on ink).
- Icons are inline SVG with no new dependency: a play triangle, an "i", and the curved share arrow shown in the reference.
- The capsule follows its anchor as the view changes. Update it with transform only, no layout reads or React state per frame. Keep it fully inside the viewport: flip to the left side near the right edge, and nudge vertically near the top and bottom. If the anchor leaves the viewport entirely, dock the capsule to the nearest edge and keep the buttons usable.
- Tooltips on hover and focus: "Play time-lapse", "Info", "Share", at 9px, regular weight. Each button has an accessible name that includes the target (for example "Share Andromeda").
- Open and close with a short fade (about 150 ms), and an instant swap under prefers-reduced-motion.

5. BUTTON BEHAVIOUR
- **Info** (star and region): opens the info panel (reuse the left panel; on small screens a bottom sheet).
  - Region: IAU name, abbreviation, centre RA/Dec (J2000, labelled), area in square degrees, brightest catalogue stars inside it.
  - Star: the catalogue name or designation exactly as the data gives it, V magnitude, RA/Dec (decimal degrees and sexagesimal, labelled J2000), and the constellation it lies in. Show distance, spectral type or other fields ONLY if the catalogue contains them, and label them as catalogue values. Never invent or estimate anything.
  - Footer line: "Catalogue data. Not SPHEREx data."
- **Share** (star and region): shares the current view as a link. Build it from the URL state: ?ra=&dec=&fov= plus sel=region:<abbr> or sel=star:<catalogue id>. Use the Web Share API when available (check navigator.canShare), otherwise copy to the clipboard. If the clipboard is unavailable (for example on plain HTTP), show the link in a read-only field to copy by hand. Confirm with a short message in an aria-live region ("Link copied"). Opening such a link restores the view and the selection. Validate every parameter and ignore bad ones safely.
- **Play** (region only): this is the entry point to the Cosmic Time Machine for that region. The time-lapse is not built yet, so for now Play must call a typed onPlay({ kind: "region", abbr, name, ra, dec, fov }) prop, defined in src/types/sky.ts, and show a clear 9px message: "Time Machine is not connected yet." Do not fake a time-lapse, do not fetch SPHEREx data, and do not invent a route. Later prompts connect it. Note in a code comment that a whole constellation is much larger than a SPHEREx cutout, so how a region is tiled for retrieval is a decision for that later prompt.
- Stars never show Play.

6. STATE AND TYPES
- Extend the selection type in src/types/sky.ts as a discriminated union: { kind: "star", id, name?, ra, dec, mag, constellation } or { kind: "region", abbr, name, ra, dec, areaSqDeg }. Update the existing onSelect prop to carry it. Keep selection state in refs plus a minimal React state (the selected item only), not per frame.

7. ACCESSIBILITY
- The capsule buttons are real <button> elements in a role="toolbar" container with an accessible label like "Actions for Andromeda". Arrow keys move between buttons, Tab leaves the toolbar, Esc clears the selection and returns focus to the dome or the list item that opened it.
- Selecting from the keyboard list (Enter) also shows the region highlight and capsule. Provide a keyboard way to pick a star as well, such as a search box result or a "brightest stars" list, so a star can be selected without a pointer.
- Announce each selection in the aria-live readout ("Selected star Sirius" or "Selected region Andromeda, Play, Info and Share available").
- The dashed visuals are decorative, so mark them aria-hidden. Meaning must not depend on dash style alone.
- Contrast AA, no flashing, no blue text on ink. Honour prefers-reduced-motion.

8. COLOUR AND TYPE
Cream (#F5F3ED) and ink (#111111) for the visualizer, plus the approved red for unselected boundaries. Blue only as a focus ring or glow. All text 9px, regular weight (tooltips, messages, info panel), with letter-spacing and uppercase for hierarchy. No other colours, no shadows or gradients.

9. PERFORMANCE (must not regress)
Follow 04-sky-dome-performance.md: render on demand, no per-frame React state, transform-only overlay updates, no layout thrash, no new allocations in the render path. The overlay may update only while the view is moving or the selection changes, and not at all when the dome is idle. Measure the frame time while dragging with a selection active and compare with the baseline.

10. VERIFICATION (report honestly)
- Unit tests for star picking: a known bright star (for example Sirius or Vega) selected at its projected position, a click on empty sky inside a region picks the region, and a star near a region boundary still wins.
- In the browser, check: star select (ring plus capsule with two buttons, no Play), region select (dashed outline plus capsule with three buttons), switching between items, Esc and click-to-clear, Info and Share on both, Play on a region only, URL round-trip with sel=, capsule flipping near the right edge, behaviour at 1280x720 and 390 wide, touch, and keyboard-only operation.
- Compare with selection-star.png and selection-region.png and report only the comparisons you actually made. Do not claim a pixel-perfect match.
- Run npm run lint, npm run typecheck and npm run build. Do not commit or push.

OUT OF SCOPE
SPHEREx retrieval, the Time Machine itself, new dependencies (ask first), changes to the catalogue data or its licensing.

FINAL REPORT
Files created and changed, how star picking is indexed, how the dashed outline handles regions behind the camera and multi-polygon regions, what Play does for now, performance measured with a selection active, and anything left unverified or assumed.
