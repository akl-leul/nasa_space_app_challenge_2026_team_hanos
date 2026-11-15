"use client";

import { useMemo } from "react";
import { fitMap, type RegionGeometry } from "@/lib/sonify/region";
import type { SonifyEvent, SonifyTrack, StationMapping } from "@/lib/sonify/mapping";
import { noteLabel } from "@/lib/sonify/tuning";

const W = 600;

const fmt = (v: number | undefined | null, d = 2): string => (v === undefined || v === null || !Number.isFinite(v) ? "" : v.toFixed(d));

// ---------------------------------------------------------------- the region picture (stars mode)

export function RegionSweep({
  geometry,
  mapping,
  track,
  position,
  regionName,
}: {
  geometry: RegionGeometry;
  mapping: StationMapping;
  track: SonifyTrack;
  position: number;
  regionName: string;
}) {
  const padY = 16;
  // one scale in both directions: the region keeps its true proportions (no horizontal or vertical stretch)
  const fit = useMemo(() => fitMap(geometry, W, 320, padY + 4, 150), [geometry]);
  const H = fit.height;
  const { sx, sy } = fit;
  const { xMin, xMax } = geometry;
  const onset = useMemo(() => new Map(track.events.filter((e) => e.kind === "note").map((e) => [e.id, e.onsetSeconds ?? 0])), [track]);
  const frac = Math.min(1, Math.max(0, position / track.scanSeconds));
  const xLine = sx(mapping.minUnwrapped + frac * mapping.span);
  const ticks = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    const step = (xMax - xMin) / 4;
    for (let i = 0; i <= 4; i++) {
      const u = xMin + step * i;
      out.push({ x: sx(u), label: `${(((u % 360) + 360) % 360 / 15).toFixed(1)}h` });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xMin, xMax, fit]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block bg-ink border border-cream/15 rounded" role="img" aria-label={`${regionName}: ${track.noteCount} catalogue stars, right ascension growing to the right, a vertical scan line moving left to right. The note table below lists every star.`}>
      {geometry.rings.map((ring, i) => (
        <polygon key={i} points={ring.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ")} fill="none" className="stroke-blue" strokeOpacity="0.55" strokeWidth="1.2" strokeLinejoin="round" />
      ))}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={t.x} x2={t.x} y1={H - padY} y2={H - padY + 3} className="stroke-cream" strokeOpacity="0.4" />
          <text x={t.x} y={H - 3} textAnchor="middle" className="fill-cream" fillOpacity="0.6">
            {t.label}
          </text>
        </g>
      ))}
      {geometry.stars.map((s) => {
        const r = Math.min(5, Math.max(0.9, 0.9 + (6.5 - s.magnitude) * 0.55));
        const played = s.sounded && (onset.get(s.id) ?? Infinity) <= position + 1e-6 && position > 0;
        if (!s.sounded) return <circle key={s.id} cx={sx(s.x)} cy={sy(s.y)} r="0.9" className="fill-cream" fillOpacity="0.25" />;
        return <circle key={s.id} cx={sx(s.x)} cy={sy(s.y)} r={played ? r + 0.8 : r} className={played ? "fill-blue stroke-cream" : "fill-cream"} strokeWidth={played ? 0.6 : 0} />;
      })}
      <line x1={xLine} x2={xLine} y1={6} y2={H - padY} className="stroke-blue" strokeWidth="2" />
      <text x={6} y={12} className="fill-cream" fillOpacity="0.6">
        north
      </text>
      <text x={W - 6} y={12} textAnchor="end" className="fill-cream" fillOpacity="0.6">
        right ascension increases to the right · true proportions
      </text>
      {geometry.polar && (
        <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-cream" fillOpacity="0.6">
          Polar region: the boundary circles the pole and is not drawn flat. Stars are still placed by right ascension.
        </text>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- the spectrum picture (spectrum mode)

export function SpectrumPlot({ track, position, label }: { track: SonifyTrack; position: number; label: string }) {
  const H = 220;
  const padL = 40;
  const padR = 10;
  const padT = 14;
  const padB = 24;
  const rows = useMemo(() => track.events.filter((e) => e.role === "measurement").sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0)), [track]);
  const maxV = Math.max(1e-9, ...rows.map((r) => (r.qualityValid && (r.brightnessMjySr ?? 0) > 0 ? (r.brightnessMjySr as number) : 0)));
  const n = rows.length;
  const sx = (i: number) => padL + ((i + 0.5) / n) * (W - padL - padR);
  const sy = (v: number) => H - padB - (v / (maxV * 1.08)) * (H - padT - padB);
  const frac = Math.min(1, Math.max(0, position / track.scanSeconds));
  const xLine = padL + frac * (W - padL - padR);
  // draw a line only through neighbouring measured channels: a gap is never bridged
  const segments: string[] = [];
  let cur: string[] = [];
  rows.forEach((r, i) => {
    const ok = r.kind !== "rest" && r.qualityValid && (r.brightnessMjySr ?? 0) > 0;
    if (ok) cur.push(`${sx(i).toFixed(1)},${sy(r.brightnessMjySr as number).toFixed(1)}`);
    else if (cur.length) {
      segments.push(cur.join(" "));
      cur = [];
    }
  });
  if (cur.length) segments.push(cur.join(" "));
  const wl = [0.75, 1.5, 3, 5];
  const idxOfWl = (w: number) => {
    let best = 0;
    let d = Infinity;
    rows.forEach((r, i) => {
      const dd = Math.abs((r.wavelengthUm ?? 0) - w);
      if (dd < d) {
        d = dd;
        best = i;
      }
    });
    return best;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block bg-ink border border-cream/15 rounded" role="img" aria-label={`${label}: SPHEREx surface brightness in MJy per steradian against wavelength, 102 channels. Gaps are channels with no usable data and stay silent. The note table below lists every channel.`}>
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} className="stroke-cream" strokeOpacity="0.4" />
      <line x1={padL} x2={padL} y1={padT} y2={H - padB} className="stroke-cream" strokeOpacity="0.4" />
      {rows.map((r, i) =>
        r.kind === "rest" ? (
          <rect key={r.id} x={sx(i) - (W - padL - padR) / n / 2} y={padT} width={(W - padL - padR) / n} height={H - padT - padB} className={r.reason.startsWith("blank") ? "fill-cream" : "fill-blue"} fillOpacity={r.reason.startsWith("blank") ? 0.07 : 0.05} />
        ) : null
      )}
      {segments.map((s, i) => (
        <polyline key={i} points={s} fill="none" className="stroke-cream" strokeOpacity="0.8" strokeWidth="1.2" />
      ))}
      {rows.map((r, i) => {
        if (r.kind === "rest" || !r.qualityValid || (r.brightnessMjySr ?? 0) <= 0) return null;
        const played = (r.onsetSeconds ?? Infinity) <= position + 1e-6 && position > 0;
        return <circle key={r.id} cx={sx(i)} cy={sy(r.brightnessMjySr as number)} r={played ? 2.6 : 1.6} className={played ? "fill-blue" : "fill-cream"} />;
      })}
      {wl.map((w) => (
        <text key={w} x={sx(idxOfWl(w))} y={H - 8} textAnchor="middle" className="fill-cream" fillOpacity="0.6">
          {w} µm
        </text>
      ))}
      <text x={W - padR} y={padT + 4} textAnchor="end" className="fill-cream" fillOpacity="0.6">
        surface brightness, MJy/sr (scale is this star only)
      </text>
      <text x={padL - 4} y={padT + 4} textAnchor="end" className="fill-cream" fillOpacity="0.6">
        {fmt(maxV, 2)}
      </text>
      <text x={padL - 4} y={H - padB} textAnchor="end" className="fill-cream" fillOpacity="0.6">
        0
      </text>
      <line x1={xLine} x2={xLine} y1={6} y2={H - padB} className="stroke-blue" strokeWidth="2" />
    </svg>
  );
}

