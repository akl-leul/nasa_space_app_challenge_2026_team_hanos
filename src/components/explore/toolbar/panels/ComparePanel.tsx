"use client";

import React, { useState, useEffect } from "react";
import { useExplore } from "../ExploreContext";

type CompareMode = "blink" | "side_by_side" | "subtract" | "add" | "reverse_subtract";

interface DiffInfo {
  label: string;
  wavelength_matched: boolean;
  warning: string | null;
  frame_a: { date: string; detector: number; wavelength_um: number };
  frame_b: { date: string; detector: number; wavelength_um: number };
  noise_sigma_MJy_sr: number;
  note: string;
}

const SIZE_DEG = 0.1;

/** Compare two real exposures of the same field. Both are aligned on the sky; nothing is simulated. */
export function ComparePanel() {
  const { viewCenter, activeTarget, observations, selectedPair, setSelectedPair } = useExplore();

  const [mode, setMode] = useState<CompareMode>("blink");
  const [blinkState, setBlinkState] = useState<"A" | "B">("A");
  const [blinkSpeedMs, setBlinkSpeedMs] = useState(500);
  const [blinking, setBlinking] = useState(false); // off by default: flashing can bother some people
  const [diff, setDiff] = useState<DiffInfo | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  const ra = activeTarget?.ra ?? viewCenter.ra;
  const dec = activeTarget?.dec ?? viewCenter.dec;
  const frameA = observations[selectedPair[0]] || null;
  const frameB = observations[selectedPair[1]] || null;
  const arith = mode === "add" || mode === "reverse_subtract" || mode === "subtract";
  const arithMode = mode === "add" ? "add" : mode === "reverse_subtract" ? "reverse_subtract" : "subtract";

  useEffect(() => {
    if (mode !== "blink" || !blinking) return;
    const t = setInterval(() => setBlinkState((p) => (p === "A" ? "B" : "A")), blinkSpeedMs);
    return () => clearInterval(t);
  }, [mode, blinking, blinkSpeedMs]);

  const diffKey = `${frameA?.access_url}|${frameB?.access_url}|${arithMode}|${arith}|${ra}|${dec}`;
  const [prevDiffKey, setPrevDiffKey] = useState(diffKey);
  if (prevDiffKey !== diffKey) {
    setPrevDiffKey(diffKey);
    setDiff(null);
    setDiffError(null);
  }

  useEffect(() => {
    if (!frameA || !frameB || !arith) return;
    let live = true;
    (async () => {
      try {
        const r = await fetch(
          `/api/difference?a=${encodeURIComponent(frameA.access_url)}&b=${encodeURIComponent(frameB.access_url)}&ra=${ra}&dec=${dec}&size=${SIZE_DEG}&mode=${arithMode}&format=json`
        );
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.detail || "The archive is busy.");
        if (live) setDiff(d as DiffInfo);
      } catch (e) {
        if (live) setDiffError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [frameA, frameB, arith, arithMode, ra, dec]);

  const matched =
    frameA && frameB
      ? frameA.detector === frameB.detector &&
        Math.abs((frameA.wavelength_um ?? 0) - (frameB.wavelength_um ?? 0)) / (frameA.wavelength_um || 1) < 0.03
      : true;

  // best pair for real change: same detector, same wavelength (within 2%), as far apart in time as possible
  const matchedPair = (() => {
    let best: [number, number] | null = null;
    let gap = 0;
    for (let i = 0; i < observations.length; i++) {
      const a = observations[i];
      if (!a.wavelength_um || a.mjd_start == null) continue;
      for (let j = i + 1; j < observations.length; j++) {
        const b = observations[j];
        if (b.detector !== a.detector || !b.wavelength_um || b.mjd_start == null) continue;
        if (Math.abs(a.wavelength_um - b.wavelength_um) / a.wavelength_um > 0.02) continue;
        const g = Math.abs(a.mjd_start - b.mjd_start);
        if (g > gap) {
          gap = g;
          best = a.mjd_start <= b.mjd_start ? [i, j] : [j, i];
        }
      }
    }
    return best ? { pair: best, days: Math.round(gap) } : null;
  })();

  const png = (f: typeof frameA) =>
    f ? `/api/frame.png?url=${encodeURIComponent(f.access_url)}&ra=${ra}&dec=${dec}&size=${SIZE_DEG}` : null;
  const urlA = png(frameA);
  const urlB = png(frameB);
  const diffUrl =
    frameA && frameB && arith
      ? `/api/difference?a=${encodeURIComponent(frameA.access_url)}&b=${encodeURIComponent(frameB.access_url)}&ra=${ra}&dec=${dec}&size=${SIZE_DEG}&mode=${arithMode}&format=png`
      : null;

  const modeButtons: { id: CompareMode; label: string }[] = [
    { id: "blink", label: "Blink" },
    { id: "side_by_side", label: "Split" },
    { id: "subtract", label: "A − B" },
    { id: "add", label: "A + B" },
    { id: "reverse_subtract", label: "B − A" },
  ];

  const optionLabel = (o: (typeof observations)[number]) =>
    `${o.date_utc?.slice(0, 10)} · D${o.detector} · ${o.wavelength_um?.toFixed(2)} micron`;

  if (observations.length < 2) {
    return (
      <div className="p-3 border border-dashed border-cream/15 rounded text-cream/60 leading-relaxed">
        Open the Observations panel first. It loads the real exposures for the selected object, and you then choose
        frame A and frame B here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-1 uppercase tracking-wider">
        {modeButtons.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`py-1 rounded border text-center transition-colors ${
              mode === m.id ? "bg-blue text-cream border-blue" : "border-cream/20 text-cream/70 hover:border-cream/40 hover:text-cream"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([0, 1] as const).map((k) => (
          <div key={k}>
            <span className="text-cream/50 uppercase">Frame {k === 0 ? "A" : "B"}</span>
            <select
              value={selectedPair[k]}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setSelectedPair(k === 0 ? [v, selectedPair[1]] : [selectedPair[0], v]);
              }}
              className="w-full mt-1 bg-ink border border-cream/20 rounded p-1 text-cream font-mono"
            >
              {observations.map((o, idx) => (
                <option key={o.plane_id + idx} value={idx}>
                  {optionLabel(o)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {matchedPair && !(selectedPair[0] === matchedPair.pair[0] && selectedPair[1] === matchedPair.pair[1]) && (
        <button
          type="button"
          onClick={() => setSelectedPair(matchedPair.pair)}
          className="w-full py-1.5 border border-blue rounded uppercase tracking-wider text-cream hover:bg-blue/20 transition-colors"
        >
          Choose the best pair: same wavelength, {matchedPair.days} days apart
        </button>
      )}

      {!matched && (
        <div className="p-2 bg-cream/5 border border-cream/20 rounded text-cream/70 leading-relaxed">
          <span className="text-cream uppercase tracking-wider">Careful:</span> these two frames see different
          wavelengths ({frameA?.wavelength_um?.toFixed(2)} and {frameB?.wavelength_um?.toFixed(2)} micron). A difference
          can come from the colour of the objects, not from change over time. Pick two frames at the same wavelength to
          see real change.
        </div>
      )}

      <div className="aspect-square w-full bg-ink border border-cream/20 rounded overflow-hidden flex items-center justify-center relative">
        {mode === "blink" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={(blinkState === "A" ? urlA : urlB) || ""} alt={`Frame ${blinkState}`} className="w-full h-full object-contain image-pixelated" />
            <div className="absolute top-1.5 left-1.5 bg-ink/90 border border-cream/20 rounded px-1.5 py-0.5 font-mono text-cream">
              Frame {blinkState}: {(blinkState === "A" ? frameA : frameB)?.date_utc?.slice(0, 10)}
            </div>
          </>
        ) : mode === "side_by_side" ? (
          <div className="grid grid-cols-2 w-full h-full divide-x divide-cream/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlA || ""} alt="Frame A" className="w-full h-full object-contain image-pixelated" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlB || ""} alt="Frame B" className="w-full h-full object-contain image-pixelated" />
          </div>
        ) : (
          diffUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={diffUrl} alt="Difference image" className="w-full h-full object-contain image-pixelated" />
          )
        )}
      </div>

      {diffError && (
        <div role="alert" className="p-2 border border-blue rounded text-cream leading-relaxed">
          {diffError}
        </div>
      )}

      {diff && (
        <div className="p-2 bg-cream/5 border border-cream/10 rounded font-mono text-cream/70 space-y-1 leading-relaxed">
          <div className="text-cream uppercase tracking-wider">{diff.label} · background removed, aligned on the sky</div>
          <div>Noise level of this difference: {diff.noise_sigma_MJy_sr} MJy/sr</div>
          <div className="font-sans text-cream/60">{diff.note} A difference is not proof of change: it can also come from wavelength, beam shape, alignment or detector artefacts.</div>
        </div>
      )}

      {mode === "blink" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBlinking((b) => !b)}
              className="px-2 py-1 border border-cream/30 rounded uppercase hover:border-cream"
            >
              {blinking ? "Pause blink" : "Start blink"}
            </button>
            <button
              type="button"
              onClick={() => {
                setBlinking(false);
                setBlinkState((p) => (p === "A" ? "B" : "A"));
              }}
              className="px-2 py-1 border border-cream/30 rounded uppercase hover:border-cream"
            >
              Step A / B
            </button>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-cream/50 uppercase">Interval (at most 3 flashes a second)</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="333"
                max="1500"
                step="50"
                value={blinkSpeedMs}
                onChange={(e) => setBlinkSpeedMs(parseInt(e.target.value))}
                className="w-24 accent-blue"
                aria-label="Blink interval in milliseconds"
              />
              <span className="font-mono text-cream">{blinkSpeedMs} ms</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
