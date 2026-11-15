"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDecSexagesimal, formatRaSexagesimal } from "@/lib/astro/coordinates";
import type { SkySelection } from "@/types/sky";
import { useExplore } from "../toolbar/ExploreContext";
import { Timeline } from "./Timeline";
import { useTrack, type TrackFrame, type TrackSnapshot } from "./useTrack";
import { CircleChevronsRight, CircleChevronsLeft } from "lucide-react";
/** Documented band table (SPHEREx Archive at IRSA User Guide). */
const BANDS: Record<number, [number, number]> = {
  1: [0.75, 1.09], 2: [1.1, 1.62], 3: [1.63, 2.41], 4: [2.42, 3.82], 5: [3.83, 4.41], 6: [4.42, 5.0],
};
const SPEEDS = [500, 1000, 2000]; // ms per frame: at most 2 frames per second (photosensitivity rule)

function wavelengthWords(um: number): string {
  return `${um.toFixed(2)} micron, ${(um / 0.65).toFixed(1)} times the wavelength of red light`;
}

function verdict(s: TrackSnapshot): { headline: string; detail: string } {
  const m = s.motion;
  if (s.status !== "done") {
    return { headline: `Measuring frames: ${s.done} of ${s.total || "..."}`, detail: "Real SPHEREx images are being downloaded and measured. The first ones can be played already." };
  }
  if (m.status === "measured" && (m.pm_total_sigma ?? 0) >= 5) {
    const mv = (m.pm_total_mas_yr ?? 0) / 1000;
    const ex = Math.hypot(...(m.expected_pm_mas_yr ?? [0, 0])) / 1000;
    const match = ex > 0.05 ? ((m.difference_from_expected_sigma ?? 9) < 3 ? ` It matches the known motion of ${ex.toFixed(2)} arcsec per year.` : ` The known motion is ${ex.toFixed(2)} arcsec per year, which differs.`) : "";
    return { headline: `It moves ${mv.toFixed(2)} arcsec per year`, detail: `Measured over ${m.time_span_years?.toFixed(2)} years from ${m.detected_frames} frames (${m.pm_total_sigma?.toFixed(0)} sigma).${match}` };
  }
  if (m.status === "not_detected") return { headline: "Too faint to follow in single frames here", detail: m.explanation ?? "" };
  if (m.status === "measured") return { headline: "No significant motion measured", detail: `${m.pm_total_sigma?.toFixed(1)} sigma over ${m.time_span_years?.toFixed(2)} years.` };
  return { headline: "Not enough measurements yet", detail: m.explanation ?? "" };
}

function brightnessWords(s: TrackSnapshot): string {
  const b = s.brightness;
  if (s.status !== "done") return "Brightness is tested when all frames are measured.";
  if (b.status === "saturated") return "Very bright: the centre saturates the detector, so each flux is a lower limit and brightness change is not tested.";
  const v = b.variable_bins ?? [];
  if (v.length) {
    const t = [...v].sort((a, c) => c.chi2_reduced - a.chi2_reduced)[0];
    return `Brightness differs between visits at ${t.wavelength_um.toFixed(2)} micron (about ${t.peak_to_peak_percent}% peak to peak). A candidate change that needs verification.`;
  }
  if (b.status === "tested") return "No brightness change found between visits at the same wavelength.";
  return b.explanation ?? "Not enough visits at the same wavelength to test brightness.";
}