// ---------------------------------------------------------------- pitch graph

export function PitchGraph({ track, position }: { track: SonifyTrack; position: number }) {
  const H = 120;
  const padL = 30;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const lo = 46;
  const hi = 74;
  const sx = (sec: number) => padL + (sec / track.scanSeconds) * (W - padL - padR);
  const sy = (p: number) => H - padB - ((p - lo) / (hi - lo)) * (H - padT - padB);
  const notes = track.events.filter((e) => e.kind === "note");
  const rests = track.events.filter((e) => e.kind === "rest");
  const x = sx(Math.min(position, track.scanSeconds));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block bg-ink border border-cream/15 rounded" role="img" aria-label={`Pitch of every note against time. ${track.noteCount} notes${track.supportCount ? ` and ${track.supportCount} string support notes` : ""}; the note table lists each one.`}>
      {[48, 60, 72].map((p) => (
        <g key={p}>
          <line x1={padL} x2={W - padR} y1={sy(p)} y2={sy(p)} className="stroke-cream" strokeOpacity="0.12" />
          <text x={padL - 4} y={sy(p) + 3} textAnchor="end" className="fill-cream" fillOpacity="0.6">
            {noteLabel(p)}
          </text>
        </g>
      ))}
      {rests.map((e) => (
        <line key={e.id} x1={sx((e.channel! - 1) * (track.scanSeconds / 102) + 0.5 * (track.scanSeconds / 102))} x2={sx((e.channel! - 1) * (track.scanSeconds / 102) + 0.5 * (track.scanSeconds / 102))} y1={H - padB - 5} y2={H - padB} className="stroke-cream" strokeOpacity="0.35" />
      ))}
      {notes.map((e) => {
        const played = (e.onsetSeconds ?? Infinity) <= position + 1e-6 && position > 0;
        const r = 1.6 + ((e.velocity ?? 60) / 127) * 2.4;
        const common = { cx: sx(e.onsetSeconds ?? 0), cy: sy(e.pitch ?? lo), r };
        return e.role === "harmony" ? (
          <circle key={e.id} {...common} fill="none" className={played ? "stroke-blue" : "stroke-cream"} strokeOpacity={played ? 1 : 0.5} />
        ) : (
          <circle key={e.id} {...common} className={played ? "fill-blue" : "fill-cream"} fillOpacity={played ? 1 : 0.55} />
        );
      })}
      <line x1={x} x2={x} y1={padT - 2} y2={H - padB} className="stroke-blue" strokeWidth="2" />
      <text x={padL} y={H - 3} className="fill-cream" fillOpacity="0.6">
        start
      </text>
      <text x={W - padR} y={H - 3} textAnchor="end" className="fill-cream" fillOpacity="0.6">
        end of the scan
      </text>
    </svg>
  );
}

