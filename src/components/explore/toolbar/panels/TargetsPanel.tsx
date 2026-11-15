"use client";

import React, { useState } from "react";
import { useExplore } from "../ExploreContext";
import { resolveActiveTarget, type ResolveResult } from "@/lib/explore/resolveTarget";

/**
 * The five required test targets. Only names are listed here: positions and proper motions come from SIMBAD
 * at run time (never typed in), and WISE 0855 is checked against the NASA-supplied position by the API.
 */
const TARGETS = [
  { id: "barnard", name: "Barnard's Star", query: "Barnard's star", about: "red dwarf with the fastest motion across the sky, about 10.4 arcsec a year" },
  { id: "eps_ind_b", name: "Epsilon Indi B", query: "eps Ind B", about: "brown dwarf, a failed star, in a pair" },
  { id: "wise0855", name: "WISE 0855", query: "WISE 0855-0714", about: "one of the coldest known brown dwarfs, moves very fast" },
  { id: "rw_aur", name: "RW Aurigae", query: "RW Aur", about: "young star whose brightness changes" },
  { id: "r_dra", name: "R Draconis", query: "R Dra", about: "pulsating red giant, brightness changes over months" },
];

type Step = "idle" | "running" | "pass" | "fail";

interface Row {
  status: Step;
  resolved?: ResolveResult;
  frames?: number;
  onDetector?: number;
  releases?: string;
  error?: string;
}

export function TargetsPanel() {
  const { flyTo, setActiveTarget, setDockOpen, setActivePanel } = useExplore();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);

  const patch = (id: string, r: Row) => setRows((p) => ({ ...p, [id]: r }));

  // Resolve the name (SIMBAD) and ask the archive which real exposures cover it.
  const test = async (id: string) => {
    const t = TARGETS.find((x) => x.id === id)!;
    patch(id, { status: "running" });
    try {
      const resolved = await resolveActiveTarget(t.query);
      const r = await fetch(`/api/observations?ra=${resolved.ra}&dec=${resolved.dec}&radius=0.05`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "The archive is busy");
      const list: { on_detector?: boolean }[] = d.observations ?? [];
      patch(id, {
        status: "pass",
        resolved,
        frames: list.length,
        onDetector: list.filter((o) => o.on_detector !== false).length,
        releases: (d.collections ?? []).filter((c: { ok: boolean }) => c.ok).map((c: { release: string }) => c.release).join(", "),
      });
      return resolved;
    } catch (e) {
      patch(id, { status: "fail", error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  };

  const open = async (id: string) => {
    const t = TARGETS.find((x) => x.id === id)!;
    patch(id, { ...(rows[id] ?? {}), status: "running" });
    try {
      const resolved = rows[id]?.resolved ?? (await resolveActiveTarget(t.query));
      setActiveTarget(resolved);
      setDockOpen(true);
      setActivePanel(null);
      flyTo(resolved.ra, resolved.dec, 30.0);
      patch(id, { ...(rows[id] ?? {}), status: rows[id]?.frames != null ? "pass" : "idle", resolved });
    } catch (e) {
      patch(id, { status: "fail", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const runAll = async () => {
    setBusy(true);
    for (const t of TARGETS) await test(t.id);
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="p-2 bg-cream/5 border border-cream/15 rounded leading-relaxed text-cream/70">
        <span className="uppercase tracking-wider text-cream">Test targets:</span> not discoveries. Positions and motions are looked up
        in SIMBAD when you press a button, then moved to the date of observation. Press <span className="text-cream">Open</span> to see the
        object over time in the dock at the bottom left.
      </div>

      <div className="flex justify-between items-center">
        <span className="text-cream/50 uppercase tracking-wider">Five required targets</span>
        <button
          type="button"
          onClick={runAll}
          disabled={busy}
          className="px-2.5 py-1 bg-blue text-cream uppercase tracking-wider rounded hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? "Checking the archive..." : "Check all in the archive"}
        </button>
      </div>

      <div className="space-y-2">
        {TARGETS.map((t) => {
          const row = rows[t.id];
          return (
            <div key={t.id} className="p-2.5 bg-ink border border-cream/15 rounded space-y-1.5">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="text-cream uppercase tracking-wider">{t.name}</div>
                  <div className="text-cream/50">{t.about}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => open(t.id)}
                    className="px-2 py-0.5 bg-blue text-cream hover:opacity-90 rounded uppercase tracking-wider transition-opacity"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => test(t.id)}
                    disabled={row?.status === "running"}
                    className="px-2 py-0.5 border border-cream/25 hover:border-cream/50 text-cream/80 hover:text-cream rounded uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    {row?.status === "running" ? "..." : "Check"}
                  </button>
                </div>
              </div>

              {row?.status === "fail" && (
                <div role="alert" className="border border-blue rounded p-1.5 text-cream leading-relaxed">
                  Could not finish: {row.error}. Try again in a moment.
                </div>
              )}

              {row?.resolved && (
                <div className="font-mono text-cream/70 bg-cream/5 p-1.5 rounded leading-relaxed">
                  <div>
                    RA {row.resolved.ra.toFixed(5)}°, Dec {row.resolved.dec.toFixed(5)}° on 2026.0
                  </div>
                  <div className="text-cream/50">
                    Found by {row.resolved.resolvedBy}. Motion {row.resolved.pmra.toFixed(1)}, {row.resolved.pmdec.toFixed(1)} milli-arcsec a year.
                    {row.resolved.nasaReference &&
                      ` Matches the NASA position at epoch ${row.resolved.nasaReference.derived_epoch.toFixed(2)} to ${row.resolved.nasaReference.residual_arcsec_after_propagation.toFixed(1)} arcsec.`}
                  </div>
                </div>
              )}

              {row?.frames != null && (
                <div className="font-mono text-cream/70">
                  {row.frames} real exposures found ({row.releases}); {row.onDetector} with the object on the detector.
                  {row.onDetector === 0 && " The archive answered, and no frame has this object on the detector yet."}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
