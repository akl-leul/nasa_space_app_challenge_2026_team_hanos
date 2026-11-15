/* eslint-disable @next/next/no-img-element -- pre-optimised WebP cut-outs with their own dimensions and alpha, served as is */
import type { CSSProperties } from "react";
import { TEAM } from "@/config/team";
import { Words } from "./Words";

/** "The whole team": the six portraits, gathered here by the scroll story above. */
export function Roster() {
  return (
    <section className="team-roster" id="team-roster" aria-labelledby="roster-title" tabIndex={-1}>
      <p className="field-label">Team Hanos</p>
      <h2 id="roster-title" className="words">
        <Words pieces={["The whole team."]} />
      </h2>
      <ul className="roster-grid">
        {TEAM.map((m) => (
          <li className="roster-member" key={m.photo}>
            <div className="roster-figure">
              <div className="roster-photo">
                <img
                  src={`/landing/team/${m.photo}`}
                  width={m.width}
                  height={m.height}
                  loading="lazy"
                  decoding="async"
                  style={{ "--fit": `${m.fit}%` } as CSSProperties}
                  alt=""
                />
              </div>
            </div>
            <h3 className="roster-name">
              {m.first} {m.last}
            </h3>
            <p className="roster-role">{m.role}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
