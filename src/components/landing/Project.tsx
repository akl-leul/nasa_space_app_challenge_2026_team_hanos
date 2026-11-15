/* eslint-disable @next/next/no-img-element -- an SVG placeholder: next/image would not optimise it */
import Link from "next/link";
import { Words } from "./Words";

/**
 * "Our project": the summary and the sky-map link (to the explorer), beside a tilting device frame.
 * The picture in the frame is a label-free ILLUSTRATIVE placeholder (public/landing/app-preview.svg), not a
 * screenshot of the explorer and not SPHEREx data. Swap it for a real screenshot when there is one.
 */
export function Project() {
  return (
    <section className="project-section" id="project" aria-labelledby="project-title" tabIndex={-1}>
      <div className="project-copy">
        <p className="field-label">Team Hanos</p>
        <h2 id="project-title" className="words">
          <Words pieces={["Our project."]} />
        </h2>
        <div className="project-space" aria-label="Team project details">
          <p className="project-summary">An interactive sky observation explorer comparing multi-epoch infrared surveys for NASA&apos;s SPHEREx mission.</p>
          <Link href="/explore" prefetch={false} className="project-btn" id="open-sky-map">
            <span>open Sky Map</span>
            <span className="project-btn-icon" aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      <div className="device" aria-hidden="true">
        <div className="device-frame">
          <div className="device-bar">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="device-screen">
            <img src="/landing/app-preview.svg" width={1280} height={800} alt="" loading="lazy" decoding="async" />
          </div>
        </div>
      </div>
    </section>
  );
}
