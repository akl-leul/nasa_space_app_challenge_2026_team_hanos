import Link from "next/link";
import { Words } from "./Words";

/** The dark closing section with the resource links and the colophon. */
export function Outro({ page }: { page: "home" | "challenge" }) {
  const home = page === "home";
  return (
    <section className="journey-outro" id="resources" aria-labelledby="outro-title" tabIndex={-1}>
      <span className="outro-star" aria-hidden="true">✦</span>
      <p className="field-label">A little curiosity. An infinite universe.</p>
      <h2 id="outro-title" className="words">
        <Words pieces={["Keep a little space", "br", { em: "for the unexpected." }]} />
      </h2>
      <p>One question leads to another. Where will yours take you?</p>
      <div className="outro-actions">
        {home ? (
          <>
            <a href="#universe" className="outro-button" data-open-mystery>
              Explore the challenge <span aria-hidden="true">↗</span>
            </a>
            <a href="#journey" className="outro-repeat">
              Take the journey again <span aria-hidden="true">↑</span>
            </a>
          </>
        ) : (
          <>
            <Link href="/#chapter-member-1" className="outro-button">
              Back to the team <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/" className="outro-repeat">
              Back to home <span aria-hidden="true">↑</span>
            </Link>
          </>
        )}
      </div>
      <div className="outro-resources">
        <a href="https://science.nasa.gov/mission/spherex/" target="_blank" rel="noopener noreferrer">SPHEREx mission ↗</a>
        <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noopener noreferrer">Explore the open data ↗</a>
      </div>
      <footer className="journey-colophon">
        <span>HANOS</span>
        <span>Planet X &amp; SPHEREx / NASA Space Apps 2026</span>
        {home ? <a href="#universe">Back to the stars ↑</a> : <Link href="/">Back to the stars ↑</Link>}
      </footer>
    </section>
  );
}
