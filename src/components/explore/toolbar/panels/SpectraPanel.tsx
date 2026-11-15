"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithPolling } from "@/lib/api/poll";
import { useExplore } from "../ExploreContext";

interface DetectorRow {
  detector: number;
  documented_band_um: [number, number];
  frames: number;
  has_coverage: boolean;
  first_date?: string;
  last_date?: string;
}

interface CubePoint {
  channel_index: number;
  band: number;
  wavelength_um: number;
  is_blank: boolean;
  flux_ujy: number | null;
  error_ujy: number | null;
  valid: boolean;
  n_hits: number;
}

interface ExposurePoint {
  wavelength_um: number;
  detector: number;
  date_utc: string;
  month_label: string;
  release: string;
  flux_ujy: number;
  error_ujy: number;
  detected: boolean;
  is_lower_limit: boolean;
}

interface Marker {
  name: string;
  wavelength_um: number;
  label: string;
}

interface SpectrumResponse {
  source: "allsky" | "exposures";
  status?: "done" | "running" | "error";
  label: string;
  warnings: string[];
  valid_note?: string;
  frames_total?: number;
  frames_done?: number;
  points: (CubePoint | ExposurePoint)[];
  markers: Marker[];
  reference_photometry?: { available: boolean; reason?: string };
}

interface StackInfo {
  detector: number;
  label: string;
  frames_stacked: number;
  wavelength_span_um: [number, number];
  date_span_years: [number, number];
  noise_single_frame_median_MJy_sr: number;
  noise_stack_MJy_sr: number;
}

interface PlotPoint {
  wl: number;
  flux: number;
  err: number;
  lower: boolean;
  tag: string;
}

const X0 = 0.7;
const X1 = 5.1;
const W = 320;
const H = 150;
const PAD = { l: 42, r: 8, t: 10, b: 26 };

