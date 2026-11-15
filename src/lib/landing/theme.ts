/**
 * Day / night toggle. The theme is applied before first paint by an inline script (no flash); this wires the
 * button, saves the choice, and animates the change as a circle growing from the button where the browser
 * supports View Transitions. (Port of the reference theme.js.)
 */
import { Disposer, prefersReducedMotion } from "./util";

const COLORS = { day: "#f2f1ed", night: "#0b0f14" };

export function initTheme(root: HTMLElement): () => void {
  const html = document.documentElement;
  const button = root.querySelector<HTMLButtonElement>(".theme-toggle");
  if (!button) return () => undefined;
  const d = new Disposer();
  const reduced = prefersReducedMotion();
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const original = meta?.getAttribute("content") ?? null;

  const isNight = () => html.getAttribute("data-theme") === "night";

  const sync = () => {
    const night = isNight();
    button.setAttribute("aria-pressed", String(night));
    button.setAttribute("aria-label", night ? "Switch to day mode" : "Switch to night mode");
    meta?.setAttribute("content", night ? COLORS.night : COLORS.day);
  };

  const apply = (night: boolean) => {
    if (night) html.setAttribute("data-theme", "night");
    else html.removeAttribute("data-theme");
    try {
      localStorage.setItem("hanos-theme", night ? "night" : "day");
    } catch {
      /* storage blocked: the choice just is not remembered */
    }
    sync();
  };

  d.listen(button, "click", () => {
    const next = !isNight();
    if (typeof document.startViewTransition !== "function" || reduced.matches) {
      apply(next);
      return;
    }
    const box = button.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    try {
      const transition = document.startViewTransition(() => apply(next));
      transition.ready
        .then(() => {
          html.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 420, easing: "cubic-bezier(.2,.7,.2,1)", pseudoElement: "::view-transition-new(root)" }
          );
        })
        .catch(() => undefined);
      transition.finished.catch(() => undefined);
    } catch {
      apply(next);
    }
  });

  sync();
  return () => {
    d.dispose();
    if (meta && original !== null) meta.setAttribute("content", original);
  };
}
