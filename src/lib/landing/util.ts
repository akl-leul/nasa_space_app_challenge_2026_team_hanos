export const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Listen to a media query in every browser (Safari before 14 only has addListener). */
export function onMedia(mq: MediaQueryList, fn: () => void): () => void {
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }
  mq.addListener(fn);
  return () => mq.removeListener(fn);
}

/** Collects clean-up functions so a module can undo everything it set up (needed for route changes and Strict Mode). */
export class Disposer {
  private fns: Array<() => void> = [];

  add(fn: () => void): void {
    this.fns.push(fn);
  }

  listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions | boolean): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions | boolean): void;
  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions | boolean): void;
  listen(target: EventTarget, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions | boolean): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.fns.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  media(mq: MediaQueryList, fn: () => void): void {
    this.fns.push(onMedia(mq, fn));
  }

  dispose(): void {
    const fns = this.fns;
    this.fns = [];
    for (let i = fns.length - 1; i >= 0; i--) {
      try {
        fns[i]();
      } catch {
        /* a clean-up step must never stop the others */
      }
    }
  }
}

export const prefersReducedMotion = (): MediaQueryList => matchMedia("(prefers-reduced-motion: reduce)");
