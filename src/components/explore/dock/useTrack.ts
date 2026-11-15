"use client";

import { useEffect, useState } from "react";
import type { ActiveTarget } from "../toolbar/ExploreContext";

export interface TrackMeasurement {
  usable: boolean;
  reason?: string;
  detected?: boolean;
  flux_ujy?: number;
  flux_error_ujy?: number;
  snr?: number;
  flux_quality?: string;
  flux_is_lower_limit?: boolean;
  upper_limit_3sigma_ujy?: number;
}

export interface TrackFrame {
  index: number;
  status: "ok" | "failed";
  error?: string;
  obs_id: string;
  release: string;
  detector: number;
  access_url: string;
  date_utc: string;
  month_label: string;
  mjd: number;
  decimal_year: number;
  wavelength_um: number;
  bandwidth_um?: number;
  exposure_s?: number;
  masked_percent?: number;
  frame_png?: string;
  expected?: { ra: number; dec: number; grid_x: number; grid_y: number };
  measurement?: TrackMeasurement;
  position?: {
    grid_x: number;
    grid_y: number;
    offset_after_reference_alignment_arcsec: [number, number];
    error_arcsec: number;
    alignment?: { n_refs: number; usable: boolean } | null;
  };
}

export interface TrackSnapshot {
  job_id: string;
  status: "starting" | "running" | "done" | "error";
  error?: string | null;
  total: number;
  done: number;
  failed: number;
  elapsed_s: number;
  grid: { width_px: number; height_px: number; pixel_scale_arcsec: number };
  observations: { frames_in_footprint?: number; frames_used?: number; span_days?: number; collections?: { release: string; ok: boolean; count: number }[] };
  reference_stars: { count: number; error?: string | null };
  frames: TrackFrame[];
  motion: {
    status: "measured" | "not_detected" | "insufficient";
    explanation?: string;
    pm_total_mas_yr?: number;
    pm_total_sigma?: number;
    expected_pm_mas_yr?: [number, number];
    difference_from_expected_sigma?: number;
    time_span_years?: number;
    detected_frames?: number;
    usable_frames?: number;
    median_snr?: number | null;
  };
  brightness: {
    status?: "tested" | "saturated" | "insufficient" | "not_detected";
    explanation?: string;
    clean_frames: number;
    saturated_or_flagged_frames: number;
    variable_bins?: { wavelength_um: number; chi2_reduced: number; peak_to_peak_percent: number | null; n_frames: number }[];
  };
  light_curve: {
    index: number;
    date_utc: string;
    month_label: string;
    decimal_year: number;
    wavelength_um: number;
    flux_ujy: number;
    flux_error_ujy: number;
    detected: boolean;
    is_lower_limit: boolean;
  }[];
  evidence_card: { claim_level: string; summary: string; checks_performed: { check: string; result: string }[]; reminder: string };
}

/** Starts (or joins) the real tracking job for the target and polls it until it is done. */
export function useTrack(target: ActiveTarget | null, detector: number, sizeDeg = 0.1) {
  const [snap, setSnap] = useState<TrackSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // forget the old object's result as soon as the object or the band changes (adjusted during render)
  const key = `${target?.ra}|${target?.dec}|${target?.pmra}|${target?.pmdec}|${target?.epoch}|${target?.name}|${detector}|${sizeDeg}|${retry}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setSnap(null);
    setError(null);
  }

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ac = new AbortController();
    const url =
      `/api/track?ra=${target.ra}&dec=${target.dec}&size=${sizeDeg}&detector=${detector}` +
      `&pmra=${target.pmra}&pmdec=${target.pmdec}&epoch=${target.epoch}&name=${encodeURIComponent(target.name)}`;

    const poll = async () => {
      try {
        const r = await fetch(url, { signal: ac.signal });
        if (!r.ok) {
          const body = await r.json().catch(() => ({ detail: r.statusText }));
          throw new Error(body.detail || r.statusText);
        }
        const d: TrackSnapshot = await r.json();
        if (cancelled) return;
        setSnap(d);
        setError(d.status === "error" ? d.error || "The archive is busy." : null);
        if (d.status === "starting" || d.status === "running") timer = setTimeout(poll, 2500);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : String(e));
        timer = setTimeout(poll, 8000); // retry; the server keeps whatever it already measured
      }
    };
    poll();
    return () => {
      cancelled = true;
      ac.abort();
      if (timer) clearTimeout(timer);
    };
  }, [target?.ra, target?.dec, target?.pmra, target?.pmdec, target?.epoch, target?.name, detector, sizeDeg, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  return { snap, error, retry: () => setRetry((n) => n + 1) };
}
