# Prompt 06 — Share card (PNG download + QR code)

Paste everything below the line into the agent. Run it after the selection visualizer (prompt 05) works.

Reference: `docs/03-design/assets/share-card-reference.jpg` (a "Sedna" card made by the team). It is a layout and mood reference only. Its planet picture, its facts and its coordinates are not ours and must not be reused.

---

SHARE CARD PROMPT: Share button opens a downloadable card with a QR code for the selected star or region

Read AGENTS.md first (design system, 9px/regular rule for the app UI, colour tokens, scientific rules, "ask before a new dependency, colour or font"). Then read docs/03-design/prompts/05-selection-visualizer.md and 04-sky-dome-performance.md for the code you extend. Next.js here is v16 with breaking changes, so read the relevant guides in node_modules/next/dist/docs/ before coding. Open docs/03-design/assets/share-card-reference.jpg and study it first.

GOAL
When the user clicks **Share** on a selected star or region, open a dialog that shows a 16:9 card in the style of the reference, with:
- the selected item's name, coordinates and facts, and nothing from any other object,
- a **QR code that opens exactly that selection** in HANOS,
- a **Download PNG** button, plus Copy link and the system share sheet.

Everything on the card must come from the selected item only. If it is a star, the card is about that star. If it is a region, the card is about that region.

1. WHAT CHANGES IN THE EXISTING SHARE BUTTON
The capsule Share button (SelectionVisualizer.tsx, handleShareClick) currently shares a link directly. Change it to open the share-card dialog instead. Move link copying and the Web Share API into the dialog as secondary actions. Keep Play and Info exactly as they are. Keep the Share accessible name ("Share Andromeda").

2. THE CARD (drawn on one 2D canvas, 1920x1080)
Use a single pure drawing function, `drawShareCard(ctx, data, assets)`, in `src/lib/share/drawShareCard.ts`. The dialog preview and the PNG export must use the same function, so they are identical. No DOM screenshot libraries (no html2canvas or similar). Because the canvas never loads cross-origin images, `toBlob` will not be tainted.

