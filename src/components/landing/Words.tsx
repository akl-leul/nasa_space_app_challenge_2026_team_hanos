import { Fragment, type CSSProperties, type ReactNode } from "react";

/** A headline is a list of pieces: plain text, a line break, or italic text. */
export type Piece = string | "br" | { em: string };

/**
 * Splits a headline into one span per word, on the server, so the words can rise in one by one as the headline
 * scrolls into view (landing.css and motion.ts) without waiting for JavaScript to cut the text up.
 * The output is the same markup the reference page built in the browser.
 */
export function Words({ pieces }: { pieces: readonly Piece[] }): ReactNode {
  let index = 0;
  const words = (text: string): ReactNode[] => {
    const out: ReactNode[] = [];
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        out.push(" ");
        continue;
      }
      const i = index++;
      out.push(
        <span key={i} className="w" style={{ "--i": i } as CSSProperties}>
          {part}
        </span>
      );
    }
    return out;
  };

  return pieces.map((piece, n) => {
    if (piece === "br") return <br key={n} />;
    if (typeof piece === "string") return <Fragment key={n}>{words(piece)}</Fragment>;
    return <em key={n}>{words(piece.em)}</em>;
  });
}
