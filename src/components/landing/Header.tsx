import Link from "next/link";

/** The wordmark, the four links, the mobile menu button and the day/night switch. */
export function Header({ page }: { page: "home" | "challenge" }) {
  const home = page === "home";
  return (
    <header className="site-header">
      {home ? (
        <a className="brand" href="#universe" aria-label="Hanos home">
          <Brand />
        </a>
      ) : (
        <Link className="brand" href="/" aria-label="Hanos home">
          <Brand />
        </Link>
      )}
      <button className="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="navigation">
        <span></span>
        <span></span>
      </button>
      <nav id="navigation" aria-label="Main navigation">
        {home ? (
          <>
            <Link href="/challenge">The challenge</Link>
            <a href="#chapter-member-1" data-journey-nav>The team</a>
            <a href="#project" data-journey-nav>Our project</a>
            <a href="#resources" data-journey-nav>Resources</a>
          </>
        ) : (
          <>
            <Link href="/challenge" aria-current="page">The challenge</Link>
            <Link href="/#chapter-member-1">The team</Link>
            <Link href="/#project">Our project</Link>
            <Link href="/#resources">Resources</Link>
          </>
        )}
      </nav>
      <button className="theme-toggle" type="button" aria-pressed="false" aria-label="Switch to night mode">
        <svg className="icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z" fill="currentColor" />
        </svg>
        <svg className="icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" />
          </g>
        </svg>
      </button>
    </header>
  );
}

function Brand() {
  return (
    <>
      <span className="brand-symbol">
        {/* A pre-optimised lossless WebP with its own dimensions: served as is, not re-encoded by next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/hanos-logo.webp" alt="Hanos emblem" width={442} height={507} fetchPriority="high" />
      </span>
      <span className="brand-word">HANOS</span>
    </>
  );
}
