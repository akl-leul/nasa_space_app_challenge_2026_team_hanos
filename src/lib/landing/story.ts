/**
 * The hero: the "liquid" challenge reveal, the mobile menu and the cursor ring.
 * (Port of the reference script.js. State classes live on the .hanos wrapper instead of <body>.)
 */
import type { Smooth } from "./smooth";
import { Disposer, prefersReducedMotion } from "./util";

// Nine cubic segments for the organic morph of the left blob
const CLOSED = [.03,.47, .02,.41,.08,.35,.10,.28, .12,.22,.16,.18,.20,.19, .24,.20,.26,.23,.25,.27, .25,.31,.22,.34,.21,.38, .19,.42,.21,.47,.21,.52, .22,.57,.19,.60,.16,.62, .13,.64,.10,.64,.08,.63, .04,.62,.02,.59,.03,.55, .03,.52,.03,.50,.03,.47];
const OPENED = [.03,.47, .01,.37,.04,.25,.13,.20, .22,.15,.26,.24,.36,.17, .44,.11,.52,.24,.61,.19, .70,.12,.76,.17,.84,.13, .94,.07,1.06,.18,1.03,.42, 1.04,.59,.99,.72,.88,.75, .77,.78,.72,.72,.65,.76, .53,.83,.47,.70,.38,.76, .24,.83,.01,.72,.03,.47];
const OPENED_MOBILE = [-.10,.46, -.14,.31,-.03,.21,.12,.19, .24,.16,.35,.22,.47,.18, .61,.13,.70,.22,.85,.18, 1.04,.13,1.15,.24,1.12,.39, 1.16,.49,1.12,.58,1.10,.66, 1.08,.75,.94,.79,.81,.76, .65,.72,.58,.80,.44,.77, .32,.74,.22,.80,.10,.77, -.04,.75,-.16,.63,-.10,.46];

const makePath = (v: number[]): string =>
  `M ${v.slice(0, 2).join(" ")} ${Array.from({ length: 9 }, (_, i) => "C " + v.slice(2 + i * 6, 8 + i * 6).join(" ")).join(" ")} Z`;

