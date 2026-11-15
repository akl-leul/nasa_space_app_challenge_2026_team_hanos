"use client";

import { useCallback, useMemo, useRef } from "react";

export interface TimelineFrame {
  mjd: number;
  label: string;
}

const MJD_UNIX_EPOCH = 40587; // MJD of 1970-01-01
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mjdToDate = (mjd: number) => new Date((mjd - MJD_UNIX_EPOCH) * 86400000);
const dateToMjd = (d: Date) => d.getTime() / 86400000 + MJD_UNIX_EPOCH;

/**
 * The dotted month strip from the design sketch: a dot above a dashed strip of months ("Jan ... Feb ... 2026").
 * The dot sits at the true date of the current frame and moves with time; drag or click to jump.
 * Positions are proportional to the real observation dates, so uneven spacing is visible.
 */
export function Timeline({
  frames,
  current,
  onSelect,
}: {
  frames: TimelineFrame[];
  current: number;
  onSelect: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const pressed = useRef(false);

  const { t0, t1, months } = useMemo(() => {
    const first = Math.min(...frames.map((f) => f.mjd));
    const last = Math.max(...frames.map((f) => f.mjd));
    const d0 = mjdToDate(first);
    const start = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1));
    const end = mjdToDate(last);
    const ms: { mjd: number; month: number; year: number }[] = [];
    for (let d = start; d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      ms.push({ mjd: dateToMjd(d), month: d.getUTCMonth(), year: d.getUTCFullYear() });
    }
    const a = Math.min(first, ms[0].mjd);
    const b = last + (last - a) * 0.02 + 1;
    return { t0: a, t1: b, months: ms };
  }, [frames]);

  const pct = useCallback((mjd: number) => `${(100 * (mjd - t0)) / (t1 - t0)}%`, [t0, t1]);

  const pick = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const mjd = t0 + ((clientX - r.left) / r.width) * (t1 - t0);
      let best = 0;
      let bestD = Infinity;
      frames.forEach((f, i) => {
        const d = Math.abs(f.mjd - mjd);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      onSelect(best);
    },
    [frames, onSelect, t0, t1]
  );

  const cur = frames[current];
  const showEvery = months.length > 14 ? 2 : 1;

  return (
    <div
      ref={ref}
      className="relative h-[58px] select-none touch-none cursor-ew-resize"
      role="slider"
      aria-label="Observation date"
      aria-valuemin={0}
      aria-valuemax={Math.max(frames.length - 1, 0)}
      aria-valuenow={current}
      aria-valuetext={cur ? cur.label : undefined}
      tabIndex={0}
      onPointerDown={(e) => {
        pressed.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => pressed.current && pick(e.clientX)}
      onPointerUp={() => (pressed.current = false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onSelect(Math.min(current + 1, frames.length - 1));
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") onSelect(Math.max(current - 1, 0));
      }}
    >
      {/* the top line the dot rides on */}
      <div className="absolute left-0 right-0 top-[6px] h-px bg-cream/40" />
      {/* the dot: moves with time */}
      <div
        className="absolute top-[1px] w-[11px] h-[11px] -ml-[5.5px] rounded-full bg-blue border border-cream transition-[left] duration-300 ease-out motion-reduce:transition-none"
        style={{ left: cur ? pct(cur.mjd) : "0%" }}
      />
      {/* dashed month strip */}
      <div className="absolute left-0 right-0 top-[18px] h-[1px] border-t border-dashed border-cream/50" />
      <div className="absolute left-0 right-0 top-[26px] h-[1px] border-t border-dashed border-cream/25" />
      {/* one tick per real frame */}
      {frames.map((f, i) => (
        <div
          key={i}
          className={`absolute top-[14px] w-px ${i === current ? "h-[16px] bg-cream" : "h-[8px] bg-cream/55"}`}
          style={{ left: pct(f.mjd) }}
        />
      ))}
      {/* month and year labels */}
      {months.map((m, i) => {
        const left = pct(m.mjd);
        const first = i === 0 || m.month === 0;
        return (
          <div key={`${m.year}-${m.month}`} className="absolute top-[30px] -ml-px" style={{ left }}>
            <div className="absolute -top-[6px] left-0 h-[6px] w-px bg-cream/40" />
            {i % showEvery === 0 && <span className="text-cream/70 tracking-wider pl-[2px]">{MONTHS[m.month]}</span>}
            {first && <span className="absolute left-[2px] top-[10px] text-cream/90 tracking-widest">{m.year}</span>}
          </div>
        );
      })}
    </div>
  );
}
