"use client";

/**
 * Last-resort screen when the root layout itself fails. It replaces the whole document, so it cannot use the
 * stylesheet: the three brand colours (cream #F5F3ED, ink #111111, blue #1F48FF) are repeated inline on purpose.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#F5F3ED", color: "#111111", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <p style={{ letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 11, margin: 0 }}>Something went wrong</p>
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0 }}>The sky flickered.</h1>
          <p style={{ maxWidth: 420, lineHeight: 1.6, margin: 0, opacity: 0.7 }}>HANOS hit an unexpected problem. Nothing is stored about you. Try again.</p>
          <button type="button" onClick={reset} style={{ padding: "10px 20px", background: "#1F48FF", color: "#F5F3ED", border: 0, borderRadius: 2, cursor: "pointer", fontSize: 14 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
