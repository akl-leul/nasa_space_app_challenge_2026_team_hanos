import Link from "next/link";

/** The first screen: organic blobs, the title, the "sky map" button, the challenge reveal and the sparkles. */
export function Hero() {
  return (
    <section className="universe" id="universe" aria-label="Explore the space" tabIndex={-1}>
      <svg className="blobscape" viewBox="0 0 1600 1300" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-40 280C40 270 65 355 41 415C18 454-6 469-20 519Z" />
        <path d="M48 470C31 410 125 350 158 276C194 204 255 170 319 188C382 204 414 235 383 285C363 319 326 343 323 385C318 422 350 476 337 528C324 581 273 604 231 622C167 649 83 638 55 582C43 552 40 516 48 470Z" />
        <path d="M1118 277C1099 198 1150 166 1205 151C1266 127 1294 166 1357 124C1414 81 1458 83 1515 96C1564 105 1600 72 1652 89L1670 399C1614 437 1537 447 1485 425C1425 399 1380 447 1313 435C1243 424 1262 367 1201 346C1168 331 1136 323 1118 277Z" />
        <path className="flow-blob-left" d="M-48 682C22 616 84 659 158 682C225 702 233 708 292 735C339 758 404 777 427 816C460 873 392 887 406 937C395 989 472 1030 420 1080C360 1140 255 1090 180 1135C105 1173 60 1122-48 1153Z" />
        <path className="flow-blob-right" d="M1103 1035C1108 964 1192 942 1251 913C1304 884 1328 834 1377 799C1450 739 1491 777 1566 751C1601 737 1612 722 1650 713L1677 1134C1581 1183 1552 1111 1465 1130C1370 1151 1334 1079 1244 1100C1164 1119 1113 1096 1103 1035Z" />
        <path className="flow-blob-mobile" d="M-48 682C22 616 84 659 158 682C225 702 233 708 292 735C339 758 404 777 427 816C460 873 392 887 406 937C395 989 430 1018 395 1040C365 1060 300 1025 245 1050C160 1080 68 1030-48 1060Z" />
        <path className="flow-blob-mobile" d="M1103 1035C1108 964 1192 942 1251 913C1304 884 1328 834 1377 799C1450 739 1491 777 1566 751C1601 737 1612 722 1650 713L1677 1060C1580 1100 1530 1040 1450 1060C1370 1090 1300 1020 1225 1050C1160 1070 1113 1070 1103 1035Z" />
      </svg>
      <div className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">
            <span>EXPLORE</span>
            <span>THE SPACE</span>
          </h1>
          <p className="hero-subtitle">
            A changing sky. A different perspective.
            <br /> A universe of questions.
          </p>
          <p className="byline">
            Team Hanos <span>Planet X &amp; SPHEREx / 2026</span>
          </p>
          <Link href="/explore" prefetch={false} className="hero-explore-btn" id="hero-explore-btn">
            <span>SKY MAP</span>
          </Link>
        </div>
      </div>
      <button className="mystery-trigger" type="button" aria-label="Read the challenge: Planet X and SPHEREx" aria-expanded="false" aria-controls="mystery-panel">
        <span className="trigger-caption">A little curiosity?</span>
        <span className="trigger-arrow" aria-hidden="true">↗</span>
      </button>
      <div className="reveal-surface" id="mystery-panel" role="dialog" aria-labelledby="mystery-title" aria-hidden="true" inert>
        <div className="story-content">
          <p className="story-eyebrow">NASA Space Apps Challenge / 2026</p>
          <h2 id="mystery-title" tabIndex={-1}>
            Planet X<br />&amp; SPHEREx
          </h2>
          <p className="story-paragraph">
            A sky full of observations. A chance to see what changes. The challenge is to create a public web tool that makes SPHEREx sky observations easy for anyone to explore and compare over time.
          </p>
          <a className="story-source" href="https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/" target="_blank" rel="noopener noreferrer">
            Read the official challenge ↗
          </a>
          <Link className="story-source story-full" href="/challenge">
            Read the full challenge →
          </Link>
          <button className="story-back" type="button">
            <span aria-hidden="true">←</span> Back to exploring
          </button>
        </div>
        <button className="close-story" type="button" aria-label="Close challenge">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="illustrations" aria-hidden="true">
        <span className="sparkle star-one"></span>
        <span className="sparkle star-two"></span>
        <span className="sparkle star-three"></span>
        <span className="sparkle star-four"></span>
        <span className="sparkle star-five"></span>
        <span className="sparkle star-six"></span>
        <span className="sparkle star-seven"></span>
      </div>
      <a className="scroll-invitation" href="#journey">
        <span>Scroll into the unknown</span>
        <span className="scroll-line" aria-hidden="true">↓</span>
      </a>
    </section>
  );
}
