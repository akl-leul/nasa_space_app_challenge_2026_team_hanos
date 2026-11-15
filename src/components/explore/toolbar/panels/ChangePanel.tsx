"use client";

import React from "react";
import { useExplore } from "../ExploreContext";
import { useTrack } from "../../dock/useTrack";

/**
 * Change over time for the selected object: motion and brightness measured on real single exposures
 * (the same measurement the time-lapse dock uses). Claim levels: observed change, then candidate. Never "discovery".
 */
export function ChangePanel() {
  const { activeTarget, trackDetector, setTrackDetector } = useExplore();
  const { snap, error, retry } = useTrack(activeTarget, trackDetector);

  if (!activeTarget) {
    return (
      <div className="p-3 border border-dashed border-cream/15 rounded text-cream/60 leading-relaxed">
        Choose an object first: search for a name, press Open on a test target, or click a star in the sky. Change is
        measured for that object on real exposures.
      </div>
    );
  }

  // the card is only meaningful once every frame is measured; a partial result must not read as "no change"
  const card = snap?.status === "done" ? snap.evidence_card : undefined;
  const rows = snap?.light_curve ?? [];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-cream/50 uppercase tracking-wider">Change in</div>
        <div className="text-cream">{activeTarget.name}</div>
      </div>

      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setTrackDetector(d)}
            className={`flex-1 py-1 rounded border uppercase ${trackDetector === d ? "bg-blue text-cream border-blue" : "border-cream/20 text-cream/70 hover:border-cream/40"}`}
          >
            D{d}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="p-2 border border-blue rounded text-cream leading-relaxed">
          {error}{" "}
          <button type="button" onClick={retry} className="underline">
            Try again
          </button>
        </div>
      )}

      {!snap && !error && <div className="text-cream/60">Asking the archive for real frames...</div>}

      {snap && (snap.status === "starting" || snap.status === "running") && (
        <div className="text-cream/60" aria-live="polite">
          Measuring frames: {snap.done} of {snap.total || "..."}. The evidence card appears when every frame is measured.
        </div>
      )}

      {snap && (
        <>
          {card && (
            <div className="p-2.5 bg-cream/5 border border-cream/20 rounded space-y-2">
              <div className="flex justify-between items-center border-b border-cream/10 pb-1">
                <span className="text-cream uppercase tracking-wider">Evidence card</span>
                <span className="px-1.5 py-0.5 rounded uppercase tracking-wider border border-blue text-cream">{card.claim_level}</span>
              </div>
              <div className="text-cream/80 leading-relaxed">{card.summary}</div>
              <div className="pt-1.5 border-t border-cream/10 space-y-1">
                <div className="text-cream/50 uppercase">Checks performed</div>
                <ul className="space-y-0.5 text-cream/70 leading-relaxed">
                  {card.checks_performed.map((c, i) => (
                    <li key={i}>
                      <span className="text-cream">{c.check}:</span> {c.result}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-cream/50 leading-relaxed">{card.reminder}</div>
            </div>
          )}

          <div>
            <div className="text-cream/50 uppercase tracking-wider mb-1.5">Measurements ({rows.length} frames)</div>
            {rows.length === 0 ? (
              <div className="p-2 border border-dashed border-cream/20 rounded text-cream/60 leading-relaxed">
                No usable measurement yet for detector {trackDetector}. {snap.status === "done" ? "The archive answered; the object is not measurable in these frames." : ""}
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-cream/15 rounded">
                <table className="w-full text-left font-mono divide-y divide-cream/10">
                  <thead className="bg-ink text-cream/60 sticky top-0">
                    <tr>
                      <th className="p-1">Date</th>
                      <th className="p-1">Micron</th>
                      <th className="p-1">Flux (microjansky)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream/10 text-cream/80">
                    {rows.map((r) => (
                      <tr key={r.index}>
                        <td className="p-1">{r.date_utc.slice(0, 10)}</td>
                        <td className="p-1">{r.wavelength_um.toFixed(2)}</td>
                        <td className="p-1">
                          {r.is_lower_limit ? "> " : ""}
                          {r.flux_ujy.toFixed(1)} ± {r.flux_error_ujy.toFixed(1)}
                          {!r.detected ? " (not detected)" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
