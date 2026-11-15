# Prompt 08 — Share card: match the "Hanos Cards" artwork exactly

Paste everything below the line into the agent. Run it after the share card from prompt 06 exists.

This prompt **replaces the visual design** of the share card. It supersedes the layout, hero, QR-tile, decoration and font sections of `06-share-card.md`, and it supersedes `07-liquid-glass-share-card.md` completely (the PDF's frosted corner slabs are the only glass). Everything else from 06 stays: the data and facts rules, the selection-only QR URL, the Download PNG / Copy link / Share actions, the dialog behaviour, lazy loading and accessibility. The dialog itself is not restyled.

Reference material (all in `docs/03-design/`):
- `Hanos Cards (Twitter Post) (1).pdf`: the team's Canva artwork, 5 pages.
- `assets/share-card/ref/*.jpg`: each PDF page rendered at 1920x1080 (star, planet, dwarf, galaxies, boundaries).
- `assets/share-card/textures/*.jpg`: the background textures extracted from the PDF (star-gold, star-slate, region-graphite), full resolution 1941x2912.

---

SHARE CARD PROMPT: make the exported card look exactly like the "Hanos Cards" artwork, driven by the selected star or region

Read AGENTS.md first (design system, "ask before a new dependency, colour or font"), then docs/03-design/prompts/06-share-card.md and the share-card code it produced (src/lib/share/, src/components/explore/ShareCardDialog.tsx; if prompt 07 was already applied, replace its glass code). Next.js here is v16 with breaking changes, so read the relevant guides in node_modules/next/dist/docs/ before coding. Open all five reference renders before writing anything.

GOAL
The 1920x1080 PNG card (and the dialog preview, which is the same canvas) must reproduce the PDF design: same background texture, same frosted corner slabs, same typography, same line work, same QR tile, same positions. **No sparkles anywhere** (the four 4-point stars in the PDF are NOT drawn). Only the content changes with the selected object: the name, the coordinates, the facts, the QR code and the hero artwork. Everything on the card is about the one selected star or region.

0. WHAT THE PDF CONTAINS (verified)
- Canvas: 1600x900 design px (Canva "Twitter post"). Export scale 1.2 gives 1920x1080. All measurements below are in design px (multiply by 1.2 for the export). They were measured from the PDF and are good to about 1 to 2 px: the diff harness in section 9 is the authority.
- Background: solid #111111, then a brushed, swirling dark texture photo tinted per variant, then the slabs, lines, text and artwork.
- The five pages are variants: STAR (gold-olive texture, gold flare), PLANET (olive-charcoal), DWARF (slate-blue, white flare), GALAXIES (violet), BOUNDARIES (neutral graphite, dashed region outline). The titles on them (STAR, PLANET...) are placeholder category words.
- Fonts embedded in the PDF: **Hatton Bold** (title and coordinates line) and **Inter 18pt Bold** (facts lines).
- Placeholder text on every page is a "Sedna" fact set and the coordinates 9°00'37.4"N 38°45'40.3"E. These are NOT ours and must never appear on a real card.

1. WHICH VARIANT A SELECTION USES
- **Region** (constellation): the BOUNDARIES look (graphite texture, dashed outline hero).
- **Star:** the STAR look. Choose the texture and flare colour from the star's real catalogue B-V colour index: B-V >= 0.30 (yellow, orange, red stars) uses the gold-olive texture; B-V < 0.30 (blue-white stars) uses the slate texture with a white flare. If B-V is missing, use gold. The flare colour is also derived from B-V (white-blue to gold to orange). Never write words like "dwarf", "giant" or a spectral class unless the catalogue provides it.
- PLANET and GALAXIES variants stay unused (the data has no planets or galaxies). Do not ship their textures.
- This mapping is my decision, so flag it in your report.

2. BACKGROUND TEXTURE (identical to the PDF)
- Use the extracted textures. The PDF places the texture as a plain scaled image (no rotation): scale 1.4426 (2800 design px wide for the 1941 px source), positioned so the visible 1600x900 window shows source pixels x 0 to about 1109 and y about 2250 to about 2874 (a 16:9 crop of the lower-left of the source). Verify the exact crop by diffing against the reference renders, and fix it until the strokes line up with the reference.
- Preprocess with a script (scripts/prepare_share_textures.py, Pillow): crop that window with a small safety margin, save as optimised JPEG or WebP (aim for under 400 KB each) into public/share/ (tex-star-gold, tex-star-slate, tex-region-graphite). Draw with drawImage and imageSmoothingQuality "high". The texture must be fetched only when the share dialog opens, never in the initial /explore bundle.
- Measured average colours of the visible texture area (for checking): gold about (42,38,8), slate about (26,37,43), graphite about (30,30,30).
- Provenance: these textures and the flare, planet and galaxy images come from a Canva design. Record in docs/01-project/data-credits.md that the textures were extracted from the team's Canva file and that the team must confirm the Canva licence allows shipping them in the app. Do not extract or ship any other raster artwork from the PDF.

3. CORNER SLABS (frosted glass, four of them)
Each slab is a stadium-shaped pill, 130 wide by 509 long with fully rounded ends (radius 65), cropped by the card edge:
- Top-left: vertical pill x -40 to 90, y -210 to 299. Visible x 0 to 90, y 0 to 299, rounded end at the bottom.
- Top-right: horizontal pill x 1307 to 1816, y -40 to 90. Visible x 1307 to 1600, y 0 to 90, rounded end on the left.
- Bottom-left: horizontal pill x -164 to 345, y 810 to 940. Visible x 0 to 345, y 810 to 900, rounded end on the right.
- Bottom-right: vertical pill x 1510 to 1640 (star variants) or about 1483 to 1613 (region variant, check the reference), y 646 to 1155. Visible to the card edge, rounded end at the top.
Look: the texture shows through, brightened by about +24 of 255 (a white overlay of roughly 10 percent) and slightly blurred (about 4 design px), plus an inner-edge glow along the curved outline: a gradient from transparent to about white 40 percent over the last 9 design px, peaking at about (155,155,142) on gold and (153,153,153) on graphite at the outline itself. No drop shadow. Draw it without ctx.filter (Safari does not support it): use a pre-blurred copy of the background, built with a portable blur.

4. TEXT AND LINES
Fonts: **Hatton Bold** and **Inter Bold (18pt optical size, weight 700)**.
- Hatton is a commercial typeface. The team must supply a licensed web font file at `public/fonts/Hatton-Bold.woff2`. Do not try to extract it from the PDF (it is a subset) and do not download it from anywhere. If the file is missing, fall back to Playfair Display 800 (Google Fonts, OFL), make the card still work, and state clearly in your report that the title and coordinates are then NOT an exact match.
- Inter is open source (SIL OFL): self-host `public/fonts/Inter-Bold.woff2` and record the licence. Load both fonts with the FontFace API, only when the dialog opens, and `await document.fonts.load(...)` before drawing, then redraw once if anything loaded late.
- Colours: title #EAEAE7 (gold) / #EAEAEA (slate and graphite); coordinates line #FFFFFF; facts #EBEBE7 / #EBEBEB; title underline and the two rules beside the QR about #B0B0AA at 1.5 px.
- **Title** (selected object's name, uppercase, Hatton Bold): right-aligned to x = 1316, baseline about y = 305, cap top about y = 249. Calibrate the size so the glyph heights match the reference (the "S" of STAR is about 62 tall). If the name is wider than about 613 px at the base size, shrink the font to fit, down to 55 percent, and wrap to two lines below that.
- **Title underline:** y about 328, 1.5 px, from (title left minus 8) to x = 1316.
- **Coordinates line** (Hatton Bold, white, about 14 px, centre y about 370, right edge x about 1306): the selected object's RA and Dec in the same punctuation style as the PDF, using the straight characters ' and ": for example `00h42'44.3" +41°16'09"` with a trailing J2000 marker in the same style. Use only characters that exist in Hatton. Never print the user's location or the time.
- **Facts** (Inter Bold, right-aligned to x about 1303, line centres at y about 431, 456, 481 and 507, so a line pitch of about 25 px, font about 20 px): exactly the four-line shape of the reference. Each line is `Label: short sentence.` and at most 64 characters, so it fits the same width as the reference. Content rules (from prompt 06): only facts the vendored data supports, nothing invented, a missing value means that line is left out. Region examples: `Area: 723 sq deg, 1.75% of the whole sky.` `Brightest: Alpheratz, Mirach, Almach.` Star examples: `Magnitude: V 1.50 (catalogue value).` `Colour index: B-V 1.85 (catalogue value).`
- **H mark** (logo): box x 1319 to 1414, y 165 to 260, colour about #CFCFCA. **Do not use public/logo.png**: that file is an RGB image with a baked-in checkerboard (no transparency), so it would show the checkerboard on the dark card. Draw the mark in code as vector: four vertical bars (normalised to the mark's bounding box, bar width 0.117, bars at x 0 to 0.117, 0.204 to 0.318, 0.682 to 0.797 and 0.883 to 1.0, full height), with the two inner bars interrupted between y 0.457 and 0.53, and a thin 4-point star outline centred at (0.50, 0.49) spanning x 0.285 to 0.715 and y 0.266 to 0.726 passing through that gap. Compare it with the H in the reference render. Report the logo.png problem in your final report so the team can replace the file.
- **QR tile:** a rounded square x 729.7 to 870.3, y 670 to 810 (140 x 140), corner radius about 12, fill about #151515. Inside, the modules are light (#DBDBDB) on that dark tile (inverted, exactly like the reference), occupying x 741.7 to 862.1, y 679.8 to 800.2 (about 120 px square).
- **Rules beside the QR:** left rule from (294.0, 741.8) to (713.6, 741.8), right rule from (893.7, 743.4) to (1313.3, 743.4). They are very slightly off-level in the PDF, so keep that.
- **Footer label (the only addition to the PDF):** a tiny line at bottom centre, y about 862, Inter Regular about 9 px, cream at about 45 percent: "Catalogue data. Not SPHEREx data." AGENTS.md requires that label. Keep it as small and quiet as possible, and flag it in your report as a deliberate deviation.

5. HERO ARTWORK (left side, drawn from the selected object's real data)
Do not copy the PDF's raster hero images. Draw the hero in code.
- **Star:** a lens-flare star centred near (347, 364): a small white-hot core (radius about 20 px) in a soft glow, 6 to 8 thin rays with a slight twist (longest about 200 px), a faint ring (radius about 90 px) and 2 to 3 small ghost circles to the upper right, as in the star reference. The slate/white variant has 4 sharp cross rays, a faint diagonal streak and two bubble ghosts, as in the dwarf reference. Colour comes from the real B-V index. Size (glow radius and ray length) scales mildly with the real magnitude (brighter means larger, within about plus or minus 25 percent). It is a stylised mark, not a photograph or a measurement, and the footer label covers that.
- **Region:** the selected region's outline drawn as a dashed line (white, about #F2F2F2, 2.2 px, dash about 6 on and 3.5 off), fitted inside the box x 213 to 562, y 151 to 502, with the neighbouring regions' boundaries as thin solid grey lines (about 1.5 px, around #6E6E66), clipped hard at the box edges exactly like the boundaries reference. Use a stereographic projection centred on the region, north up and east to the LEFT (the same orientation as the dome and src/lib/astro/coordinates.ts). Draw every polygon of multi-part regions. Use the vendored polygons only.
- No sparkles, no extra stars, no decorative glints anywhere on the card.

6. QR CODE (selection-only, unchanged rules)
Keep everything from prompt 06 section 5 (URL with ra, dec, fov and sel only, NEXT_PUBLIC_SITE_URL, localhost warning, error correction M or higher, qrcode-generator).
- Two things now conflict, so decide carefully and report: (a) the reference tile is a dark tile with light modules, which not every scanner reads, and (b) a typical URL needs a 37 to 41 module code, which is small inside the 120 px area. Draw it exactly like the reference first. Then decode the exported PNG with jsqr (attemptBoth inversions) AND with BarcodeDetector where the browser has it. If either fails, do not silently change the design: report it, and offer the smallest fix (use normal polarity with dark modules on a light tile, or enlarge the tile slightly). Add a build-time constant `QR_INVERTED = true` so the team can flip polarity in one place.
- Keep the URL short (no extra parameters, trimmed decimals) to keep the code as small as possible.

7. FILES (suggested)
src/lib/share/drawShareCard.ts (single drawing function for preview and export), src/lib/share/layout.ts (all the numbers above as one typed constants table in design px, scaled by one factor), src/lib/share/slabs.ts, src/lib/share/hero.ts (flare and region outline), src/lib/share/fonts.ts, src/lib/share/mark.ts (vector H mark), scripts/prepare_share_textures.py, public/share/*, public/fonts/Inter-Bold.woff2.
Keep the card feature lazy: dialog, drawing code, QR library, fonts and textures all load only on the first Share click (prefetch on pointer-enter, focus and touchstart of the Share button). /explore's initial bundle must not grow, and report its size before and after.

8. DESIGN-SYSTEM EXCEPTION (update AGENTS.md)
Replace the "Share card exception" line in AGENTS.md with: "Share card (canvas/PNG only): follows the team's Hanos Cards artwork in docs/03-design/. It may use the Hatton and Inter fonts, textured backgrounds tinted gold, slate or graphite, frosted glass slabs and a stylised star flare. Hues other than cream, ink and blue are allowed only inside the card canvas. The dialog and the rest of the app are not affected."

9. PIXEL-MATCH HARNESS (this is how "exactly like the PDF" is verified)
- Add a development-only way to render a **fixture card** that reproduces the reference text exactly: title STAR or BOUNDARIES, the Sedna fact lines, the coordinates `9°00'37.4"N 38°45'40.3"E`, the reference QR position, with the hero art switched off. The fixture exists only for the diff, must be unreachable in production builds, and must never be shown to users.
- Write scripts/share-card-diff (Node or Python with Pillow) that compares the exported 1920x1080 fixture PNG against docs/03-design/assets/share-card/ref/star.jpg and boundaries.jpg and reports, for these masked regions: background texture area, each of the four slabs, title text box, coordinates line, facts block, rules, QR tile outline and the H mark. Mask out the hero artwork and the QR modules.
- Targets: text and line positions within 1 px at 1920 wide, slab edges within 1 px, mean absolute difference in the texture area at most 4 of 255 (the references are JPEG), and SSIM at least 0.97 over everything not masked. If Hatton is missing, report the text regions separately and say they cannot match.
- Iterate until the targets pass or you can say precisely which one cannot be reached and why. Report the actual numbers.

10. VERIFICATION AND RULES
- Browser (show the Browser pane first so the viewport is non-zero): open Share for a region (Andromeda), a gold star (for example Betelgeuse) and a blue-white star (for example Rigel), screenshot each card, and compare with the matching reference render. Report only comparisons you actually made, and do not claim a pixel-perfect match for hero art or dynamic text.
- Download the PNG, confirm it is 1920x1080, the file size is reasonable (report it), and that no sparkle shapes are drawn.
- Confirm the QR decodes to exactly the selection-only URL, for a star and a region.
- Test in Chromium, Firefox and WebKit if available, and say which you could not run.
- The dialog, keyboard use and 390 px wide behaviour must work as before.
- Run npm run lint, npm run typecheck and npm run build. Do not commit or push.

OUT OF SCOPE
Restyling the dialog or any other UI, planet and galaxy cards, new dependencies other than the already approved QR encoder (and an optional test-only decoder; ask before adding a screenshot or browser-automation dependency), downloading fonts from the internet other than Inter, and changing what data the card shows.

FINAL REPORT
Files created and changed, the diff-harness numbers per region, whether Hatton was available, the QR decode results and polarity decision, the logo.png problem, the variant mapping decision, the footer label deviation, bundle size before and after, the licence notes recorded, browsers tested versus not, and anything you could not match exactly.
