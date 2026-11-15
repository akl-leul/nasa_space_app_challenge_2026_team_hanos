/**
 * Smooth, responsive scrolling for the landing pages.
 *
 * - Wheel scrolling is smoothed by Lenis (vendored in /public/landing/vendor, loaded after the page is
 *   interactive). It scrolls the real window, so position: sticky, the scrollbar and the keyboard keep working.
 * - Touch keeps native momentum (syncTouch off).
 * - Lenis drives one animation loop and tells the other modules about each scroll step through onScroll(),
 *   so scroll-linked visuals update in the same frame.
 * - Off under prefers-reduced-motion. If Lenis never loads, native scrolling and native anchor jumps work.
 */
import { Disposer, onMedia, prefersReducedMotion } from "./util";

interface LenisInstance {
  on(event: "scroll", fn: () => void): void;
  stop(): void;
  start(): void;
  destroy(): void;
  scrollTo(target: number | Element | string, options: Record<string, unknown>): void;
}
type LenisConstructor = new (options: Record<string, unknown>) => LenisInstance;
declare global {
  interface Window {
    Lenis?: LenisConstructor;
  }
}

export interface ScrollToOptions {
  offset?: number;
  immediate?: boolean;
  onComplete?: () => void;
}

export interface Smooth {
  readonly active: boolean;
  onScroll(fn: () => void): () => void;
  scrollTo(target: number | Element | string, opts?: ScrollToOptions): void;
  jump(y: number): void;
  lock(reason: string): void;
  unlock(reason: string): void;
  destroy(): void;
}

const WHEEL_LERP = 0.1; // 0.07 = floaty, 0.1 = smooth and responsive, 0.16 = tight
const WHEEL_MULTIPLIER = 1;
const JUMP_DURATION = 0.8; // seconds for anchor and chapter-link jumps
const JUMP_EASE = (t: number): number => 1 - Math.pow(1 - t, 4); // easeOutQuart
const LENIS_SRC = "/landing/vendor/lenis-1.3.27.min.js";

let lenisLoading: Promise<void> | null = null;
function loadLenis(): Promise<void> {
  if (window.Lenis) return Promise.resolve();
  if (!lenisLoading) {
    lenisLoading = new Promise<void>((resolve) => {
      const script = document.createElement("script");
      script.src = LENIS_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        lenisLoading = null; // allow a retry on the next page; native scrolling carries on meanwhile
        resolve();
      };
      document.head.append(script);
    });
  }
  return lenisLoading;
}

export function createSmooth(): Smooth {
  const root = document.documentElement;
  const reduced = prefersReducedMotion();
  const listeners = new Set<() => void>();
  const locks = new Set<string>();
  const d = new Disposer();
  let lenis: LenisInstance | null = null;
  let destroyed = false;

  const emit = () => listeners.forEach((fn) => fn());

  const applyLocks = () => {
    // Without Lenis (not loaded yet, reduced motion) a class stops page scrolling for the menu and the challenge reveal.
    root.classList.toggle("hanos-locked", locks.size > 0 && !lenis);
    if (!lenis) return;
    if (locks.size) lenis.stop();
    else lenis.start();
  };

  const create = () => {
    if (lenis || destroyed || reduced.matches || typeof window.Lenis !== "function") return;
    lenis = new window.Lenis({
      lerp: WHEEL_LERP,
      wheelMultiplier: WHEEL_MULTIPLIER,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: true,
      anchors: false, // anchors are handled by navigation.ts so focus and history stay correct
    });
    lenis.on("scroll", emit);
    applyLocks();
  };

  const destroyLenis = () => {
    if (!lenis) return;
    lenis.destroy();
    lenis = null;
    root.classList.remove("lenis", "lenis-smooth", "lenis-stopped", "lenis-scrolling");
    applyLocks();
    emit();
  };

  const scrollPad = () => parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;

  const api: Smooth = {
    get active() {
      return !!lenis;
    },
    onScroll(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    scrollTo(target, opts = {}) {
      const { offset = 0, immediate = false, onComplete } = opts;
      if (lenis) {
        lenis.scrollTo(target, {
          offset,
          immediate: immediate || reduced.matches,
          force: immediate,
          duration: JUMP_DURATION,
          easing: JUMP_EASE,
          onComplete,
        });
        return;
      }
      let y = typeof target === "number" ? target : 0;
      const el = typeof target === "string" ? document.querySelector(target) : target;
      if (el instanceof Element) y = el.getBoundingClientRect().top + window.scrollY - scrollPad();
      window.scrollTo({ top: Math.max(0, y + offset), behavior: immediate || reduced.matches ? "instant" : "smooth" });
      if (onComplete) setTimeout(onComplete, immediate ? 0 : 700);
    },
    jump(y) {
      api.scrollTo(y, { immediate: true });
    },
    lock(reason) {
      locks.add(reason);
      applyLocks();
    },
    unlock(reason) {
      locks.delete(reason);
      applyLocks();
    },
    destroy() {
      destroyed = true;
      destroyLenis();
      d.dispose();
      locks.clear();
      root.classList.remove("hanos-locked");
      listeners.clear();
    },
  };

  // Lenis arrives after the page is usable; until then (and without it) scrolling is native.
  const start = () => {
    if (destroyed || reduced.matches) return;
    loadLenis().then(create);
  };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(start, { timeout: 1200 });
    d.add(() => window.cancelIdleCallback(id));
  } else {
    const id = window.setTimeout(start, 250);
    d.add(() => window.clearTimeout(id));
  }
  d.add(onMedia(reduced, () => (reduced.matches ? destroyLenis() : start())));
  return api;
}
