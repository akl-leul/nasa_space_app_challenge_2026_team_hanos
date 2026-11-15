"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithPolling } from "@/lib/api/poll";
import { countPositiveValid, type SpectrumChannel, type SweepStar } from "@/lib/sonify/mapping";

export interface SpectrumPick {
  star: SweepStar;
  channels: SpectrumChannel[];
  label: string;
  validNote: string;
  warnings: string[];
  positiveValid: number;
}

export interface SpectrumState {
  status: "idle" | "loading" | "done" | "error";
  checked: number;
  total: number;
  failed: number;
  pick: SpectrumPick | null;
  error: string | null;
}

interface ApiPoint {
  channel_index: number;
  wavelength_um: number;
  surface_brightness_mjy_sr: number | null;
  valid: boolean;
  is_blank: boolean;
}
interface ApiSpectrum {
  points: ApiPoint[];
  label: string;
  valid_note?: string;
  warnings?: string[];
}

/** A handful of stars spread from bright to fainter, so a saturated bright star does not decide the sound alone. */
export function pickCandidates(stars: readonly SweepStar[], count = 5): SweepStar[] {
  const sorted = [...stars].filter((s) => Number.isFinite(s.magnitude)).sort((a, b) => a.magnitude - b.magnitude);
  const ranks = [0, 6, 14, 24, 36].slice(0, count);
  const seen = new Set<string>();
  const out: SweepStar[] = [];
  for (const r of ranks) {
    const s = sorted[Math.min(r, sorted.length - 1)];
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

/**
 * Reads the real SPHEREx All-Sky Cube spectrum at a few catalogue positions in the region and keeps the one with the most
 * positive quality-valid channels (a deterministic rule; it is not claimed to be the most important or a detection).
 * Only runs once the spectrum mode is opened.
 */
export function useRegionSpectrum(enabled: boolean, candidates: readonly SweepStar[]) {
  const [state, setState] = useState<SpectrumState>({ status: "idle", checked: 0, total: 0, failed: 0, pick: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = candidates.map((c) => c.id).join("|");

  useEffect(() => {
    if (!enabled || candidates.length === 0) return;
    const ac = new AbortController();
    let cancelled = false;
    const run = async () => {
      setState({ status: "loading", checked: 0, total: candidates.length, failed: 0, pick: null, error: null });
      let best: SpectrumPick | null = null;
      let checked = 0;
      let failed = 0;
      let lastError = "";
      const queue = [...candidates];
      const worker = async () => {
        for (let s = queue.shift(); s; s = queue.shift()) {
          try {
            const r = await fetchWithPolling(`/api/spectrum?ra=${s.raDeg}&dec=${s.decDeg}&source=allsky`, { signal: ac.signal });
            const d = (await r.json().catch(() => ({}))) as Partial<ApiSpectrum> & { detail?: string };
            if (!r.ok || !d.points) throw new Error(d.detail || "The archive is busy.");
            const channels: SpectrumChannel[] = d.points.map((p) => ({
              channel: p.channel_index,
              wavelengthUm: p.wavelength_um,
              brightnessMjySr: p.surface_brightness_mjy_sr,
              valid: p.valid,
              blank: p.is_blank,
            }));
            const n = countPositiveValid(channels);
            if (!best || n > best.positiveValid) {
              best = { star: s, channels, label: d.label ?? "stacked (DR1 All-Sky Cube)", validNote: d.valid_note ?? "", warnings: d.warnings ?? [], positiveValid: n };
            }
          } catch (e) {
            if (ac.signal.aborted) return;
            failed++;
            lastError = e instanceof Error ? e.message : String(e);
          }
          checked++;
          if (!cancelled) setState((p) => ({ ...p, checked, failed }));
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (cancelled) return;
      if (best) setState({ status: "done", checked, total: candidates.length, failed, pick: best, error: null });
      else setState({ status: "error", checked, total: candidates.length, failed, pick: null, error: lastError || "The archive did not answer." });
    };
    run();
    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
