"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useExplore, ObservationItem } from "../ExploreContext";

interface ObsResponse {
  observations: ObservationItem[];
  collections: { collection: string; release: string; ok: boolean; count: number }[];
  uses_stored_result: boolean;
  span_days: number | null;
}

/** Real SPHEREx exposures that cover the selected object (or the centre of the view). Nothing here is sample data. */
export function ObservationsPanel() {
  const {
    viewCenter,
    activeTarget,
    observations,
    setObservations,
    isLoadingObs,
    setIsLoadingObs,
    currentFrameIdx,
    setCurrentFrameIdx,
    selectedPair,
    setSelectedPair,
  } = useExplore();

  const [detector, setDetector] = useState<number | null>(null);
  const [onlyOnDetector, setOnlyOnDetector] = useState(true);
  const [meta, setMeta] = useState<ObservationItem | null>(null);
  const [info, setInfo] = useState<Pick<ObsResponse, "collections" | "uses_stored_result"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pos = activeTarget ?? { ra: viewCenter.ra, dec: viewCenter.dec, name: "the centre of the view" };

  const fetchObservations = useCallback(async () => {
    setIsLoadingObs(true);
    setError(null);
    try {
      const url = `/api/observations?ra=${pos.ra}&dec=${pos.dec}&radius=0.05${detector ? `&detector=${detector}` : ""}`;
      const resp = await fetch(url);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || "The archive is busy. Try again in a moment.");
      const d = data as ObsResponse;
      setObservations(d.observations);
      setInfo({ collections: d.collections, uses_stored_result: d.uses_stored_result });
      setCurrentFrameIdx(0);
      setSelectedPair([0, Math.min(1, d.observations.length - 1)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoadingObs(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.ra, pos.dec, detector]);

  // search automatically when the panel opens and whenever the object or the detector changes
  useEffect(() => {
    const t = setTimeout(fetchObservations, 0); // a tick later, so the effect itself sets no state
    return () => clearTimeout(t);
  }, [fetchObservations]);

  const shown = useMemo(
    () => observations.filter((o) => !onlyOnDetector || o.on_detector !== false),
    [observations, onlyOnDetector]
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-cream/50 uppercase tracking-wider">Exposures covering</span>
          <span className="font-mono text-cream/70">{activeTarget ? activeTarget.name : "centre of view"}</span>
        </div>
        <div className="font-mono text-cream/60">
          RA {pos.ra.toFixed(4)}°, Dec {pos.dec.toFixed(4)}°
        </div>

        <div>
          <div className="text-cream/40 uppercase mb-1">Detector (infrared band)</div>
          <select
            value={detector ?? ""}
            onChange={(e) => setDetector(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full bg-ink border border-cream/20 rounded p-1 text-cream focus:outline-none focus:border-blue"
          >
            <option value="">All detectors (1 to 6)</option>
            <option value="1">Detector 1 (0.75 to 1.09 micron)</option>
            <option value="2">Detector 2 (1.10 to 1.62 micron)</option>
            <option value="3">Detector 3 (1.63 to 2.41 micron)</option>
            <option value="4">Detector 4 (2.42 to 3.82 micron)</option>
            <option value="5">Detector 5 (3.83 to 4.41 micron)</option>
            <option value="6">Detector 6 (4.42 to 5.00 micron)</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-cream/70">
          <input type="checkbox" checked={onlyOnDetector} onChange={(e) => setOnlyOnDetector(e.target.checked)} className="accent-blue" />
          Only frames where the object is on the detector
        </label>

        <button
          type="button"
          onClick={fetchObservations}
          disabled={isLoadingObs}
          className="w-full py-1.5 bg-blue text-cream uppercase tracking-wider rounded hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isLoadingObs ? "Asking the archive..." : "Search again"}
        </button>
      </div>

      {info && (
        <div className="p-2 bg-cream/5 border border-cream/10 rounded text-cream/60 leading-relaxed">
          Releases searched: {info.collections.map((c) => `${c.release}${c.ok ? "" : " (not reachable)"}`).join(", ")}.
          {info.uses_stored_result && " The archive was slow, so this is the last real result stored on this computer."}
        </div>
      )}

      {error && (
        <div role="alert" className="p-2 border border-blue rounded text-cream leading-relaxed">
          {error}
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-cream/50 uppercase tracking-wider">Exposures ({shown.length})</span>
          {shown.length > 0 && (
            <span className="text-cream/40 font-mono">
              {shown[0].month_label} to {shown[shown.length - 1].month_label}
            </span>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="p-3 border border-dashed border-cream/15 rounded text-cream/50 leading-relaxed">
            {isLoadingObs
              ? "Asking the archive..."
              : "The archive search finished and no frame covers this position with this detector. Try another detector or switch off the on-detector filter."}
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {shown.map((obs, idx) => {
              const isCurrent = idx === currentFrameIdx;
              const i = observations.indexOf(obs);
              const isA = i === selectedPair[0];
              const isB = i === selectedPair[1];
              return (
                <div
                  key={obs.plane_id + idx}
                  className={`p-2 rounded border cursor-pointer flex justify-between items-center ${
                    isCurrent ? "bg-blue/20 border-blue text-cream" : "bg-ink border-cream/15 text-cream/70 hover:border-cream/40"
                  }`}
                  onClick={() => setCurrentFrameIdx(idx)}
                >
                  <div className="space-y-0.5">
                    <div className="font-mono text-cream">
                      {obs.date_utc?.slice(0, 10)} · D{obs.detector} · {obs.wavelength_um?.toFixed(3)} micron
                    </div>
                    <div className="text-cream/50">
                      {obs.release} · exposure {obs.exposure_s ?? "?"} s
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(["A", "B"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPair(k === "A" ? [i, selectedPair[1]] : [selectedPair[0], i]);
                        }}
                        className={`px-1.5 py-0.5 rounded border uppercase ${
                          (k === "A" ? isA : isB) ? "bg-cream text-ink border-cream" : "border-cream/20 text-cream/60 hover:text-cream"
                        }`}
                        title={`Use as frame ${k} in Compare`}
                      >
                        {k}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMeta(obs);
                      }}
                      className="px-1.5 py-0.5 border border-cream/20 hover:border-cream/50 text-cream/70 rounded uppercase"
                    >
                      Info
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {meta && (
        <div className="p-2.5 bg-cream/5 border border-cream/20 rounded space-y-2">
          <div className="flex justify-between items-center border-b border-cream/10 pb-1">
            <span className="text-cream uppercase tracking-wider">About this exposure</span>
            <button type="button" onClick={() => setMeta(null)} className="text-cream/50 hover:text-cream uppercase">
              Close
            </button>
          </div>
          <div className="font-mono text-cream/70 space-y-1 break-all">
            <div>File: <span className="text-cream">{meta.access_url}</span></div>
            <div>Release: <span className="text-cream">{meta.release}</span> ({meta.collection})</div>
            <div>Observed: <span className="text-cream">{meta.date_utc} UTC</span> (MJD {meta.mjd_start?.toFixed(4)})</div>
            <div>
              Wavelength here: <span className="text-cream">{meta.wavelength_um?.toFixed(3)} micron</span>, width{" "}
              {meta.bandwidth_um?.toFixed(3)} micron. Detector band {meta.band_range_um?.[0]} to {meta.band_range_um?.[1]} micron.
            </div>
            <div>Pixel scale: <span className="text-cream">6.15 arcsec per pixel</span>. Beam size {meta.psf_fwhm_arcsec?.toFixed(1)} arcsec.</div>
            <div>On the detector: <span className="text-cream">{meta.on_detector === false ? "no" : "yes"}</span></div>
            {meta.flag_counts && (
              <div>
                Flags in the full frame: source {meta.flag_counts.SOURCE?.toLocaleString()}, saturated {meta.flag_counts.OVERFLOW?.toLocaleString()},
                non-functional {meta.flag_counts.NONFUNC?.toLocaleString()}. The source flag marks real sources and is never treated as a defect.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
