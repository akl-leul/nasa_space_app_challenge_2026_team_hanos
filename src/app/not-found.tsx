import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Shown for any address that does not exist. Plain, fast and with a way back. */
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center bg-cream text-ink">
      <p className="tracking-[0.2em] uppercase text-[11px]">Error 404</p>
      <h1 className="text-3xl tracking-tight">This part of the sky is empty.</h1>
      <p className="max-w-md leading-relaxed text-ink/70">The page you asked for does not exist, or it moved. The explorer and the home page are one click away.</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="px-5 py-2.5 bg-ink text-cream rounded-sm hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
          Home
        </Link>
        <Link href="/explore" className="px-5 py-2.5 border border-ink rounded-sm hover:bg-ink hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
          Open the Sky Explorer
        </Link>
      </div>
    </main>
  );
}
