"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// useLayoutEffect on the client (it runs before the first paint), a plain effect while rendering on the server
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Wakes up the server-rendered landing page. The page is complete HTML without it; this adds the scroll story,
 * the reveal, the theme switch and the page wipe, in code that loads after the page is on screen.
 */
export function LandingController() {
  const router = useRouter();
  const anchor = useRef<HTMLSpanElement>(null);

  // Page-level state on <html>: the same thing the inline script in the layout sets before first paint.
  useIsoLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.add("hanos-page", "hanos-js");
    try {
      if (localStorage.getItem("hanos-theme") === "night") html.setAttribute("data-theme", "night");
      else html.removeAttribute("data-theme");
    } catch {
      /* storage blocked: stay in day mode */
    }
    return () => {
      // Leaving for the explorer removes it. Going to the other landing page keeps it (that page is mounting now),
      // which is what lets the wipe cover the screen without a flash in between.
      setTimeout(() => {
        // Next keeps the page you left (hidden) in the document, so look for a landing page that is actually showing.
        if ([...document.querySelectorAll(".hanos")].some((el) => el.getClientRects().length > 0)) return;
        html.classList.remove("hanos-page", "hanos-js", "hanos-ready", "wipe-in", "hanos-locked", "reading-story", "menu-open");
        html.removeAttribute("data-theme");
      }, 0);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let undo: (() => void) | undefined;
    // the behaviour is a separate chunk: the page paints first, then this loads
    import("@/lib/landing/init").then(({ initLanding }) => {
      const root = anchor.current?.closest<HTMLElement>(".hanos");
      if (cancelled || !root) return;
      undo = initLanding(root, { push: (href) => router.push(href), prefetch: (href) => router.prefetch(href) });
    });
    return () => {
      cancelled = true;
      undo?.();
    };
  }, [router]);

  return <span ref={anchor} hidden />;
}
