"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Catches an error in a page and offers a retry, instead of a blank screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // browsers report this to the console only; no user data is sent anywhere
    console.error(error);
  }, [error]);
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center bg-cream text-ink">
      <p className="tracking-[0.2em] uppercase text-[11px]">Something went wrong</p>
      <h1 className="text-3xl tracking-tight">The sky flickered.</h1>
      <p className="max-w-md leading-relaxed text-ink/70">This page hit an unexpected problem. Your data is safe: nothing is stored about you. Try again, or go back home.</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="px-5 py-2.5 bg-ink text-cream rounded-sm hover:opacity-85 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
          Try again
        </button>
        <Link href="/" className="px-5 py-2.5 border border-ink rounded-sm hover:bg-ink hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
          Home
        </Link>
      </div>
    </main>
  );
}