export function initStory(root: HTMLElement, smooth: Smooth): () => void {
  const d = new Disposer();
  const html = document.documentElement;
  const trigger = root.querySelector<HTMLButtonElement>(".mystery-trigger");
  const panel = root.querySelector<HTMLElement>("#mystery-panel");
  const title = root.querySelector<HTMLElement>("#mystery-title");
  const hero = root.querySelector<HTMLElement>(".hero");
  const path = root.querySelector<SVGPathElement>("#liquid-path");
  const motion = prefersReducedMotion();
  const mobile = matchMedia("(max-width: 767px)");
  const menu = root.querySelector<HTMLButtonElement>(".menu-toggle");
  const navigation = root.querySelector<HTMLElement>("#navigation");

  let progress = 0;
  let isOpen = false;
  let frame = 0;
  let animationToken = 0;
  let storyOpener: HTMLElement | null = trigger;
  let returnScroll = 0;

  const draw = () => {
    if (!path) return; // pages without the story panel (the challenge page)
    const end = mobile.matches ? OPENED_MOBILE : OPENED;
    path.setAttribute("d", makePath(CLOSED.map((value, index) => value + (end[index] - value) * progress)));
  };

  const animate = (target: number, onDone?: () => void) => {
    cancelAnimationFrame(frame);
    const token = ++animationToken;
    const from = progress;
    const started = performance.now();
    const duration = motion.matches ? 120 : target ? 480 : 400; // snappy: 480 ms open, 400 ms close
    const tick = (time: number) => {
      if (token !== animationToken) return;
      const elapsed = Math.min(1, (time - started) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3.5);
      progress = from + (target - from) * eased;
      if (motion.matches) {
        progress = target;
        if (panel) panel.style.opacity = target ? String(elapsed) : String(1 - elapsed);
      }
      draw();
      if (elapsed < 1) frame = requestAnimationFrame(tick);
      else {
        if (panel) panel.style.opacity = "";
        onDone?.();
      }
    };
    frame = requestAnimationFrame(tick);
  };

  const setStory = (open: boolean, opener: HTMLElement | null = trigger) => {
    if (!panel || !trigger || !hero || !title || !path) return; // not on this page
    if (open === isOpen) return;
    if (open) {
      storyOpener = opener;
      returnScroll = window.scrollY || 0;
    }
    isOpen = open;
    html.classList.toggle("reading-story", open);
    root.querySelectorAll<HTMLElement>(".journey, .journey-outro, .project-section").forEach((section) => {
      section.inert = open;
    });
    trigger.inert = open;
    smooth.unlock("story"); // release first so the position can be restored
    smooth.jump(open ? 0 : returnScroll);
    if (open) smooth.lock("story");
    root.classList.add("story-transition");
    root.classList.toggle("story-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    hero.setAttribute("aria-hidden", String(open));
    panel.inert = !open;
    panel.setAttribute("aria-hidden", String(!open));
    if (open) {
      root.classList.remove("hero-return");
      animate(1, () => {
        root.classList.remove("story-transition");
        if (isOpen) title.focus({ preventScroll: true });
      });
    } else {
      root.classList.add("hero-return");
      storyOpener?.focus({ preventScroll: true });
      animate(0, () => root.classList.remove("story-transition"));
    }
  };

  // ---- responsive menu ----
  const setMenu = (open: boolean) => {
    if (!menu || !navigation) return;
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    navigation.classList.toggle("is-open", open);
    html.classList.toggle("menu-open", open);
    if (open) smooth.lock("menu");
    else smooth.unlock("menu");
  };

  if (trigger) d.listen(trigger, "click", () => setStory(true));
  root.querySelectorAll(".close-story, .story-back").forEach((button) => d.listen(button, "click", () => setStory(false)));
  if (panel) {
    d.listen(panel, "click", (event) => {
      if ((event as MouseEvent).target === panel) setStory(false);
    });
  }
  const brand = root.querySelector(".brand");
  if (brand) {
    d.listen(brand, "click", () => {
      setStory(false);
      setMenu(false);
    });
  }
  root.querySelectorAll<HTMLElement>("[data-open-mystery]").forEach((link) =>
    d.listen(link, "click", (event) => {
      event.preventDefault();
      setStory(true, link);
    })
  );
  root.querySelectorAll("[data-journey-nav]").forEach((link) =>
    d.listen(link, "click", () => {
      setStory(false);
      setMenu(false);
    })
  );
  if (menu) d.listen(menu, "click", () => setMenu(menu.getAttribute("aria-expanded") !== "true"));

  // ---- keyboard ----
  d.listen(document, "keydown", (event) => {
    if (event.key !== "Escape") return;
    if (isOpen) setStory(false);
    const wasOpen = menu?.getAttribute("aria-expanded") === "true";
    setMenu(false);
    if (wasOpen) menu?.focus({ preventScroll: true });
  });

  d.media(mobile, () => {
    draw();
    setMenu(false);
  });
  d.media(motion, () => {
    cancelAnimationFrame(frame);
    animationToken++;
    progress = isOpen ? 1 : 0;
    draw();
    if (panel) panel.style.opacity = "";
    root.classList.remove("story-transition");
    if (isOpen && title) title.focus({ preventScroll: true });
  });

  // ---- cursor ring with a magnetic hover state ----
  const ring = root.querySelector<HTMLElement>(".cursor-ring");
  if (ring && matchMedia("(pointer:fine)").matches && !motion.matches) {
    let x = -100;
    let y = -100;
    let tx = -100;
    let ty = -100;
    let ringFrame = 0;
    const follow = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      ring.style.transform = `translate3d(${x - 21}px, ${y - 21}px, 0)`;
      ringFrame = Math.abs(tx - x) + Math.abs(ty - y) > 0.15 ? requestAnimationFrame(follow) : 0;
    };
    d.listen(
      document,
      "pointermove",
      (event) => {
        tx = event.clientX;
        ty = event.clientY;
        ring.classList.add("is-visible");
        if (!ringFrame) ringFrame = requestAnimationFrame(follow);
        const target = event.target;
        ring.classList.toggle("is-hovering", target instanceof Element && !!target.closest('a, button, [role="button"], .mystery-trigger'));
      },
      { passive: true }
    );
    d.listen(html, "pointerleave", () => {
      ring.classList.remove("is-visible");
      ring.classList.remove("is-hovering");
    });
    d.add(() => {
      cancelAnimationFrame(ringFrame);
      ring.style.transform = "";
      ring.classList.remove("is-visible", "is-hovering");
    });
  }

  draw();

  return () => {
    cancelAnimationFrame(frame);
    animationToken++;
    d.dispose();
    html.classList.remove("reading-story", "menu-open");
    root.classList.remove("story-open", "story-transition", "hero-return");
    smooth.unlock("story");
    smooth.unlock("menu");
  };
}
