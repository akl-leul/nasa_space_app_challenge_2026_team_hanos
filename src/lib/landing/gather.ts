/**
 * Team "dock and gather".
 *
 *  - Chapter by chapter: when a member is passed, their circle shrinks into the ring above their name in the
 *    chapter nav and waits there (a short timed move; scrolling back reverses it).
 *  - After the last member the whole row leaves the stage and flies into the roster section. That part is
 *    scroll-driven (scrubbed): the circles are exactly as far along as the page has scrolled, so it is reversible
 *    and works with jumps.
 *
 * All state is derived from the scroll position and the active chapter, never from past events. Everything moves
 * with transform only, from geometry measured once (no layout reads per frame). Skipped under reduced motion
 * (the roster is simply shown). (Port of the reference gather.js.)
 */
import type { Smooth } from "./smooth";
import { clamp, Disposer, lerp, prefersReducedMotion } from "./util";

interface Pos {
  x: number;
  y: number;
  s: number;
  z: number;
}
interface Flyer {
  el: HTMLDivElement;
  img: HTMLImageElement;
  state: "hidden" | "docked";
  anims: Animation[] | null;
  lastKey: string;
}
interface Geometry {
  vh: number;
  D: number;
  rosterDoc: { x: number; y: number }[];
  stageLeft: number;
  layoutTop: number;
  pinEnd: number;
  slotRel: { x: number; y: number; size: number }[];
  W0: number;
  W1: number;
}