/** Each dot is one exposure: wavelength across, flux up. Visits at the same wavelength that differ show a change. */
function SpectrumDots({ snap, detector, currentIndex }: { snap: TrackSnapshot; detector: number; currentIndex: number }) {
  const pts = snap.light_curve.filter((p) => p.flux_ujy > 0);
  if (pts.length < 3) return null;
  const [lo, hi] = BANDS[detector];
  const ys = pts.map((p) => Math.log10(p.flux_ujy));
  const y0 = Math.min(...ys) - 0.15, y1 = Math.max(...ys) + 0.15;
  const X = (w: number) => 8 + ((w - lo) / (hi - lo)) * 304;
  const Y = (f: number) => 78 - ((Math.log10(f) - y0) / (y1 - y0 || 1)) * 68;
  const yr0 = Math.min(...pts.map((p) => p.decimal_year)), yr1 = Math.max(...pts.map((p) => p.decimal_year));
  return (
    <svg viewBox="0 0 320 92" className="w-full h-auto" role="img"
      aria-label={`Flux against wavelength for ${pts.length} exposures of detector ${detector}`}>
      <line x1="8" y1="78" x2="312" y2="78" stroke="currentColor" strokeOpacity="0.35" />
      {pts.map((p) => {
        const age = yr1 > yr0 ? (p.decimal_year - yr0) / (yr1 - yr0) : 0;
        const cur = p.index === currentIndex;
        return p.is_lower_limit ? (
          <path key={p.index} d={`M${X(p.wavelength_um)} ${Y(p.flux_ujy) - 3} l3 6 h-6 z`} fill="none"
            className={cur ? "stroke-blue" : "stroke-cream"} strokeOpacity={cur ? 1 : 0.35 + 0.65 * age} />
        ) : (
          <circle key={p.index} cx={X(p.wavelength_um)} cy={Y(p.flux_ujy)} r={cur ? 3.6 : 2}
            className={cur ? "fill-blue stroke-cream" : "fill-cream"} fillOpacity={cur ? 1 : 0.3 + 0.7 * age} />
        );
      })}
      <text x="8" y="90" fill="currentColor" fillOpacity="0.6">{lo} micron</text>
      <text x="312" y="90" textAnchor="end" fill="currentColor" fillOpacity="0.6">{hi} micron</text>
    </svg>
  );
}

