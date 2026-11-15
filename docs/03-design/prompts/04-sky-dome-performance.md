# Prompt 04 — Sky dome performance and compatibility

Paste everything below the line into the agent. Run it after the dome from prompts 02/03 exists.

Decisions behind this prompt: the dome is slow everywhere (drag, hover, load, weak devices); keep three.js and optimize it, with a plain fallback; no visual cuts, so all speed comes from loading work invisibly in the background; support the last 3 years of browsers and devices.

---

PERFORMANCE PROMPT: make the /explore sky dome fast on every device and browser

Read AGENTS.md first (9px/regular-weight rule, colour tokens, scientific rules). Next.js here is v16 with breaking changes, so read the relevant guides in node_modules/next/dist/docs/ (dynamic imports, prefetching, caching, Client Components) before changing anything.

GOAL
The dome currently lags on dragging, zooming, hover and click, loads slowly, and is worst on phones and old laptops. Fix this with three.js kept in place. Do NOT reduce what the user sees: same stars, same boundaries, same labels, same look. Visual quality may only change on a device that cannot hold the frame-rate target, and only through automatic resolution scaling (section 3).
Support: the last 3 years of Chrome, Edge, Firefox and Safari (including iOS Safari 15+), on phones from about 2021 on.

STEP 0: MEASURE BEFORE YOU CHANGE ANYTHING
- Test the production build (npm run build && npm start), never next dev. Dev mode is far slower and will mislead you.
- Record a baseline: JS bundle size for /explore, time until the dome is interactive, frame time while dragging (Chrome DevTools Performance with 4x and 6x CPU throttle), draw calls and triangles/points per frame, JS heap, and data file sizes. Save the numbers in your final report.
- Find the real bottlenecks first. Do not guess.

1. LOAD INVISIBLY (the user should never see the cost)
- Keep the scene as a dynamic import so three.js and the dome code are not in the landing page bundle.
- Warm up in the background BEFORE the user arrives: while they are on the landing page, during idle time (requestIdleCallback with a setTimeout fallback for Safari) prefetch the /explore route code and fetch the star and boundary data into the HTTP cache. Also trigger this on pointer-enter, focus and touchstart of the EXPLORE button. Never block the landing page's own rendering, and skip the preload on Save-Data or slow connections (navigator.connection, when available).
- Ship data as compact binary typed arrays (Float32Array/Uint16Array) instead of JSON, served with long-lived immutable caching. Parse and build geometry off the main thread in a Web Worker (transfer the buffers, do not copy them).
- Progressive paint: show the empty ink-coloured dome immediately, then add boundaries, then stars, then labels. Never show a blank page or a spinner longer than needed. Compile shaders during the preload (renderer.compile) so the first frame has no stall.

2. RENDER ONLY WHEN NEEDED
- Replace any continuous requestAnimationFrame loop with render-on-demand: render only when the camera moves, a selection or hover changes, or an animation is running. An idle dome must use about 0% CPU/GPU.
- Pause rendering when the tab is hidden (visibilitychange) or the canvas is off-screen (IntersectionObserver).
- Do not update React state per frame. Keep camera and hover state in refs, and write live readouts (RA/Dec, FOV) straight to the DOM at most about 10 times per second. No React re-render during a drag.
- Draw calls: one Points object for all stars, one LineSegments object for all boundaries, one more for the highlight. Merge into single BufferGeometries, use static buffers (STATIC_DRAW), no per-frame allocation, no object creation in the render path. Dispose geometries, materials and listeners on unmount.

3. ADAPTIVE QUALITY (automatic, invisible)
- Cap devicePixelRatio (2 on desktop, 1.5 on phones) and add dynamic resolution scaling: measure frame time over a short window, and if it exceeds the budget lower the render scale in steps (down to about 0.6); restore it when idle or when the frame time recovers. Render at full scale when the view is still.
- Turn off antialiasing on low-power devices (detect via a short benchmark or hardwareConcurrency/deviceMemory where available, and do not rely on user agent sniffing). Request powerPreference "high-performance" on desktop and "default" on mobile. Use mediump precision in shaders where it looks the same.
- Handle WebGL context loss and restore. If WebGL2 is unavailable (three.js needs it), show the plain keyboard-operable constellation list and coordinate search instead of a blank page.

4. INTERACTION COST
- Hit-testing must be an O(1) lookup in a precomputed RA/Dec grid of region IDs (a Uint8Array/Uint16Array built in the worker or at build time). No raycasting against line geometry, and no point-in-polygon work at pointer-move time.
- Throttle pointer-move work to one update per frame. Use passive listeners for wheel and touch where possible, set touch-action: none on the canvas, and avoid layout reads in handlers.
- Labels: pre-create the DOM nodes once, move them with transform only (translate3d), batch reads before writes, cap the number visible at once with the existing thinning rule, and skip updates for labels behind the camera or when the view has not changed. Do not trigger layout on every frame.

5. COMPATIBILITY CHECKS
- Test in Chromium, Firefox and WebKit (Playwright or the browsers available), at desktop and mobile viewport sizes, with CPU throttling. Say clearly which you could test and which you could not. Never claim real-device results you did not get.
- Verify touch (one-finger drag, two-finger pinch, tap), keyboard control, prefers-reduced-motion, and that a hidden/restored tab recovers correctly.

TARGETS (report the measured values, honestly)
- Desktop: 60 fps while dragging. Phone-class (6x CPU throttle): 30 fps or better while dragging, with no long frame stalls.
- Idle: no rendering activity.
- Navigating from the landing page to /explore feels instant when the preload has finished, and /explore never blocks the main thread for over 50 ms during load.
- Landing page bundle size must not grow.

RULES
- No new dependencies without asking (three and @types/three only).
- Do not change visuals, colours, labels or behaviour beyond the above. Do not touch the data or its licensing.
- Run npm run lint, npm run typecheck and npm run build. Do not commit or push.

FINAL REPORT
Before/after numbers for every item in Step 0, what each change contributed, what you tested versus could not test, and any remaining bottleneck.