/** Flux against wavelength with error bars. Every number is a measurement; the x axis is the SPHEREx range. */
function SpectrumPlot({ points, markers, selected }: { points: PlotPoint[]; markers: Marker[]; selected: number | null }) {
  const { x, y, yTicks, y0 } = useMemo(() => {
    const lo = Math.min(0, ...points.map((p) => p.flux - p.err));
    const hi = Math.max(...points.map((p) => p.flux + p.err), 1);
    const span = hi - lo || 1;
    const yl = lo - span * 0.04;
    const yh = hi + span * 0.06;
    const xf = (wl: number) => PAD.l + ((wl - X0) / (X1 - X0)) * (W - PAD.l - PAD.r);
    const yf = (f: number) => H - PAD.b - ((f - yl) / (yh - yl)) * (H - PAD.t - PAD.b);
    const ticks = [0, 1, 2, 3, 4].map((i) => yl + ((yh - yl) * i) / 4);
    return { x: xf, y: yf, yTicks: ticks, y0: yf(0) };
  }, [points]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Flux against wavelength, with error bars">
      <rect x="0" y="0" width={W} height={H} className="fill-ink" />
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-cream" strokeOpacity="0.12" />
          <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" className="fill-cream" fillOpacity="0.7">
            {Math.abs(t) >= 100 ? Math.round(t) : t.toFixed(1)}
          </text>
        </g>
      ))}
      {[1, 2, 3, 4, 5].map((w) => (
        <g key={w}>
          <line x1={x(w)} x2={x(w)} y1={H - PAD.b} y2={H - PAD.b + 3} className="stroke-cream" strokeOpacity="0.5" />
          <text x={x(w)} y={H - PAD.b + 12} textAnchor="middle" className="fill-cream" fillOpacity="0.7">
            {w}
          </text>
        </g>
      ))}
      <text x={(PAD.l + W - PAD.r) / 2} y={H - 3} textAnchor="middle" className="fill-cream" fillOpacity="0.7">
        wavelength (micron)
      </text>
      <text transform={`translate(9 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle" className="fill-cream" fillOpacity="0.7">
        flux (microjansky)
      </text>
      <line x1={PAD.l} x2={W - PAD.r} y1={y0} y2={y0} className="stroke-cream" strokeOpacity="0.35" />
      {markers
        .filter((m) => m.wavelength_um >= X0 && m.wavelength_um <= X1)
        .map((m) => (
          <g key={m.name}>
            <line x1={x(m.wavelength_um)} x2={x(m.wavelength_um)} y1={PAD.t} y2={H - PAD.b} className="stroke-blue" strokeDasharray="2 3" />
            <title>{m.label}</title>
          </g>
        ))}
      {points.map((p, i) => (
        <g key={i}>
          <line x1={x(p.wl)} x2={x(p.wl)} y1={y(p.flux - p.err)} y2={y(p.flux + p.err)} className="stroke-cream" strokeOpacity="0.5" />
          {p.lower ? (
            <path d={`M${x(p.wl) - 2.5} ${y(p.flux) + 3} L${x(p.wl)} ${y(p.flux) - 3} L${x(p.wl) + 2.5} ${y(p.flux) + 3} Z`} className="fill-none stroke-cream" />
          ) : (
            <circle cx={x(p.wl)} cy={y(p.flux)} r={selected === i ? 3.6 : 1.8} className={selected === i ? "fill-blue stroke-cream" : "fill-cream"} />
          )}
          <title>{p.tag}</title>
        </g>
      ))}
    </svg>
  );
}

export function SpectraPanel() {
  const { viewCenter, activeTarget } = useExplore();

  const pos = activeTarget
    ? { ra: activeTarget.ra, dec: activeTarget.dec, pmra: activeTarget.pmra, pmdec: activeTarget.pmdec, epoch: activeTarget.epoch, name: activeTarget.name }
    : { ra: viewCenter.ra, dec: viewCenter.dec, pmra: 0, pmdec: 0, epoch: 2026.0, name: "the centre of the view" };

  // a fast mover smears across the stacked cube, so start with single exposures for it (more than 2 arcsec a year)
  const [source, setSource] = useState<"allsky" | "exposures">(() =>
    activeTarget && Math.hypot(activeTarget.pmra, activeTarget.pmdec) > 2000 ? "exposures" : "allsky"
  );
  const [data, setData] = useState<SpectrumResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detectors, setDetectors] = useState<DetectorRow[] | null>(null);
  const [stackDet, setStackDet] = useState<number | null>(null);
  const [stackInfo, setStackInfo] = useState<StackInfo | null>(null);
  const [stackImg, setStackImg] = useState<string | null>(null);
  const [stackBusy, setStackBusy] = useState(false);
  const [stackError, setStackError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadAgain = useRef<() => void>(() => undefined);

  // which detectors really have frames here (real counts from the archive)
  const detKey = `${pos.ra}|${pos.dec}`;
  const [prevDetKey, setPrevDetKey] = useState(detKey);
  if (prevDetKey !== detKey) {
    setPrevDetKey(detKey);
    setDetectors(null);
  }
  useEffect(() => {
    let live = true;
    fetch(`/api/detectors?ra=${pos.ra}&dec=${pos.dec}`)
      .then((r) => r.json())
      .then((d) => live && setDetectors(d.detectors ?? null))
      .catch(() => live && setDetectors(null));
    return () => {
      live = false;
    };
  }, [pos.ra, pos.dec]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    clearTimeout(timer.current);
    try {
      const url = `/api/spectrum?ra=${pos.ra}&dec=${pos.dec}&source=${source}&pmra=${pos.pmra}&pmdec=${pos.pmdec}&epoch=${pos.epoch}`;
      const r = await fetchWithPolling(url);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "The archive is busy. Try again in a moment.");
      setData(d as SpectrumResponse);
      setSelected(null);
      if (d.source === "exposures" && d.status === "running") {
        timer.current = setTimeout(() => loadAgain.current(), 4000); // keep asking until every frame is measured
        return;
      }
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [pos.ra, pos.dec, pos.pmra, pos.pmdec, pos.epoch, source]);

  useEffect(() => {
    loadAgain.current = load;
  }, [load]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const plot = useMemo<PlotPoint[]>(() => {
    if (!data) return [];
    if (data.source === "allsky") {
      return (data.points as CubePoint[])
        .filter((p) => p.valid && !p.is_blank && p.flux_ujy != null)
        .map((p) => ({ wl: p.wavelength_um, flux: p.flux_ujy!, err: p.error_ujy ?? 0, lower: false, tag: `channel ${p.channel_index}: ${p.wavelength_um.toFixed(3)} micron` }));
    }
    return (data.points as ExposurePoint[]).map((p) => ({
      wl: p.wavelength_um,
      flux: p.flux_ujy,
      err: p.error_ujy,
      lower: p.is_lower_limit,
      tag: `${p.month_label}, detector ${p.detector}, ${p.wavelength_um.toFixed(3)} micron${p.is_lower_limit ? " (lower limit: saturated)" : ""}`,
    }));
  }, [data]);

  const runStack = async (det: number) => {
    setStackDet(det);
    setStackBusy(true);
    setStackError(null);
    setStackInfo(null);
    setStackImg(null);
    try {
      const q = `ra=${pos.ra}&dec=${pos.dec}&detector=${det}&size=0.1&follow=${activeTarget && (activeTarget.pmra || activeTarget.pmdec) ? "true" : "false"}&pmra=${pos.pmra}&pmdec=${pos.pmdec}&epoch=${pos.epoch}`;
      const r = await fetchWithPolling(`/api/stack?${q}&format=json`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "The archive is busy.");
      setStackInfo(d as StackInfo);
      setStackImg(`/api/stack?${q}&format=png`);
    } catch (e) {
      setStackError(e instanceof Error ? e.message : String(e));
    } finally {
      setStackBusy(false);
    }
  };

  const chosen = selected != null ? plot[selected] : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-cream/50 uppercase tracking-wider mb-1.5">
          Which infrared bands see {activeTarget ? activeTarget.name : "this spot"}
        </div>
        <div className="grid grid-cols-6 gap-1 text-center font-mono">
          {(detectors ?? [1, 2, 3, 4, 5, 6].map((d) => ({ detector: d, frames: -1, has_coverage: false, documented_band_um: [0, 0] as [number, number] }))).map((d) => (
            <div
              key={d.detector}
              className={`p-1 rounded border ${d.has_coverage ? "bg-blue/15 border-blue text-cream" : "bg-cream/5 border-cream/10 text-cream/40"}`}
              title={d.documented_band_um[0] ? `${d.documented_band_um[0]} to ${d.documented_band_um[1]} micron` : undefined}
            >
              <div>D{d.detector}</div>
              <div className="text-cream/60">{d.frames < 0 ? "..." : `${d.frames} frames`}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-cream/10 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-cream/50 uppercase tracking-wider">Spectrum of {pos.name}</span>
        </div>
        <div className="flex gap-1">
          {(
            [
              ["allsky", "All-sky cube (102 channels)"],
              ["exposures", "Single exposures"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSource(id);
                setData(null);
              }}
              className={`px-1.5 py-0.5 rounded border uppercase ${source === id ? "bg-cream text-ink border-cream" : "border-cream/20 text-cream/60"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-cream/50 leading-relaxed">
          {source === "allsky"
            ? "The cube adds up the whole survey, so it shows colour but no change over time. Good for steady objects."
            : "Every point is one real exposure with its own date. For a moving or changing object this is the honest view."}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="w-full py-1.5 bg-blue text-cream uppercase tracking-wider rounded hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading
            ? data?.source === "exposures"
              ? `Measuring frames: ${data.frames_done ?? 0} of ${data.frames_total ?? "..."}`
              : "Reading the 102 channels..."
            : "Get the spectrum"}
        </button>

        {error && (
          <div role="alert" className="p-2 border border-blue rounded text-cream leading-relaxed">
            {error}
          </div>
        )}

        {data && plot.length > 0 && (
          <div className="space-y-2">
            <div className="p-2 bg-cream/5 border border-cream/15 rounded text-cream/70 leading-relaxed">
              {data.label}. {data.valid_note}
            </div>
            <SpectrumPlot points={plot} markers={data.markers} selected={selected} />
            <div className="text-cream/50 leading-relaxed">Dashed blue lines mark well-known spectral features (hover for names). Triangles are lower limits: the star saturates the detector.</div>

            <label className="block text-cream/60">
              Step through the points
              <input
                type="range"
                min={0}
                max={plot.length - 1}
                value={selected ?? 0}
                onChange={(e) => setSelected(parseInt(e.target.value))}
                className="w-full accent-blue"
                aria-label="Choose a measurement"
              />
            </label>
            <div className="font-mono text-cream/80" aria-live="polite">
              {chosen
                ? `${chosen.tag}: ${chosen.flux.toFixed(1)} ± ${chosen.err.toFixed(1)} microjansky${chosen.lower ? " (lower limit)" : ""}`
                : `${plot.length} measurements. Move the slider to read each one.`}
            </div>

            {data.warnings.length > 0 && (
              <ul className="list-disc list-inside text-cream/60 space-y-0.5 leading-relaxed">
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            {data.reference_photometry && (
              <div className="text-cream/50 leading-relaxed">
                AllWISE cross-check: {data.reference_photometry.available ? "a WISE source is at this position." : data.reference_photometry.reason}
              </div>
            )}
          </div>
        )}
        {data && plot.length === 0 && !loading && (
          <div className="p-2 border border-dashed border-cream/20 rounded text-cream/60 leading-relaxed">
            The archive answered but no valid measurement exists for this position
            {data.source === "exposures" ? " in the frames measured so far." : " in the cube."} {data.warnings.join(" ")}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-cream/10 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-cream/50 uppercase tracking-wider">Deeper image: add up one band</span>
          <span className="text-cream/40">detectors never mixed</span>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((det) => (
            <button
              key={det}
              type="button"
              onClick={() => runStack(det)}
              disabled={stackBusy}
              className={`flex-1 py-1 rounded border uppercase tracking-wider transition-colors disabled:opacity-50 ${
                stackDet === det ? "bg-blue text-cream border-blue" : "border-cream/20 text-cream/70 hover:border-cream/40 hover:text-cream"
              }`}
            >
              D{det}
            </button>
          ))}
        </div>
        {stackBusy && <div className="text-cream/60">Adding up real frames of detector {stackDet}. This can take a minute...</div>}
        {stackError && (
          <div role="alert" className="p-2 border border-blue rounded text-cream leading-relaxed">
            {stackError}
          </div>
        )}
        {stackInfo && stackImg && (
          <div className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={stackImg} alt={`Stacked image of detector ${stackInfo.detector}`} className="w-full aspect-square object-contain bg-ink border border-cream/20 rounded image-pixelated" />
            <div className="font-mono text-cream/70 leading-relaxed">
              {stackInfo.frames_stacked} frames of detector {stackInfo.detector}, {stackInfo.wavelength_span_um[0]} to {stackInfo.wavelength_span_um[1]} micron,{" "}
              {stackInfo.date_span_years[0]} to {stackInfo.date_span_years[1]}. Noise falls from {stackInfo.noise_single_frame_median_MJy_sr} to {stackInfo.noise_stack_MJy_sr} MJy/sr.
              A stack cannot show motion or change.
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-cream/10 flex justify-between">
        <a href="https://irsa.ipac.caltech.edu/applications/SPHEREx/" target="_blank" rel="noopener noreferrer" className="text-cream underline underline-offset-2 uppercase">
          IRSA SPHEREx tools ↗
        </a>
      </div>
    </div>
  );
}
