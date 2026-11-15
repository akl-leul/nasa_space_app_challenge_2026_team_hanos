import type { Metadata } from "next";
import { pageMetadata } from "@/config/metadata";
import { LandingFrame } from "@/components/landing/LandingFrame";
import { Words, type Piece } from "@/components/landing/Words";
import "./challenge.css";

export const metadata: Metadata = pageMetadata({
  title: "The challenge",
  description: "The NASA Space Apps Challenge 2026: Planet X and SPHEREx. What the challenge asks for, and a hands-on way to feel the idea behind it.",
  path: "/challenge",
});

interface Block {
  id: string;
  n: string;
  kicker: string;
  title: Piece[];
  paragraphs: string[];
  link: { href: string; label: string };
}

const BLOCKS: Block[] = [
  {
    id: "observe",
    n: "01",
    kicker: "Meet the mission",
    title: ["Look a little", "br", { em: "closer." }],
    paragraphs: [
      "Some of the universe’s most interesting clues lie beyond the light our eyes can see.",
      "NASA’s SPHEREx observes the whole sky in 102 infrared wavelengths, offering a richer way to explore the objects and material that fill it.",
    ],
    link: { href: "https://www.jpl.nasa.gov/news/nasas-spherex-observatory-completes-first-cosmic-map-like-no-other/", label: "Explore the mission at NASA JPL ↗" },
  },
  {
    id: "orbit",
    n: "02",
    kicker: "A shift in perspective",
    title: ["The clue is", "br", { em: "in the change." }],
    paragraphs: [
      "One observation captures a moment. Comparing observations offers a way to notice what has shifted.",
      "The Planet X and SPHEREx challenge asks for an accessible web tool that lets people explore sky observations and compare them over time.",
    ],
    link: { href: "https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/", label: "Read the challenge ↗" },
  },
  {
    id: "wonder",
    n: "03",
    kicker: "Beyond the familiar",
    title: ["Leave room", "br", { em: "for wonder." }],
    paragraphs: [
      "Planet X remains a possibility to investigate, rather than a confirmed discovery.",
      "A changing point of light invites a closer look. Making observations easier to inspect is a starting point; evidence is what comes next.",
    ],
    link: { href: "https://science.nasa.gov/solar-system/planet-x/", label: "The science behind Planet X ↗" },
  },
];

export default function ChallengePage() {
  return (
    <LandingFrame page="challenge">
      <section className="journey-introduction challenge-intro" aria-labelledby="challenge-title">
        <p className="field-label">NASA Space Apps Challenge / 2026</p>
        <h1 id="challenge-title" className="words">
          <Words pieces={["Planet X", "br", "& SPHEREx"]} />
        </h1>
        <p className="challenge-lede">
          A sky full of observations. A chance to see what changes. The challenge is to create a public web tool that makes SPHEREx sky observations easy for anyone to explore and compare over time.
        </p>
        <a className="chapter-source challenge-official" href="https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/" target="_blank" rel="noopener noreferrer">
          Read the official challenge ↗
        </a>
      </section>
      <div className="ch-columns">
        {BLOCKS.map((b) => (
          <section className="ch-block" id={`chapter-${b.id}`} aria-labelledby={`${b.id}-title`} tabIndex={-1} key={b.id}>
            <div className="ch-copy">
              <div className="chapter-read">
                <p className="chapter-kicker">
                  <span>{b.n}</span> {b.kicker}
                </p>
                <h2 id={`${b.id}-title`} className="words">
                  <Words pieces={b.title} />
                </h2>
                {b.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                <a className="chapter-source" href={b.link.href} target="_blank" rel="noopener noreferrer">
                  {b.link.label}
                </a>
              </div>
            </div>
          </section>
        ))}
      </div>
    </LandingFrame>
  );
}
