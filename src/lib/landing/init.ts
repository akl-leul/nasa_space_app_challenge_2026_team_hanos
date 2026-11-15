import { initGather } from "./gather";
import { initMotion } from "./motion";
import { initNavigation } from "./navigation";
import { initScrolly } from "./scrolly";
import { createSmooth } from "./smooth";
import { initStory } from "./story";
import { initTheme } from "./theme";

export interface Router {
  push(href: string): void;
  prefetch(href: string): void;
}

/**
 * Brings the server-rendered landing page to life. Returns one function that undoes everything
 * (route changes and React Strict Mode mount the page more than once).
 */
export function initLanding(root: HTMLElement, router: Router): () => void {
  const html = document.documentElement;
  const smooth = createSmooth();
  const undo: Array<() => void> = [];

  undo.push(initTheme(root));
  undo.push(initStory(root, smooth));
  const scrolly = initScrolly(root, smooth);
  undo.push(scrolly.dispose);
  undo.push(initMotion(root, smooth));
  undo.push(initNavigation(root, smooth, (href) => router.push(href), (href) => router.prefetch(href)));

  // The gather makes six copies of the portraits, which downloads them all. Wait until the team story is near.
  const journey = root.querySelector<HTMLElement>("#journey");
  let stopGather: (() => void) | null = null;
  let observer: IntersectionObserver | null = null;
  const startGather = () => {
    observer?.disconnect();
    observer = null;
    if (!stopGather) stopGather = initGather(root, smooth, scrolly.flush);
  };
  if (journey && "IntersectionObserver" in window) {
    observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && startGather(), { rootMargin: "150% 0px" });
    observer.observe(journey);
  } else {
    startGather();
  }

  html.classList.add("hanos-ready");

  return () => {
    observer?.disconnect();
    stopGather?.();
    for (let i = undo.length - 1; i >= 0; i--) undo[i]();
    smooth.destroy();
    html.classList.remove("hanos-ready");
  };
}
