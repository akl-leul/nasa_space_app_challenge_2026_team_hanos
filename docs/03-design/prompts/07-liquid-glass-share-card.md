# Prompt 07 — Liquid glass share card (the card only)

Paste everything below the line into the agent. Run it after the share card from prompt 06 exists.

Scope: **only the share card itself** (the 1920x1080 card that is previewed and exported as PNG). The dialog around it, its buttons and the rest of the app are NOT changed. This prompt deliberately overrides the "no gradients, no shadows" rule in `AGENTS.md`, and the "no glass effect" and "blue never on the card" lines in `06-share-card.md`, for the card only. The agent must document that exception in `AGENTS.md`.

---

LIQUID GLASS PROMPT: restyle the share card (PNG) in the style of Apple Liquid Glass

Read AGENTS.md first, then docs/03-design/prompts/06-share-card.md and the share-card code it produced (src/lib/share/drawShareCard.ts and friends). Next.js here is v16 with breaking changes, so read the relevant guides in node_modules/next/dist/docs/ before coding. Look at docs/03-design/assets/share-card-reference.jpg: its glassy rounded corner slabs are the starting point for this look.

GOAL
Every surface drawn on the share card becomes glass, in the spirit of Apple's Liquid Glass: translucent, softly blurred, with a bright specular rim, light that bends at the edges, a gentle inner glow and a soft lift from the background. The card is drawn on canvas, so the exported 1920x1080 PNG contains the glass, and the dialog preview (the same canvas) shows it too. Do not use or copy any Apple artwork. Build the effect yourself from the recipe below.

DO NOT CHANGE
The dialog, its buttons, its layout, the rest of /explore, the landing page, the dome, the card's data, facts, fonts, sizes and text content, or the QR code's contents. No CSS backdrop-filter anywhere. This is a canvas-drawing change only.

0. DESIGN-SYSTEM EXCEPTION (do this first)
- Glass needs gradients, translucency and soft shadows, which AGENTS.md forbids elsewhere. Add one short, clearly worded exception to the Design System section of AGENTS.md: "Share card (canvas/PNG only): liquid glass surfaces may use gradients, blur and soft shadows, built only from cream, ink and blue at varying opacity. No other hues. The dialog and the rest of the app are not affected."
- Keep the palette: ink #111111, cream #F5F3ED, blue #1F48FF, and the region token --color-region exactly as AGENTS.md currently defines it (do not hard-code its value). Tints are opacity variations of these only.
- Glass is invisible on a flat background, so the card background may carry soft "light blooms": large blurred circles of blue and cream at low opacity (roughly 15 to 40 percent) over the ink, plus the existing grain and the star chart.

1. WHAT BECOMES GLASS (on the card)
- The hero star chart sits behind a circular **glass lens**: the chart shows through it, slightly magnified at the centre and bent near the rim.
- The title plate (name and the rule beneath it), the coordinates chip, and the facts panel.
- The QR tile, with the hard rule in section 4.
- The four corner slabs (as in the reference), the HANOS mark chip, and the two hairline rules beside the QR as thin glass lines.
- The sparkles become small glints with a soft glow.
Panels use continuous (squircle-style) corners, radius about 24 to 40 px at 1920 wide. Nested shapes use matching, concentric radii.

