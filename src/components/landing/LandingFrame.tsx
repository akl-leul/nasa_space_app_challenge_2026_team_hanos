import type { ReactNode } from "react";
import { Header } from "./Header";
import { LandingController } from "./LandingController";
import { Outro } from "./Outro";

/**
 * The shared shell of both landing pages: skip link, header, main, the paper grain, the cursor ring and the
 * live-region the scripts use. Everything on the page is server-rendered HTML.
 */
export function LandingFrame({ page, children }: { page: "home" | "challenge"; children: ReactNode }) {
  return (
    <div className={page === "challenge" ? "hanos page-challenge" : "hanos"} id="hanos-root">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {page === "home" && (
        <svg className="clip-definitions" aria-hidden="true" width="0" height="0">
          <defs>
            <clipPath id="liquid-clip" clipPathUnits="objectBoundingBox">
              <path id="liquid-path" d="M .03 .47 C .02 .41 .08 .35 .10 .28 C .12 .22 .16 .18 .20 .19 C .24 .20 .26 .23 .25 .27 C .25 .31 .22 .34 .21 .38 C .19 .42 .21 .47 .21 .52 C .22 .57 .19 .60 .16 .62 C .13 .64 .10 .64 .08 .63 C .04 .62 .02 .59 .03 .55 C .03 .52 .03 .50 .03 .47 Z" />
            </clipPath>
          </defs>
        </svg>
      )}
      <Header page={page} />
      <main id="main-content" tabIndex={-1}>
        {children}
        <Outro page={page} />
      </main>
      <div className="paper-grain" aria-hidden="true"></div>
      <div className="cursor-ring" aria-hidden="true"></div>
      <p className="sr-only" id="nav-status" role="status"></p>
      <LandingController />
    </div>
  );
}
