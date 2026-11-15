/**
 * Motion polish. Everything animates transform / opacity / translate only (no layout, no filters) and is
 * skipped under prefers-reduced-motion:
 *   1. headline words rise in one by one as they scroll into view (the words are split on the server)
 *   2. the project device frame tilts with scroll
 *   3. the portrait rings and stars respond to the cursor (fine pointers only)
 * (Port of the reference motion.js; the page wipe lives in navigation.ts.)
 */
import type { Smooth } from "./smooth";
import { clamp, Disposer, prefersReducedMotion } from "./util";

interface Layer {
  el: HTMLElement;
  depth: number;
  x: number;
  y: number;
}

export function initMotion(root: HTMLElement, smooth: Smooth): () => void {
  const d = new Disposer();
  const reduced = prefersReducedMotion();
  const finePointer = matchMedia("(pointer: fine)");

  /* ---------- 1. headline word reveals ---------- */
  const headings = [...root.querySelectorAll<HTMLElement>(".words")];
  if (reduced.matches || !("IntersectionObserver" in window)) {
    headings.forEach((h) => h.classList.add("is-in"));
  } else {
    const seen = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          seen.unobserve(entry.target);
        });
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" }
    );
    headings.forEach((h) => seen.observe(h));
    d.add(() => seen.disconnect());
  }

  /* ---------- 2. device frame tilts as it scrolls through ---------- */
  const device = root.querySelector<HTMLElement>(".device");
  if (device && !reduced.matches) {
    let top = 0;
    let height = 1;
    let visible = false;
    let lastP = -1;
    const measure = () => {
      const box = device.getBoundingClientRect();
      top = box.top + window.scrollY;
      height = Math.max(1, box.height);
    };
    const update = () => {
      if (!visible) return;
      const vh = window.innerHeight;
      const p = clamp((window.scrollY + vh - top) / (vh + height));
      if (Math.abs(p - lastP) > 0.002) {
        lastP = p;
        device.style.setProperty("--p", p.toFixed(3));
      }
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
          if (visible) {
            measure();
            update();
          }
        },
        { rootMargin: "10% 0px" }
      );
      io.observe(device);
      d.add(() => io.disconnect());
    } else {
      visible = true;
    }
    d.listen(window, "scroll", update, { passive: true });
    d.add(smooth.onScroll(update));
    const remeasure = () => {
      measure();
      update();
    };
    d.listen(window, "resize", remeasure, { passive: true });
    d.listen(window, "load", remeasure, { once: true });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(remeasure);
      ro.observe(document.body);
      d.add(() => ro.disconnect());
    }
    measure();
  }

  /* ---------- 3. cursor-responsive art ---------- */
  const hasTranslate = typeof CSS !== "undefined" && CSS.supports("translate", "1px 1px");
  if (finePointer.matches && !reduced.matches && hasTranslate) {
    const hero = root.querySelector<HTMLElement>(".universe");
    const stage = root.querySelector<HTMLElement>(".journey-stage");
    const AMPLITUDE = 18; // px of travel at full pointer offset for the front-most layer
    const EASE = 0.08; // how quickly layers catch up with the pointer

    const make = (el: HTMLElement, depth: number): Layer => ({ el, depth, x: 0, y: 0 });
    const sparkles = [...root.querySelectorAll<HTMLElement>(".universe .sparkle")];
    const scenes = [...root.querySelectorAll<HTMLElement>(".scene")].map((el) => ({
      el,
      parts: [
        ...[...el.querySelectorAll<HTMLElement>(".scene-art")].map((a) => make(a, a.classList.contains("member-portrait") ? 0.5 : 1)),
        ...[...el.querySelectorAll<HTMLElement>(".portrait-ring")].map((r) => make(r, 0.5)),
      ],
    }));

    let heroVisible = false;
    let stageVisible = false;
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) =>
        entries.forEach((e) => {
          if (e.target === hero) heroVisible = e.isIntersecting;
          if (e.target === stage) stageVisible = e.isIntersecting;
        })
      );
      if (hero) io.observe(hero);
      if (stage) io.observe(stage);
      d.add(() => io.disconnect());
    } else {
      heroVisible = stageVisible = true;
    }

    let tx = 0;
    let ty = 0;
    let px = 0;
    let py = 0;
    let frame = 0;
    let twinkleQueued = false;

    const step = (layer: Layer): boolean => {
      const gx = tx * layer.depth * AMPLITUDE;
      const gy = ty * layer.depth * AMPLITUDE;
      layer.x += (gx - layer.x) * EASE;
      layer.y += (gy - layer.y) * EASE;
      layer.el.style.translate = `${layer.x.toFixed(2)}px ${layer.y.toFixed(2)}px`;
      return Math.abs(gx - layer.x) + Math.abs(gy - layer.y) > 0.05;
    };

    const tick = () => {
      frame = 0;
      let moving = false;
      if (stageVisible) {
        scenes.forEach((s) => {
          if (s.el.classList.contains("is-active")) s.parts.forEach((p) => {
            if (step(p)) moving = true;
          });
        });
      }
      if (moving) frame = requestAnimationFrame(tick);
    };

    const twinkle = () => {
      twinkleQueued = false;
      if (!heroVisible) return;
      sparkles.forEach((star) => {
        if (star.classList.contains("twinkle")) return;
        const box = star.getBoundingClientRect();
        if (Math.hypot(box.left + box.width / 2 - px, box.top + box.height / 2 - py) < 120) {
          star.classList.add("twinkle");
          star.addEventListener("animationend", () => star.classList.remove("twinkle"), { once: true });
        }
      });
    };

    d.listen(
      window,
      "pointermove",
      (event) => {
        if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
        px = event.clientX;
        py = event.clientY;
        tx = (px / window.innerWidth - 0.5) * 2;
        ty = (py / window.innerHeight - 0.5) * 2;
        if (!frame) frame = requestAnimationFrame(tick);
        if (!twinkleQueued && heroVisible) {
          twinkleQueued = true;
          requestAnimationFrame(twinkle);
        }
      },
      { passive: true }
    );
    d.add(() => {
      cancelAnimationFrame(frame);
      scenes.forEach((s) => s.parts.forEach((p) => p.el.style.removeProperty("translate")));
    });
  }

  return () => d.dispose();
}