/** The note the sound is on right now, as text. */
export function nowPlaying(track: SonifyTrack, position: number): SonifyEvent | null {
  let best: SonifyEvent | null = null;
  for (const e of track.events) {
    if (e.kind !== "note" || e.role === "harmony" || e.onsetSeconds === undefined) continue;
    if (e.onsetSeconds <= position + 1e-6 && (!best || e.onsetSeconds >= (best.onsetSeconds ?? 0))) best = e;
  }
  return best;
}

// ---------------------------------------------------------------- the text equivalent

export function NoteTable({ track }: { track: SonifyTrack }) {
  const spectrum = track.kind === "spectrum";
  return (
    <details className="border border-cream/20 rounded">
      <summary className="px-2 py-1.5 cursor-pointer tracking-wider uppercase text-cream/80 hover:text-cream focus-visible:outline-2 focus-visible:outline-blue">
        Note table: every {spectrum ? "channel" : "star"}, its pitch and why ({track.events.length} rows)
      </summary>
      <div className="max-h-52 overflow-auto border-t border-cream/15">
        <table className="w-full text-left font-mono">
          <thead className="sticky top-0 bg-ink text-cream/60">
            <tr>
              <th className="p-1">{spectrum ? "Channel" : "Star"}</th>
              <th className="p-1">{spectrum ? "Micron" : "RA, Dec (deg)"}</th>
              <th className="p-1">{spectrum ? "MJy/sr" : "Magnitude"}</th>
              <th className="p-1">Note</th>
              <th className="p-1">Hz</th>
              <th className="p-1">Loudness</th>
              <th className="p-1">At (s)</th>
              <th className="p-1">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream/10 text-cream/80">
            {track.events.map((e) => (
              <tr key={e.id} className={e.kind === "note" ? "" : "text-cream/50"}>
                <td className="p-1">{spectrum ? e.channel : e.name}{e.role === "harmony" ? " (strings)" : ""}</td>
                <td className="p-1">{spectrum ? fmt(e.wavelengthUm, 3) : `${fmt(e.raDeg, 2)}, ${fmt(e.decDeg, 2)}`}</td>
                <td className="p-1">{spectrum ? fmt(e.brightnessMjySr, 4) : fmt(e.magnitude, 2)}</td>
                <td className="p-1">{e.pitch !== undefined && e.kind === "note" ? noteLabel(e.pitch) : ""}</td>
                <td className="p-1">{e.kind === "note" ? fmt(e.frequencyHz, 1) : ""}</td>
                <td className="p-1">{e.kind === "note" ? e.velocity : ""}</td>
                <td className="p-1">{e.kind === "note" ? fmt(e.onsetSeconds, 1) : ""}</td>
                <td className="p-1 font-sans">{e.kind === "note" ? e.reason : `${e.kind}: ${e.reason}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