const DOCK_MS = 380; // one member moving into / out of the dock
const DOCK_EASE = "cubic-bezier(.5, 0, .2, 1)";
const ZOOM_DOCKED = 1.5; // the small avatar is cropped in on the face
const LAST_LEAD = 0.28; // the last member docks this many screens before the stage releases
const GATHER_TOP = 0.22; // gather finishes when the roster grid top sits this far down the screen
const STAGGER = 0.05; // each member starts the gather a little after the previous one
const ARC = 28; // px of lift in the middle of each flight
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function initGather(root: HTMLElement, smooth: Smooth, flushActive: () => void): () => void {
  const reduced = prefersReducedMotion();
  const journey = root.querySelector<HTMLElement>("#journey");
  const roster = root.querySelector<HTMLElement>("#team-roster");
  const stage = root.querySelector<HTMLElement>(".journey-stage");
  const layout = root.querySelector<HTMLElement>(".journey-layout");
  const noop = () => undefined;
  if (!journey || !roster || !stage || !layout || reduced.matches || typeof Element.prototype.animate !== "function") return noop;

  const slots = [...root.querySelectorAll<HTMLElement>(".chapter-navigation .dock-slot")];
  const figures = [...roster.querySelectorAll<HTMLElement>(".roster-figure")];
  const members = [...roster.querySelectorAll<HTMLElement>(".roster-member")];
  const portraits = [...root.querySelectorAll<HTMLElement>(".scene .member-portrait")];
  const N = figures.length;
  if (!N || slots.length !== N || portraits.length !== N || members.length !== N) return noop;

  const d = new Disposer();

  /* ---------- the flying copies live in one fixed layer ---------- */
  const layer = document.createElement("div");
  layer.className = "flyers";
  layer.setAttribute("aria-hidden", "true");
  const flyers: Flyer[] = figures.map((_, i) => {
    const el = document.createElement("div");
    el.className = "flyer";
    const source = members[i].querySelector("img") as HTMLImageElement;
    const img = source.cloneNode(false) as HTMLImageElement;
    img.removeAttribute("loading");
    img.setAttribute("decoding", "async");
    img.setAttribute("alt", "");
    el.append(img);
    layer.append(el);
    return { el, img, state: "hidden", anims: null, lastKey: "" };
  });
  root.append(layer);
  roster.classList.add("gather-armed");

  /* ---------- geometry (measured once, again on resize / fonts / layout change) ---------- */
  let G: Geometry | null = null;
  let lastY = -1;

  const measure = () => {
    const sx = window.scrollX;
    const sy = window.scrollY;
    const vh = window.innerHeight;
    const st = stage.getBoundingClientRect();
    const ly = layout.getBoundingClientRect();
    const fr = figures.map((f) => f.getBoundingClientRect());
    const gridTop = (roster.querySelector(".roster-grid") as HTMLElement).getBoundingClientRect().top + sy;
    const g: Geometry = {
      vh,
      D: fr[0].width,
      rosterDoc: fr.map((r) => ({ x: r.left + sx + r.width / 2, y: r.top + sy + r.height / 2 })),
      stageLeft: st.left + sx,
      layoutTop: ly.top + sy,
      pinEnd: ly.bottom + sy - st.height,
      slotRel: slots.map((s) => {
        const r = s.getBoundingClientRect();
        return { x: r.left + r.width / 2 - st.left, y: r.top + r.height / 2 - st.top, size: r.width };
      }),
      W0: 0,
      W1: 0,
    };
    g.W0 = g.pinEnd; // the stage starts to release
    g.W1 = Math.max(g.W0 + 240, gridTop - GATHER_TOP * vh); // the roster is in place
    G = g;
    flyers.forEach((f) => {
      f.el.style.width = f.el.style.height = g.D + "px";
      f.lastKey = "";
    });
    lastY = -1;
    render();
  };

  const stageTop = (y: number): number => clamp(y, G!.layoutTop, G!.pinEnd) - y; // the sticky stage, as a viewport offset
  const slotPos = (i: number, y: number): Pos => ({ x: G!.stageLeft + G!.slotRel[i].x - window.scrollX, y: stageTop(y) + G!.slotRel[i].y, s: G!.slotRel[i].size / G!.D, z: ZOOM_DOCKED });
  const rosterPos = (i: number, y: number): Pos => ({ x: G!.rosterDoc[i].x - window.scrollX, y: G!.rosterDoc[i].y - y, s: 1, z: 1 });
  const portraitPos = (i: number): Pos => {
    const r = portraits[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width / G!.D, z: 1 };
  };
  const tf = ({ x, y, s }: Pos): string => `translate3d(${(x - G!.D / 2).toFixed(2)}px, ${(y - G!.D / 2).toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
  const zf = (z: number): string => `translate(-50%, -50%) scale(${z})`;
  const put = (f: Flyer, pos: Pos) => {
    f.el.style.transform = tf(pos);
    f.img.style.setProperty("--zoom", pos.z.toFixed(3));
  };
  const show = (f: Flyer, on: boolean) => f.el.classList.toggle("is-on", on);

  /* ---------- docking: derived state + short timed moves ---------- */
  // is-lifted hides the portrait while its copy is docked; has-lifted on the scene hides the ring
  // (the CSS used :has() for that, which older Firefox lacks)
  const lift = (i: number, on: boolean) => {
    portraits[i].classList.toggle("is-lifted", on);
    portraits[i].closest(".scene")?.classList.toggle("has-lifted", on);
  };
  const settle = (i: number) => {
    const f = flyers[i];
    if (f.anims) {
      f.anims.forEach((a) => a.cancel());
      f.anims = null;
    }
    lift(i, f.state === "docked");
  };

  const wanted = (i: number, y: number, active: number): "docked" | "hidden" => {
    if (i < N - 1) return i < active ? "docked" : "hidden";
    return y >= G!.W0 - LAST_LEAD * G!.vh ? "docked" : "hidden";
  };

  const snap = (i: number, state: "docked" | "hidden") => {
    const f = flyers[i];
    settle(i);
    f.state = state;
    f.lastKey = "";
    show(f, state === "docked");
    lift(i, state === "docked");
  };

  const fly = (i: number, state: "docked" | "hidden") => {
    const f = flyers[i];
    settle(i);
    const docking = state === "docked";
    const slot = slotPos(i, window.scrollY);
    const out = portraitPos(i);
    const from = docking ? out : slot;
    const to = docking ? slot : out;
    f.state = state;
    f.lastKey = "";
    show(f, true);
    lift(i, true);
    const opts: KeyframeAnimationOptions = { duration: DOCK_MS, easing: DOCK_EASE, fill: "both" };
    const a = f.el.animate([{ transform: tf(from) }, { transform: tf(to) }], opts);
    const b = f.img.animate([{ transform: zf(from.z) }, { transform: zf(to.z) }], opts);
    f.anims = [a, b];
    a.finished.then(
      () => {
        if (f.anims && f.anims[0] === a) {
          f.anims = null;
          a.cancel();
          b.cancel();
          if (docking) {
            put(f, to);
            lift(i, true);
          } else {
            show(f, false);
            lift(i, false);
          }
        }
      },
      () => undefined
    );
  };

  /* ---------- per-frame work ---------- */
  function render() {
    if (!G) return;
    // Which member is active is decided by the scroll story. Listener order between the two modules (and Lenis)
    // is not guaranteed, so bring it up to date first.
    flushActive();
    const y = window.scrollY;
    if (y === lastY) return;
    lastY = y;
    const active = clamp(parseInt(journey!.dataset.active || "0", 10) || 0, 0, N - 1);
    const p = clamp((y - G.W0) / (G.W1 - G.W0));

    // which members should be waiting in the dock right now
    const changes: number[] = [];
    flyers.forEach((f, i) => {
      if (wanted(i, y, active) !== f.state) changes.push(i);
    });
    const animate = p <= 0 && changes.length === 1;
    changes.forEach((i) => (animate ? fly(i, wanted(i, y, active)) : snap(i, wanted(i, y, active))));

    if (p > 0 && p < 1) {
      // gather: every docked circle travels from its ring to its roster slot
      roster!.classList.remove("is-gathered");
      const span = 1 - (N - 1) * STAGGER;
      flyers.forEach((f, i) => {
        if (f.state !== "docked") return;
        if (f.anims) settle(i);
        f.lastKey = "";
        const pi = ease(clamp((p - i * STAGGER) / span));
        const a = slotPos(i, y);
        const b = rosterPos(i, y);
        put(f, { x: lerp(a.x, b.x, pi), y: lerp(a.y, b.y, pi) - Math.sin(pi * Math.PI) * ARC, s: lerp(a.s, b.s, pi), z: lerp(a.z, b.z, pi) });
        show(f, true);
        members[i].style.setProperty("--g", pi.toFixed(3));
        members[i].style.setProperty("--g2", clamp((pi - 0.55) / 0.45).toFixed(3));
      });
    } else if (p >= 1) {
      // hand over to the real roster circles (they sit exactly where the flyers just landed)
      roster!.classList.add("is-gathered");
      flyers.forEach((f, i) => {
        f.lastKey = "";
        show(f, false);
        members[i].style.removeProperty("--g");
        members[i].style.removeProperty("--g2");
      });
    } else {
      roster!.classList.remove("is-gathered");
      const top = Math.round(stageTop(y));
      flyers.forEach((f, i) => {
        members[i].style.removeProperty("--g");
        members[i].style.removeProperty("--g2");
        if (f.state !== "docked" || f.anims) return;
        const key = top + "|" + G!.stageLeft;
        if (f.lastKey !== key) {
          f.lastKey = key;
          put(f, slotPos(i, y));
        }
        show(f, true);
      });
    }
  }

  /* ---------- wiring ---------- */
  d.listen(window, "scroll", render, { passive: true });
  d.add(smooth.onScroll(render));
  d.listen(window, "resize", measure, { passive: true });
  d.listen(window, "load", measure, { once: true });
  document.fonts?.ready.then(measure);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => measure());
    ro.observe(document.body);
    d.add(() => ro.disconnect());
  }
  measure();

  return () => {
    d.dispose();
    flyers.forEach((f) => f.anims?.forEach((a) => a.cancel()));
    layer.remove();
    roster.classList.remove("gather-armed", "is-gathered");
    members.forEach((m) => {
      m.style.removeProperty("--g");
      m.style.removeProperty("--g2");
    });
    portraits.forEach((_, i) => lift(i, false));
  };
}