2. CANVAS GLASS RECIPE (portable, no ctx.filter)
Safari does not support CanvasRenderingContext2D.filter, so do not use it. The card must look the same in Chromium, Firefox and WebKit. Write one reusable function, `drawGlassPanel(ctx, shapePath, opts)`, in src/lib/share/glass.ts, built from these layers:
1. **Scene pass:** draw the background (ink, light blooms, grain) and the star chart onto an offscreen "scene" canvas.
2. **Blurred backdrop:** make one blurred copy of the scene with a portable method (repeated downscale and upscale with smoothing, or a small box or stack blur on a half-resolution copy). Radius about 20 to 28 px at 1920 wide. Boost its saturation (about 1.3x) and slightly its brightness with a single pixel pass on the blurred copy, not per panel.
3. **Panel body:** clip to the panel shape and draw the blurred backdrop. For the lens, and optionally other panels, draw it slightly magnified about the panel centre (1.03 to 1.08x) to fake refraction.
4. **Edge refraction band:** along the inside edge (about 14 to 22 px wide) draw a brighter, more strongly offset or magnified sample, or a stroked gradient, so the background looks bent at the rim. True per-pixel displacement is optional, and only if the whole card draws in under 400 ms on a mid laptop.
5. **Tint:** a vertical gradient fill of cream, about 0.16 at the top fading to about 0.04 at the bottom, plus an adaptive ink tint (section 3).
6. **Inner glow and thickness:** an inset cream glow near the top-left edges and a soft inset ink shade near the bottom-right.
7. **Specular rim:** a 1.5 px stroke with a linear gradient along the diagonal (cream about 0.9 at the top-left, about 0.15 mid-way, about 0.55 at the bottom-right), plus a thinner inner stroke. Light comes from the top-left.
8. **Hot-spot highlight:** a small elongated radial gradient near the top-left corner arc, composited with "screen" or "lighter".
9. **Lift:** a soft ink shadow under the panel (offset about 12 px down, blur about 40 px, alpha about 0.35), drawn so it does not show through the panel body.
10. **Micro grain:** a very light, seeded noise over the glass, so the same card always renders the same.
Report the PNG file size. If it is above about 4 MB, reduce the grain. Do not use any downloaded texture or image.

3. LEGIBILITY (adaptive tint, measured)
- Draw the glass without text first. Then, for every text block (title, coordinates, each facts line, footer), measure the luminance behind it (use a high percentile, not the average) and choose the ink tint for that panel so cream text keeps a contrast ratio of at least **4.5:1** (3:1 for the large title). Increase the ink tint until it passes.
- Write a test or script that reports the measured ratios for a star card and a region card.
- Add a subtle dark text halo only if the tint alone cannot reach the ratio. Prefer tint.

4. QR TILE (hard rule)
- The area behind the QR modules stays near-opaque cream (at least 0.92 alpha) with dark ink modules, so the code scans. Glass styling applies only to its rim, corner and lift, never to the code area.
- Keep the 4-module quiet zone and error correction level M or higher from prompt 06.
- Re-run the decode test on the exported PNG (jsqr or BarcodeDetector, as in prompt 06) after this change. The decoded text must still equal the expected selection-only URL.

5. CODE AND LAZY LOADING
- Glass code lives in src/lib/share/glass.ts and is imported only by the share-card module, so it stays inside the lazy chunk from prompt 06. Report /explore's initial bundle size before and after. It must not grow.
- Keep drawShareCard as the single drawing function for the preview and the export, so they match.
- Unit-test the pure helpers (blur routine on a small known image, contrast measurement, squircle path bounds, adaptive tint choice).

6. VERIFICATION (report honestly)
- Browser (show the Browser pane first so the viewport is non-zero): open Share for a region (Andromeda) and for a star (Sirius). Screenshot the card in the dialog and the downloaded PNG. Check that every listed surface is glass and nothing on the card is flat, and that the dialog itself looks exactly as before. Compare with share-card-reference.jpg. Report only comparisons you actually made, and do not claim it matches Apple's design.
- Download the PNG and confirm 1920x1080, that glass is present in the file, the file size, and the fonts.
- Contrast numbers from section 3, and the QR decode result from section 4, for both card types.
- Test in Chromium, Firefox and WebKit if available (Playwright or others), and say clearly which you could not run.
- Time the card draw (target under 400 ms on a mid laptop; report the measured number and describe the machine).
- Keyboard-only use and 390 px wide must work exactly as before.
- Run npm run lint, npm run typecheck and npm run build. Do not commit or push.

OUT OF SCOPE
Any change to the dialog or other UI, new dependencies (ask first), Apple assets or trademarks, and changes to what data the card shows.

FINAL REPORT
Files created and changed, the exception added to AGENTS.md, measured contrast ratios, QR decode result, PNG size, draw time, bundle size before and after, browsers tested versus not tested, and anything you simplified (for example whether you used true refraction or the magnified-sample approximation).