Layout, approximate proportions of the card from the reference (tune by eye against it):
- **Background:** ink #111111 with a subtle procedural grain (seeded noise at very low alpha), like the textured dark ground in the reference. No gradients, no drop shadows, no photos or downloaded textures.
- **Hero visual (left, about 22% to 40% of the width):** a real star chart of the selected item, replacing the planet picture (see section 3).
- **Title (right-aligned at about x 82%, y 22% to 34%):** the name in uppercase, in a high-contrast display serif (see Fonts). Auto-fit: shrink to fit about 40% of the card width, and wrap to 2 lines for long names (for example "Piscis Austrinus"). Below it a thin cream rule about 25% of the width, right-aligned.
- **HANOS mark:** small, top right near the title (use the existing logo asset in public/, check public/logo.png, and keep it crisp).
- **Coordinates line (just under the rule, right-aligned, small serif caps):** RA and Dec in sexagesimal, labelled **J2000**. Do NOT print the user's location or the current time.
- **Facts (right-aligned, bold sans, 4 lines at most, about y 47% to 58%):** see section 4.
- **QR code (bottom centre, about 8.5% of the width):** on a cream rounded tile, dark modules on cream (standard polarity, not inverted like the reference), with horizontal hairline rules to its left and right as in the reference.
- **Footer (small, bottom centre under the QR, cream at about 70% opacity):** "Reference catalogue data. Not SPHEREx data." and the data credit from docs/01-project/data-credits.md in one short line.
- **Decoration:** four 4-point sparkle stars in the margins, and four rounded-corner outline frames bleeding off the corners (thin cream strokes at low opacity, no blur, no glass effect). They are decorative only. Keep them clear of the chart, so they cannot be mistaken for catalogue stars.
- Colours: ink, cream (#F5F3ED) and opacity tints of them only. Blue (#1F48FF) is allowed only on UI buttons in the dialog, never on the card. The red region-boundary token (--color-region) is allowed on the card only for the faint neighbouring boundaries in the chart. No other colours.

3. HERO VISUAL (real data, never an illustration of a planet)
Draw it with a **stereographic projection** (handles very large regions like Hydra) centred on the item, with **north up and east to the LEFT**, the same orientation as the dome. Use the same RA/Dec convention as src/lib/astro/coordinates.ts. Clip to a circle.
- **Region:** the region's boundary as a dashed cream outline (all polygons, for example both parts of Serpens), the neighbouring regions' boundaries as faint red lines, the catalogue stars in view sized by magnitude, and up to 5 brightest named stars labelled in small serif. Fit the whole region inside the circle with a margin.
- **Star:** a field of about 8 to 12 degrees across with catalogue stars sized by magnitude, a dotted cream ring on the selected star (as in the app), the star's name labelled, and the faint red boundary of its constellation.
- Use only the vendored catalogue data (public/data/). Do not invent stars, and do not add any imagery.

4. FACTS (only what the data supports)
Four lines at most, "Label: value" with the label in bold. Compute them from the vendored data. Do not write anything the data does not contain, and do not add trivia.
- **Region:** Area (square degrees, percent of the whole sky of 41,253 sq deg, and rank by area among the 88), Brightest stars (up to 3 names from the data), Catalogue stars (count of catalogue stars inside the region, with the magnitude limit stated), Abbreviation.
- **Star:** Magnitude (V, from the catalogue), Colour index B-V (catalogue value), Constellation (name), Catalogue ID (HIP number). Show distance, spectral type or any other field only if the catalogue actually contains it, and label it as a catalogue value.
- If a value is missing, leave that line out. Never fill it with a guess.
- Wrap and truncate long text properly with measureText, and keep every line inside the card.

5. QR CODE (specific to the selected item only)
- The QR encodes the share URL: `<origin>/explore?ra=<ra>&dec=<dec>&fov=<fov>&sel=region:<abbr>` or `...&sel=star:<id>`, with these four parameters only and no other view state. Use a sensible default fov for the selection, not the user's current zoom: for a region, about 2.2 times its angular radius clamped between 20 and 100 degrees, and for a star about 12 degrees. Validate all values.
- Opening the URL must restore the same selection (SkyExplorer already reads sel=). Verify it for both a star and a region.
- **Origin:** use NEXT_PUBLIC_SITE_URL when set, otherwise window.location.origin. Document the variable in .env.example. If the origin is localhost or 127.0.0.1, show a clear 9px warning in the dialog: "This QR points to localhost. Set NEXT_PUBLIC_SITE_URL to a public address before sharing."
- **Scannability:** error correction level M or higher, dark modules on a cream tile, a quiet zone of at least 4 modules, and module size of at least 4 px at 1920 wide (more is better). No logo over the code.
- **Dependency (approved for this task):** one small MIT-licensed, dependency-free QR encoder, `qrcode-generator`. Check its licence and current version yourself, load it with a dynamic import only when the dialog opens, and wrap it in src/lib/share/qr.ts. If it is not suitable, stop and ask. For tests only, a decoder such as `jsqr` may be added as a devDependency. Ask if you would prefer another approach.

6. FONTS
The card is an exported graphic, so the "9px, regular weight" rule does not apply to the text drawn on it, but it does apply to every piece of normal UI in the dialog (buttons, labels, messages, warnings).
- Title: a high-contrast display serif like the reference. Proposed: **Playfair Display** (Google Fonts, SIL OFL), weight 800 or 900, loaded only for the dialog. Fallback: Georgia, serif. Flag this choice in your report so I can confirm it.
- Facts: Geist Sans bold (already loaded). Coordinates and small caps: the same serif at a small size.
- Wait for `document.fonts.load(...)` and `document.fonts.ready` for each face before drawing, then redraw once. Otherwise the PNG shows fallback fonts.
- Do not load these fonts on any other route or on first paint of /explore.

7. THE DIALOG
- A real modal: role="dialog", aria-modal, aria-labelledby, focus trapped inside, Esc and a Close button dismiss it, backdrop click dismisses it, focus returns to the Share button, and the page behind is inert.
- Content: the card preview (scaled by CSS, max width about 720 px, never overflowing a 390 px phone), then these buttons in a row (wrapping on phones):
  - **Download PNG** (primary, blue fill with cream text, which has a contrast ratio above 4.5:1),
  - **Copy link**,
  - **Share** (system share sheet, with the PNG file attached when navigator.canShare({ files }) allows, otherwise with the link only; hide it if neither works).
- Download: `canvas.toBlob("image/png")`, saved through an anchor with a download name like `hanos-<slug>-<abbr-or-hip>.png` (lowercase, ASCII). Revoke the object URL afterwards. Export at 1920x1080 regardless of the screen's pixel ratio.
- Confirmation messages in an aria-live region ("PNG downloaded", "Link copied"). If the clipboard is unavailable, show a read-only field with the link, as before.
- The canvas needs an accessible description: an aria-label, and the same information as real text for screen readers (a visually hidden description list with the name, coordinates, facts and link).
- The dialog UI is 9px, regular weight, with letter-spacing and uppercase for hierarchy, 24x24 px minimum targets, and visible focus (blue ring is fine).

8. PERFORMANCE
- Load the whole card feature (dialog, drawing code, QR library, fonts) lazily through next/dynamic or dynamic import on the first Share click. Prefetch it on pointer-enter, focus and touchstart of the Share button. /explore's initial bundle must not grow. Report the bundle size before and after.
- The drawing runs once per open (and once more after fonts load). No render loop, no React state per frame. Free the canvas and blobs on close.
- The dome must keep its performance: opening the dialog pauses dome rendering (the canvas is hidden behind it), and closing resumes it.

9. DATA AND HONESTY
- Every number and name on the card comes from the selected item and the vendored catalogue data. State on the card that it is catalogue data and not SPHEREx data.
- No claims of discovery, no SPHEREx observation dates, no invented facts. The chart is a reference star chart and is labelled as such.
- Never include the user's location, name, device or time on the card.

10. FILES (suggested)
- src/components/explore/ShareCardDialog.tsx (dialog and actions)
- src/lib/share/drawShareCard.ts (pure drawing), src/lib/share/projection.ts (stereographic), src/lib/share/qr.ts, src/lib/share/shareUrl.ts, src/lib/share/facts.ts
- Types in src/types/sky.ts or src/types/share.ts
- Tests or scripts in scripts/ in the same style as the existing verify scripts.

11. VERIFICATION (report honestly)
- Unit tests: stereographic projection (centre maps to the centre, east is left, north is up), shareUrl (parameters, validation, localhost detection), facts (region and star, missing-data handling, area percent and rank), filename slug.
- QR: generate the code for one star and one region and decode the PNG (jsqr in a test, or BarcodeDetector in the browser if available). The decoded text must equal the expected URL and contain only that selection. Say clearly if you could not test it with a real phone camera.
- Browser (show the Browser pane first so the viewport is non-zero): select a region (for example Andromeda), click Share, check the card and screenshot it. Do the same for a star (for example Sirius). Compare with share-card-reference.jpg and report only comparisons you actually made. Do not claim a pixel-perfect match.
- Download the PNG, confirm it is 1920x1080, that its content matches the preview, and that the fonts are the intended ones, not fallbacks.
- Open the URL from the QR in a new tab and confirm it selects the same item.
- Keyboard-only: open the dialog with Enter on Share, tab through, Esc closes, and focus returns to Share. Check 390 px wide and 1280 px wide, and prefers-reduced-motion.
- Run npm run lint, npm run typecheck and npm run build. Do not commit or push.

OUT OF SCOPE
SPHEREx retrieval, the Time Machine, planet or star imagery, social network integrations, saving cards on a server, analytics, and any dependency other than the approved QR encoder (and an optional test-only decoder).

FINAL REPORT
Files created and changed, the dependency versions and licences, the fonts used, bundle size before and after, the QR test result, what you could not verify, and any assumption (especially the title font and the default fov rules).
