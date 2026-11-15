/* eslint-disable @next/next/no-img-element -- a fixed screenshot shown in a CSS frame, loaded lazily */
import Link from "next/link";
import { Words } from "./Words";

/**
 * "Our project": the summary and the sky-map link (to the explorer), beside a tilting device frame.
 * The picture in the frame is a screenshot of the Sky Explorer itself (public/landing/app-preview.webp: the sky dome with
 * constellation boundaries, taken from the reference star catalogue). It is a picture of our interface, not SPHEREx
 * imagery. Replace the file with a newer screenshot of the same 2000 x 1139 size when the interface changes.
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
            <img src="/landing/app-preview.webp" width={2000} height={1139} alt="" loading="lazy" decoding="async" />
          </div>
        </div>
      </div>
    </section>
  );
}
