/* eslint-disable @next/next/no-img-element -- pre-optimised WebP cut-outs with their own dimensions and alpha, served as is */
import type { CSSProperties } from "react";
import { TEAM } from "@/config/team";
import { Words } from "./Words";

const fit = (n: number) => ({ "--fit": `${n}%` }) as CSSProperties;
const two = (n: number) => String(n).padStart(2, "0");

/** The pinned team story: portraits on the left, one chapter per member on the right. */
export function Journey() {
  return (
    <section className="journey" id="journey" aria-labelledby="journey-title" data-active="0" tabIndex={-1}>
      <div className="journey-introduction">
        <p className="field-label">Team Hanos / NASA Space Apps Challenge 2026</p>
        <h2 id="journey-title" className="words">
          <Words pieces={["There’s a story in the sky.", "br", { em: "Let’s look a little closer." }]} />
        </h2>
        <p>Six people behind the project.</p>
      </div>
      <div className="journey-layout">
        <div className="journey-stage">
          <div className="journey-hud">
            <span className="field-label">A field guide to a changing sky</span>
            <span className="scene-counter">
              <span id="chapter-current">01</span>
              <span className="counter-divider"> / </span>06
            </span>
          </div>
          <div className="journey-scenes" aria-hidden="true">
            {TEAM.map((m, i) => (
              <div className="scene" data-scene={i} key={m.photo}>
                <div className="portrait-ring" aria-hidden="true">
                  <i className="arc"></i>
                  <i className="dot"></i>
                </div>
                <div className="scene-art member-portrait">
                  <img src={`/landing/team/${m.photo}`} width={m.width} height={m.height} loading="lazy" decoding="async" style={fit(m.fit)} alt="" />
                </div>
              </div>
            ))}
          </div>
          <div className="journey-instruments">
            <nav className="chapter-navigation" aria-label="Team members">
              {TEAM.map((m, i) => (
                <a href={`#chapter-member-${i + 1}`} data-chapter-link={i} aria-current={i === 0 ? "step" : undefined} key={m.photo}>
                  <i className="dock-slot" aria-hidden="true"></i>
                  <span className="nav-label">
                    <span>{two(i + 1)}</span>
                    <span className="nav-name"> {m.first}</span>
                  </span>
                </a>
              ))}
            </nav>
            <div className="journey-progress" id="journey-progress" role="progressbar" aria-label="Journey progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
              <span></span>
            </div>
          </div>
        </div>
        <div className="journey-chapters">
          {TEAM.map((m, i) => (
            <article className="journey-chapter" id={`chapter-member-${i + 1}`} data-chapter={i} aria-labelledby={`member-title-${i + 1}`} tabIndex={-1} key={m.photo}>
              <div className="chapter-read">
                <p className="chapter-kicker">
                  <span>{two(i + 1)}</span> Meet the team
                </p>
                <h3 id={`member-title-${i + 1}`} className="words">
                  <Words pieces={[m.first, "br", { em: m.last }]} />
                </h3>
                <p className="member-role">{m.role}</p>
                <p>{m.bio}</p>
                <ul className="member-links" aria-label={`Contact ${m.first}`}>
                  <li>
                    <a href={m.linkedin} target="_blank" rel="noopener noreferrer" title="LinkedIn" aria-label={`${m.first} on LinkedIn (opens in a new tab)`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          fill="currentColor"
                          d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
                        />
                      </svg>
                    </a>
                  </li>
                  <li>
                    <a href={`mailto:${m.email}`} title={m.email} aria-label={`Email ${m.first} at ${m.email}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                        <path d="m4 7.5 8 5.8 8-5.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  </li>
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
