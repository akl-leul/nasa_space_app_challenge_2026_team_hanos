/**
 * Links on the landing pages.
 *  - In-page anchors scroll smoothly, update the address and move focus to the target.
 *  - Moving between the home page and the challenge page closes a blue circle over the page, navigates,
 *    and opens the circle on the other side (a wipe). Other links are left to the browser / Next.js.
 *  - Arriving with a hash (for example /#project from the challenge page) puts the target exactly where it belongs.
 * (Port of the anchor code in the reference smooth-scroll.js and of the wipe in motion.js. The listener runs in
 * the capture phase and calls preventDefault, which next/link respects, so there is one navigation, not two.)
 */
import type { Smooth } from "./smooth";
import { Disposer, prefersReducedMotion } from "./util";

const LANDING_PATHS = new Set(["/", "/challenge"]);
const normalise = (path: string): string => (path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path || "/");

export function initNavigation(root: HTMLElement, smooth: Smooth, push: (href: string) => void, prefetch: (href: string) => void): () => void {
  const d = new Disposer();
  const html = document.documentElement;
  const reduced = prefersReducedMotion();
  // Look ids up inside this page only: Next keeps the page you left (hidden) in the document, and both landing
  // pages have a #resources.
  const byId = (id: string): HTMLElement | null => root.querySelector<HTMLElement>("#" + CSS.escape(id));
  const canAnimate = typeof Element.prototype.animate === "function";

  const makeWipe = (): HTMLDivElement => {
    const wipe = document.createElement("div");
    wipe.className = "wipe";
    wipe.setAttribute("aria-hidden", "true");
    return wipe;
  };

  // Arriving after a wipe: the inline script already covered the page; open the circle now.
  if (html.classList.contains("wipe-in")) {
    const cover = makeWipe();
    cover.style.clipPath = "circle(150vmax at 50% 50%)";
    root.append(cover);
    html.classList.remove("wipe-in");
    if (canAnimate) {
      const open = cover.animate(
        { clipPath: ["circle(150vmax at 50% 50%)", "circle(0px at 50% 50%)"] },
        { duration: 440, delay: 40, easing: "cubic-bezier(.7,0,.2,1)", fill: "forwards" }
      );
      open.finished.then(() => cover.remove(), () => cover.remove());
    } else {
      cover.remove();
    }
    d.add(() => cover.remove());
  }

  // Page restored from the back/forward cache with a wipe still on screen.
  d.listen(window, "pageshow", (event) => {
    if (event.persisted) root.querySelectorAll(".wipe").forEach((w) => w.remove());
  });

  d.listen(
    document,
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || !root.contains(link) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      const here = normalise(location.pathname);
      const there = normalise(url.pathname);

      // ---- in-page anchor ----
      if (there === here && url.hash) {
        const id = decodeURIComponent(url.hash.slice(1));
        const target = id ? byId(id) : null;
        if (id && !target) return;
        event.preventDefault();
        if (location.hash !== url.hash) history.pushState(null, "", url.hash);
        // One tick later: this listener runs before the link's own handlers (they close the menu and the story,
        // which releases the scroll lock), and a locked page ignores scrollTo.
        window.setTimeout(() => {
          smooth.scrollTo(target || 0, {
            onComplete: () => {
              if (target && target.hasAttribute("tabindex")) target.focus({ preventScroll: true });
            },
          });
        }, 0);
        return;
      }

      // ---- home <-> challenge: circle wipe ----
      if (there === here || !LANDING_PATHS.has(there) || !LANDING_PATHS.has(here)) return;
      event.preventDefault();
      const go = () => push(url.pathname + url.search + url.hash);
      if (reduced.matches || !canAnimate) {
        go();
        return;
      }
      const x = event.clientX || window.innerWidth / 2;
      const y = event.clientY || window.innerHeight / 2;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const cover = makeWipe();
      cover.style.clipPath = `circle(0px at ${x}px ${y}px)`;
      root.append(cover);
      let gone = false;
      const leave = () => {
        if (gone) return;
        gone = true;
        // keeps the page covered while the next one loads; the new page opens the circle and removes this class
        html.classList.add("wipe-in");
        go();
      };
      const close = cover.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 380, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" }
      );
      close.finished.then(leave, leave);
      const safety = window.setTimeout(leave, 700); // never leave the visitor stuck on the wipe
      d.add(() => window.clearTimeout(safety));
    },
    true
  );

  // Arriving with a hash: once fonts and layout have settled, put the target where the browser meant to.
  const settleHash = () => {
    if (!location.hash) return;
    const target = byId(decodeURIComponent(location.hash.slice(1)));
    if (target) smooth.scrollTo(target, { immediate: true });
  };
  if (document.readyState === "complete") settleHash();
  else d.listen(window, "load", settleHash, { once: true });
  document.fonts?.ready.then(settleHash);

  // the other landing page is fetched while the browser is idle, so the wipe does not wait for it
  const other = normalise(location.pathname) === "/" ? "/challenge" : "/";
  const warm = () => prefetch(other);
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(warm, { timeout: 3000 });
    d.add(() => window.cancelIdleCallback(id));
  } else {
    const id = window.setTimeout(warm, 1500);
    d.add(() => window.clearTimeout(id));
  }

  return () => {
    d.dispose();
    // React reuses the wrapper element when moving between the two landing pages, so covers added by hand
    // must be removed here; the next page opens its own (html.wipe-in keeps the screen covered in between).
    root.querySelectorAll(".wipe").forEach((w) => w.remove());
  };
}