export function TimeLapseDock({
  selection,
  pinnedPoint,
  onClearPinnedPoint,
}: {
  selection: SkySelection | null;
  pinnedPoint: { ra: number; dec: number } | null;
  onClearPinnedPoint: () => void;
}) {
  const { activeTarget, trackDetector, setTrackDetector, dockOpen, setDockOpen, setActiveTarget, gaiaOverlay, wiseOverlay } = useExplore();
  const { snap, error, retry } = useTrack(activeTarget, trackDetector);
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[0]);
  const [invert, setInvert] = useState(false);
  const [restart, setRestart] = useState(false);
  const [imgFail, setImgFail] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const frames: TrackFrame[] = useMemo(
    () => (snap?.frames ?? []).filter((f) => f.status === "ok").sort((a, b) => a.mjd - b.mjd),
    [snap?.frames]
  );
  const safeIdx = Math.min(idx, Math.max(frames.length - 1, 0));
  const f = frames[safeIdx];

  // start again from the first frame when the object or the band changes (state adjusted during render, as React advises)
  const resetKey = `${activeTarget?.name}|${trackDetector}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setIdx(0);
  }
  const imgKey = f?.frame_png ?? "";
  const [prevImgKey, setPrevImgKey] = useState(imgKey);
  if (prevImgKey !== imgKey) {
    setPrevImgKey(imgKey);
    setImgFail(0);
  }

  // Catalogue overlays (real Gaia DR3 / AllWISE sources in the same field as the frames), only fetched when switched on
  interface CatSource { ra: number; dec: number; grid_x: number; grid_y: number }
  const [cats, setCats] = useState<{ key: string; gaia: CatSource[]; wise: CatSource[]; failed: string | null } | null>(null);
  const catKey = activeTarget ? `${activeTarget.ra}|${activeTarget.dec}|${activeTarget.epoch}` : "";
  const wantCats = (gaiaOverlay || wiseOverlay) && !!activeTarget && dockOpen;
  useEffect(() => {
    if (!wantCats || !activeTarget) return;
    let live = true;
    fetch(`/api/overlays?ra=${activeTarget.ra}&dec=${activeTarget.dec}&size=0.1&epoch=${activeTarget.epoch}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!live) return;
        if (!ok) throw new Error(d.detail || "busy");
        setCats({
          key: catKey,
          gaia: d.gaia.ok ? d.gaia.sources : [],
          wise: d.wise.ok ? d.wise.sources : [],
          failed: !d.gaia.ok || !d.wise.ok ? [!d.gaia.ok && "Gaia", !d.wise.ok && "AllWISE"].filter(Boolean).join(" and ") : null,
        });
      })
      .catch(() => live && setCats({ key: catKey, gaia: [], wise: [], failed: "Gaia and AllWISE" }));
    return () => {
      live = false;
    };
  }, [wantCats, catKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const catsHere = cats && cats.key === catKey ? cats : null;

  // Auto mode: advance one frame at a time (never faster than 2 per second)
  useEffect(() => {
    if (!auto || frames.length < 2) return;
    const t = setInterval(() => {
      setIdx((i) => {
        const n = (Math.min(i, frames.length - 1) + 1) % frames.length;
        if (n === 0) {
          setRestart(true);
          setTimeout(() => setRestart(false), 800);
        }
        return n;
      });
    }, speed);
    return () => clearInterval(t);
  }, [auto, speed, frames.length]);

  // Preload the next frames so playback does not stall
  useEffect(() => {
    for (let k = 1; k <= 3 && frames.length; k++) {
      const nxt = frames[(safeIdx + k) % frames.length]?.frame_png;
      if (nxt) new Image().src = invert ? `${nxt}&invert=true` : nxt;
    }
  }, [safeIdx, frames, invert]);

  if (!activeTarget && !pinnedPoint) return null;

  // object facts, plain language
  const facts: string[] = [];
  if (selection?.kind === "star") {
    facts.push(`Star, brightness magnitude ${selection.mag.toFixed(2)}`);
    if (selection.constellation) facts.push(`in ${selection.constellation.name}`);
  }
  if (selection?.kind === "region") {
    facts.push(`Constellation ${selection.abbr}`);
    if (selection.areaSqDeg) facts.push(`${Math.round(selection.areaSqDeg)} square degrees`);
  }
  if (selection?.kind === "object") {
    if (selection.category) facts.push(selection.category.toUpperCase());
    if (selection.constellation) facts.push(`in ${selection.constellation.name}`);
  }
  if (activeTarget?.detail) facts.push(activeTarget.detail);

  const v = snap ? verdict(snap) : null;
  const imgUrl = f?.frame_png ? (invert ? `${f.frame_png}&invert=true` : f.frame_png) : null;
  const W = snap?.grid.width_px ?? 117;
  const H = snap?.grid.height_px ?? 117;
  const trail = frames.slice(0, safeIdx + 1).filter((x) => x.measurement?.detected && x.position);
  const detectedHere = !!f?.measurement?.detected && !!f.position;

  // Object tracker labels and reticle coordinates
  const targetName = activeTarget?.name ?? "Target";
  const cleanName = targetName.replace(/^(NAME|\*|V\*)\s+/i, "").split(/[,(]/)[0].trim();
  const targetX = detectedHere ? f.position!.grid_x + 0.5 : f?.expected ? f.expected.grid_x + 0.5 : null;
  const targetY = detectedHere ? f.position!.grid_y + 0.5 : f?.expected ? f.expected.grid_y + 0.5 : null;
  const reticleRadius = 5.2;
  const isNearTop = targetY != null && targetY / H < 0.14;

  return (
    <section
      aria-label="Selected object over time"
      className="absolute left-2.5 bottom-9 z-20 w-[min(94vw,352px)] max-h-[calc(100dvh-110px)] overflow-y-auto bg-ink/95 border border-cream/20 rounded text-cream/90 p-3 space-y-2.5"
    >
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="uppercase tracking-widest text-cream truncate">{cleanName || "Pinned point"}</div>
          {activeTarget && (
            <div className="text-cream/60 tracking-wide">
              RA {formatRaSexagesimal(activeTarget.ra)} · Dec {formatDecSexagesimal(activeTarget.dec)} · J{activeTarget.epoch.toFixed(0)}
            </div>
          )}
          {facts.length > 0 && <div className="text-cream/60">{facts.join(" · ")}</div>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button type="button" onClick={() => setDockOpen(!dockOpen)} aria-expanded={dockOpen}
            className="px-2 py-0.5 border border-cream/20 hover:border-cream/50 rounded uppercase">
            {dockOpen ? "Hide" : "Show"}
          </button>
          {activeTarget && (
            <button type="button" aria-label="Close" onClick={() => setActiveTarget(null)}
              className="w-6 border border-cream/20 hover:border-cream/50 rounded">✕</button>
          )}
        </div>
      </div>

      {pinnedPoint && (
        <div className="flex items-center justify-between border border-cream/15 rounded px-2 py-1">
          <span>Pinned: RA {formatRaSexagesimal(pinnedPoint.ra)} · Dec {formatDecSexagesimal(pinnedPoint.dec)} (J2000)</span>
          <button type="button" onClick={onClearPinnedPoint} className="text-cream/60 hover:text-cream">clear</button>
        </div>
      )}

      {activeTarget && dockOpen && (
        <>
          {/* detector choice: frames of different detectors are never mixed */}
          <div className="flex items-center gap-1" role="group" aria-label="Detector array">
            <span className="text-cream/60 mr-1">Infrared band</span>
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <button key={d} type="button" onClick={() => setTrackDetector(d)} aria-pressed={trackDetector === d}
                title={`Detector ${d}: ${BANDS[d][0]} to ${BANDS[d][1]} micron`}
                className={`h-6 min-w-6 px-1.5 rounded border ${trackDetector === d ? "bg-blue border-blue text-cream" : "border-cream/25 text-cream/70 hover:border-cream/60"}`}>
                D{d}
              </button>
            ))}
          </div>

          {/* frame */}
          <div className="relative w-full aspect-square bg-ink border border-cream/20 overflow-hidden">
            {imgUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${imgUrl}-${imgFail}`} src={imgUrl} alt={`SPHEREx frame of ${activeTarget.name}, ${f?.month_label}`}
                onError={() => imgFail < 3 && setTimeout(() => setImgFail((n) => n + 1), 3000)}
                className="absolute inset-0 w-full h-full object-fill" draggable={false} />
            )}
            {f && (
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                {/* Historical trajectory trail connecting past measured positions */}
                {trail.length > 1 && (
                  <polyline
                    fill="none"
                    stroke={invert ? "rgba(30,30,30,0.55)" : "rgba(245,243,237,0.55)"}
                    strokeWidth="0.6"
                    strokeDasharray="1.5 1.5"
                    points={trail.map((t) => `${t.position!.grid_x + 0.5},${t.position!.grid_y + 0.5}`).join(" ")}
                  />
                )}

                {/* Predicted position circle (when not detected or as reference orbit) */}
                {f.expected && (
                  <circle
                    cx={f.expected.grid_x + 0.5}
                    cy={f.expected.grid_y + 0.5}
                    r={reticleRadius + 1}
                    fill="none"
                    className="stroke-cream"
                    strokeOpacity={detectedHere ? "0.35" : "0.75"}
                    strokeWidth="0.7"
                    strokeDasharray="1.5 1.5"
                  />
                )}

                {/* Catalogue overlays (Gaia / AllWISE) */}
                {gaiaOverlay && catsHere?.gaia.map((g, i) => (
                  <rect key={`g${i}`} x={g.grid_x + 0.5 - 2.2} y={g.grid_y + 0.5 - 2.2} width="4.4" height="4.4" fill="none" className="stroke-cream" strokeOpacity="0.8" strokeWidth="0.5" />
                ))}
                {wiseOverlay && catsHere?.wise.map((w, i) => (
                  <path key={`w${i}`} d={`M${w.grid_x + 0.5} ${w.grid_y + 0.5 - 3} l3 3 l-3 3 l-3 -3 z`} fill="none" className="stroke-blue" strokeWidth="0.7" />
                ))}

                {/* Measured Target Reticle (Centroid Locked, sample image style - hollow ring, no dot on the star) */}
                {detectedHere && targetX != null && targetY != null && (
                  <g className="transition-all duration-150">
                    {/* Contrast under-ring */}
                    <circle
                      cx={targetX}
                      cy={targetY}
                      r={reticleRadius}
                      fill="none"
                      stroke={invert ? "#FFFFFF" : "#000000"}
                      strokeWidth="2.2"
                      strokeOpacity="0.85"
                    />
                    {/* Red reticle ring matching reference sample image */}
                    <circle
                      cx={targetX}
                      cy={targetY}
                      r={reticleRadius}
                      fill="none"
                      stroke={invert ? "#D32F2F" : "#FF4D4D"}
                      strokeWidth="1.2"
                    />
                  </g>
                )}
              </svg>
            )}

            {/* Centroid-locked Target Label (8px font, exact sample image tracking) */}
            {/* {f && targetX != null && targetY != null && (
              <div
                style={{
                  left: `${(targetX / W) * 100}%`,
                  top: `${(targetY / H) * 100}%`,
                }}
                className={`absolute pointer-events-none -translate-x-1/2 z-10 select-none ${
                  isNearTop ? "mt-3.5" : "-translate-y-full mb-3.5"
                }`}
              >
                <span
                  className={`font-mono text-[8px] font-normal tracking-wider uppercase px-1 py-0.5 rounded whitespace-nowrap ${
                    invert
                      ? "text-[#D32F2F] bg-white/95 border border-[#D32F2F]/30 shadow-xs"
                      : "text-[#FF4D4D] bg-ink/95 border border-[#FF4D4D]/40 shadow-xs"
                  }`}
                >
                  {cleanName} {!detectedHere && f.expected ? "(pred)" : ""}
                </span>
              </div>
            )} */}

            {!imgUrl && (
              <div className="absolute inset-0 flex items-center justify-center text-center text-cream/60 px-6">
                {error ? `${error}` : "Getting real SPHEREx frames from the archive..."}
              </div>
            )}
            {f && (
              <>
                <div className="absolute left-1.5 top-1.5 bg-ink/85 border border-cream/15 rounded px-1.5 py-0.5 tracking-widest uppercase text-cream text-[8px] font-mono select-none">{f.month_label}</div>
                <div className="absolute right-1.5 top-1.5 bg-ink/85 border border-cream/15 rounded px-1.5 py-0.5 text-cream/80 text-[8px] font-mono select-none">N up · E left</div>
                <div className="absolute left-1.5 bottom-1.5 bg-ink/85 border border-cream/15 rounded px-2 py-0.5 text-cream/90 text-[8px] flex items-center gap-1.5 backdrop-blur-[2px] font-mono select-none">
                  <span className="inline-block w-2 h-2 rounded-full border border-red-500" />
                  <span>{detectedHere ? `${cleanName} measured centroid` : `${cleanName} not detected`}</span>
                  <span className="text-cream/40">·</span>
                  <span className="inline-block w-2 h-2 rounded-full border border-cream/60 border-dashed" />
                  <span>predicted</span>
                </div>
                {restart && <div className="absolute inset-0 border border-dashed border-cream/70" />}
              </>
            )}
          </div>

          {/* data-honesty bar */}
          {f && (
            <div className="text-cream/70 leading-snug">
              {f.release} · {f.date_utc.replace("T", " ").slice(0, 16)} UTC · detector {f.detector} · {f.wavelength_um.toFixed(3)} micron
              {f.masked_percent !== undefined && ` · ${f.masked_percent}% of pixels masked`}
              <div className="text-cream/50">Real SPHEREx data, NASA/IPAC IRSA. Background removed, asinh stretch.</div>
              {(gaiaOverlay || wiseOverlay) && (
                <div className="text-cream/50" aria-live="polite">
                  {!catsHere ? "Loading catalogue sources... " : ""}
                  {gaiaOverlay && "Squares: Gaia DR3 stars placed for 2026.0. "}
                  {wiseOverlay && "Diamonds: AllWISE sources at 2010.5, not moved. "}
                  {catsHere?.failed && `${catsHere.failed} did not answer just now.`}
                </div>
              )}
            </div>
          )}

          {/* controls */}
          {frames.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                role="switch"
                aria-checked={auto}
                onClick={() => setAuto((a) => !a)}
                className={`h-6 px-2 rounded border uppercase tracking-wider ${auto ? "bg-blue border-blue text-cream" : "border-cream/30 text-cream/80 hover:border-cream/60"}`}
              >
                {auto ? "Auto" : "Manual"}
              </button>
              <button
                type="button"
                aria-label="Previous frame"
                onClick={() => {
                  setAuto(false);
                  setIdx((safeIdx - 1 + frames.length) % frames.length);
                }}
                className="h-6 w-6 rounded border border-cream/30 hover:border-cream/60"
              >
                <CircleChevronsLeft className="h-4" />
              </button>
              <button
                type="button"
                aria-label="Next frame"
                onClick={() => {
                  setAuto(false);
                  setIdx((safeIdx + 1) % frames.length);
                }}
                className="h-6 w-6 rounded border border-cream/30 hover:border-cream/60"
              >
                <CircleChevronsRight className="h-4" />
              </button>
              <select
                aria-label="Seconds per frame"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="h-6 bg-ink border border-cream/30 rounded px-1"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s / 1000} s per frame
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-pressed={invert}
                onClick={() => setInvert((x) => !x)}
                className={`h-6 px-2 rounded border ${invert ? "border-blue text-cream" : "border-cream/30 text-cream/70"}`}
              >
                Invert
              </button>
              <span className="ml-auto text-cream/60">
                {safeIdx + 1} / {frames.length}
              </span>
            </div>
          )}

          {/* the timeline from the sketch */}
          {frames.length > 1 && (
            <Timeline
              frames={frames.map((x) => ({ mjd: x.mjd, label: x.month_label }))}
              current={safeIdx}
              onSelect={(i) => {
                setAuto(false);
                setIdx(i);
              }}
            />
          )}
          <div className="h-[14px]" />

          {/* what the data say */}
          {snap && v && (
            <div className="border-t border-cream/15 pt-2 space-y-1">
              <div className="uppercase tracking-wider text-cream">{v.headline}</div>
              <div className="text-cream/70">{v.detail}</div>
              <div className="text-cream/70">{brightnessWords(snap)}</div>
              {snap.status === "running" && (
                <div className="h-px bg-cream/15">
                  <div className="h-px bg-blue" style={{ width: `${(100 * snap.done) / Math.max(snap.total, 1)}%` }} />
                </div>
              )}
            </div>
          )}

          {f && snap && (
            <div className="border-t border-cream/15 pt-2 space-y-1.5">
              <div className="uppercase tracking-wider text-cream">The infrared colours</div>
              <div className="text-cream/70">
                This frame sees {wavelengthWords(f.wavelength_um)}. SPHEREx looks at every spot at many wavelengths over time.
              </div>
              <SpectrumDots snap={snap} detector={trackDetector} currentIndex={f.index} />
              <div className="text-cream/50">
                One dot per exposure of detector {trackDetector}: shorter to longer wavelength left to right, fainter to brighter upwards,
                older to newer from dim to bright. Dots at the same wavelength that differ point to a brightness change.
              </div>
            </div>
          )}

          {snap && snap.status === "done" && (
            <details className="border-t border-cream/15 pt-2">
              <summary className="cursor-pointer uppercase tracking-wider text-cream/80">Details for scientists</summary>
              <div className="mt-1.5 space-y-1 text-cream/70">
                <div>{snap.evidence_card.summary}</div>
                {snap.evidence_card.checks_performed.map((c) => (
                  <div key={c.check}><span className="text-cream/90">{c.check}:</span> {c.result}</div>
                ))}
                <div>
                  Frames: {snap.total} (failed {snap.failed}); Gaia reference stars: {snap.reference_stars.count};
                  measured positions use the proper-motion prediction and a Gaia alignment correction.
                </div>
                <div className="text-cream/50">{snap.evidence_card.reminder}</div>
              </div>
            </details>
          )}

          {error && snap?.status !== "done" && (
            <div className="flex items-center justify-between border border-cream/20 rounded px-2 py-1 text-cream/80">
              <span>{error}</span>
              <button type="button" onClick={retry} className="uppercase border border-cream/30 rounded px-2 py-0.5">Retry</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
