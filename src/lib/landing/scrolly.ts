/**
 * The pinned team story: which member is active, chapter and journey progress, the hero parallax.
 * Geometry is cached and one frame is scheduled per update, so scrolling never forces layout.
 * (Port of the reference scrolly.js.)
 */
import type { Smooth } from "./smooth";
import { clamp, Disposer, prefersReducedMotion } from "./util";

interface ChapterGeometry {
  top: number;
  height: number;
  center: number;
}

export interface Scrolly {
  dispose(): void;
  /** Bring the active chapter up to date for the current scroll position (cheap, safe to call at any time). */
  flush(): void;
}

export function initScrolly(root: HTMLElement, smooth: Smooth): Scrolly {
  const none: Scrolly = { dispose: () => undefined, flush: () => undefined };
  const journey = root.querySelector<HTMLElement>("#journey");
  if (!journey) return none;
  const chapters = [...journey.querySelectorAll<HTMLElement>("[data-chapter]")];
  if (!chapters.length) return none;

  const d = new Disposer();
  const scenes = [...journey.querySelectorAll<HTMLElement>("[data-scene]")];
  const links = [...root.querySelectorAll<HTMLElement>("[data-chapter-link]")];
  const progressBar = root.querySelector<HTMLElement>("#journey-progress");
  const chapterNumber = root.querySelector<HTMLElement>("#chapter-current");
  const mobile = matchMedia("(max-width: 767px)");
  const reducedMotion = prefersReducedMotion();
  const hero = root.querySelector<HTMLElement>("#universe");

  let geometry: ChapterGeometry[] = [];
  let viewportHeight = 1;
  let start = 0;
  let distance = 1;
  let needsMeasure = true;
  let frame = 0;
  let activeIndex = -1;
  let lastPercent = -1;
  let lastHeroProgress = -1;
  let heroTop = 0;
  let heroHeight = 1;
  let lastScrollY = -1;
  let lastJourney = -1;
  const lastLocal: number[] = [];
  const EPSILON = 0.0005;

  const measure = () => {
    viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
    const scrollY = window.scrollY || 0;
    if (hero) {
      const b = hero.getBoundingClientRect();
      heroTop = b.top + scrollY;
      heroHeight = Math.max(1, b.height);
    }
    const bounds = journey.getBoundingClientRect();
    start = bounds.top + scrollY;
    distance = Math.max(1, bounds.height - viewportHeight);
    geometry = chapters.map((chapter) => {
      const b = chapter.getBoundingClientRect();
      const reading = (chapter.querySelector(".chapter-read") || chapter).getBoundingClientRect();
      return { top: b.top + scrollY, height: Math.max(1, b.height), center: reading.top + scrollY + Math.max(0, reading.height) / 2 };
    });
    needsMeasure = false;
  };

  const render = () => {
    frame = 0;
    const scrollY = window.scrollY || 0;
    // Lenis and the native scroll event can both ask for a frame; do the work once.
    if (!needsMeasure && scrollY === lastScrollY) return;
    lastScrollY = scrollY;
    if (needsMeasure) measure();

    if (hero) {
      const heroProgress = reducedMotion.matches ? 0 : clamp((scrollY - heroTop) / heroHeight);
      if (Math.abs(heroProgress - lastHeroProgress) > 0.001) {
        hero.style.setProperty("--hero-progress", heroProgress.toFixed(4));
        lastHeroProgress = heroProgress;
      }
    }

    const readingLine = scrollY + viewportHeight * (mobile.matches ? 0.65 : 0.5);
    const progress = clamp((scrollY - start) / distance);
    const percent = Math.round(progress * 100);

    let nearest = 0;
    let nearestDistance = Infinity;
    geometry.forEach((chapter, index) => {
      const gap = Math.abs(readingLine - chapter.center);
      if (gap < nearestDistance) {
        nearestDistance = gap;
        nearest = index;
      }
      const local = clamp((readingLine - chapter.top) / chapter.height);
      // Off-screen chapters sit clamped at 0 or 1: skip the style writes when nothing changed.
      if (lastLocal[index] === undefined || Math.abs(local - lastLocal[index]) > EPSILON) {
        lastLocal[index] = local;
        const value = local.toFixed(4);
        chapters[index].style.setProperty("--chapter-progress", value);
        scenes[index]?.style.setProperty("--scene-progress", value);
      }
    });

    if (Math.abs(progress - lastJourney) > EPSILON) {
      lastJourney = progress;
      // Written on the bar itself, not on #journey: a custom property on the section would invalidate
      // style for every chapter, scene and portrait on each frame.
      (progressBar || journey).style.setProperty("--journey-progress", progress.toFixed(4));
    }
    if (percent !== lastPercent) {
      progressBar?.setAttribute("aria-valuenow", String(percent));
      lastPercent = percent;
    }

    if (nearest !== activeIndex) {
      activeIndex = nearest;
      const chapterId = chapters[nearest].dataset.chapter;
      journey.dataset.active = chapterId;
      if (chapterNumber) chapterNumber.textContent = String(nearest + 1).padStart(2, "0");
      chapters.forEach((chapter, index) => chapter.classList.toggle("is-active", index === nearest));
      scenes.forEach((scene, index) => scene.classList.toggle("is-active", index === nearest));
      links.forEach((link) => {
        if (link.dataset.chapterLink === chapterId) link.setAttribute("aria-current", "step");
        else link.removeAttribute("aria-current");
      });
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  const remeasure = () => {
    needsMeasure = true;
    schedule();
  };

  // chapter links scroll smoothly to their chapter
  links.forEach((link) =>
    d.listen(link, "click", (event) => {
      const index = parseInt(link.dataset.chapterLink || "", 10);
      if (Number.isNaN(index) || !chapters[index]) return;
      event.preventDefault();
      const rect = chapters[index].getBoundingClientRect();
      const offset = mobile.matches ? viewportHeight * 0.42 : viewportHeight * 0.15;
      smooth.scrollTo(Math.max(0, window.scrollY + rect.top - offset));
    })
  );

  d.listen(window, "scroll", schedule, { passive: true });
  // Lenis reports each scroll step inside its own frame, so the visuals never trail the page.
  d.add(
    smooth.onScroll(() => {
      if (frame) cancelAnimationFrame(frame);
      render();
    })
  );
  d.listen(window, "resize", remeasure, { passive: true });
  d.listen(window, "orientationchange", remeasure, { passive: true });
  d.listen(window, "hashchange", () => {
    lastScrollY = -1;
    schedule();
  });
  d.listen(window, "load", remeasure, { once: true });
  d.media(mobile, remeasure);
  d.media(reducedMotion, () => {
    lastScrollY = -1;
    schedule();
  });
  document.fonts?.ready.then(remeasure);
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(remeasure);
    observer.observe(journey);
    chapters.forEach((chapter) => observer.observe(chapter));
    d.add(() => observer.disconnect());
  }

  scenes.forEach((scene) => scene.setAttribute("aria-hidden", "true"));
  render();

  return {
    flush: () => {
      if (frame) cancelAnimationFrame(frame);
      render();
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      d.dispose();
    },
  };
}
