"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConstellationInfo, StarRecord } from "@/types/sky";
import { noteTableCsv } from "@/lib/sonify/csv";
import { buildSpectrumTrack, buildStationTrack, type SweepStar } from "@/lib/sonify/mapping";
import { encodeMidi } from "@/lib/sonify/midi";
import { buildRegionGeometry } from "@/lib/sonify/region";
import { renderTrackWav } from "@/lib/sonify/synth";
import { noteLabel } from "@/lib/sonify/tuning";
import { NoteTable, nowPlaying, PitchGraph, RegionSweep, SpectrumPlot } from "./sonify/SonifyPanels";
import { SPEEDS, useSonifyPlayer } from "./sonify/useSonifyPlayer";
import { pickCandidates, useRegionSpectrum } from "./sonify/useRegionSpectrum";

export interface SonificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  region: { abbr: string; name: string };
  constellations: ConstellationInfo[];
  stars: StarRecord[];
  constellationPolygons: Record<string, number[][][]> | null;
  onOpenTimelapse: () => void;
}

type Mode = "stars" | "spectrum";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const btn = "px-2.5 py-1.5 border border-cream/35 hover:border-cream text-cream uppercase tracking-wider rounded cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40 disabled:cursor-not-allowed";

export function SonificationDialog({ isOpen, onClose, region, stars, constellationPolygons, onOpenTimelapse }: SonificationDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>("stars");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // every catalogue star of the region (membership comes from the catalogue, not from the picture)
  const regionStars = useMemo<SweepStar[]>(
    () =>
      stars
        .filter((s) => s.con === region.abbr)
        .map((s) => ({
          id: `HIP ${s.hip}`,
          name: s.label && s.label.trim() ? `${s.label.trim()} ${region.abbr}` : `HIP ${s.hip}`,
          raDeg: s.ra,
          decDeg: s.dec,
          magnitude: s.mag,
        })),
    [stars, region.abbr]
  );

  const station = useMemo(() => buildStationTrack(regionStars, region.name), [regionStars, region.name]);
  const candidates = useMemo(() => pickCandidates(regionStars), [regionStars]);
  const { state: spec, retry } = useRegionSpectrum(mode === "spectrum", candidates);
  const spectrumTrack = useMemo(() => (spec.pick ? buildSpectrumTrack(spec.pick.channels, `${region.name} · ${spec.pick.star.name}`) : null), [spec.pick, region.name]);

  const track = mode === "stars" ? station.track : spectrumTrack;
  const player = useSonifyPlayer(track);
  const geometry = useMemo(() => {
    const ids = new Set(station.track.events.filter((e) => e.kind === "note").map((e) => e.id));
    return buildRegionGeometry(regionStars, station.mapping, ids, constellationPolygons?.[region.abbr] ?? null);
  }, [regionStars, station, constellationPolygons, region.abbr]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const close = useCallback(() => {
    player.stop();
    onClose();
  }, [player, onClose]);

  // focus, Escape, Tab trap and Space (play or pause)
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>("button");
    first?.focus();
    return () => previous?.focus?.();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === " " && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLElement && e.target.tagName === "SUMMARY")) {
        e.preventDefault();
        if (player.status === "playing") player.pause();
        else if (track && !track.silent) player.play();
        return;
      }
      if (e.key === "Tab") {
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary, a[href]');
        const list = nodes ? Array.from(nodes) : [];
        if (!list.length) return;
        const firstEl = list[0];
        const lastEl = list[list.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close, player, track]);

  if (!isOpen) return null;

  const slug = `hanos-${region.abbr.toLowerCase()}-${mode}`;
  const speed = SPEEDS[player.speedIndex];
  const now = track && (player.status === "playing" || player.status === "paused" || player.position > 0) ? nowPlaying(track, player.position) : null;
  const frac = track ? Math.min(1, player.position / track.scanSeconds) : 0;

  const downloadMidi = () => {
    if (!track) return;
    saveBlob(new Blob([encodeMidi(track, track.info.title) as BlobPart], { type: "audio/midi" }), `${slug}.mid`);
    showToast("MIDI saved");
  };
  const downloadWav = async () => {
    if (!track) return;
    setBusy("Rendering the WAV...");
    try {
      const wav = await renderTrackWav(track);
      saveBlob(new Blob([wav as BlobPart], { type: "audio/wav" }), `${slug}.wav`);
      showToast("WAV saved");
    } catch {
      showToast("Could not render the WAV in this browser");
    } finally {
      setBusy(null);
    }
  };
  const downloadCsv = () => {
    if (!track) return;
    saveBlob(new Blob([noteTableCsv(track)], { type: "text/csv" }), `${slug}-notes.csv`);
    showToast("Note table saved");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/80 backdrop-blur-xs select-none" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="sound-dialog-title" className="relative max-w-[760px] w-full max-h-[94vh] overflow-y-auto bg-ink border border-cream/30 p-4 sm:p-5 text-cream rounded-sm space-y-3">
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-cream/20 pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue" />
              <h2 id="sound-dialog-title" className="tracking-widest uppercase text-cream">
                Cosmic sound · {region.name}
              </h2>
            </div>
            <div className="text-cream/60 mt-1 tracking-wide">
              {mode === "stars" ? `${station.track.noteCount} of ${regionStars.length} catalogue stars sound` : spec.pick ? `SPHEREx spectrum read at ${spec.pick.star.name}` : "SPHEREx spectrum"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="What makes the sound" className="flex border border-cream/35 rounded overflow-hidden">
              {(["stars", "spectrum"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`px-2.5 py-1.5 uppercase tracking-wider cursor-pointer focus-visible:outline-2 focus-visible:outline-blue ${mode === m ? "bg-blue text-cream" : "text-cream/75 hover:text-cream"}`}>
                  {m === "stars" ? "Stars" : "SPHEREx spectrum"}
                </button>
              ))}
            </div>
            <button type="button" onClick={close} aria-label="Close sound pop-up" className="w-6 h-6 flex items-center justify-center border border-cream/35 hover:border-cream rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-blue">
              ✕
            </button>
          </div>
        </div>

        {/* legend */}
        {track && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-cream/70 tracking-wide" aria-label="What the picture and the sound mean">
            {track.info.rows.slice(0, 3).map((r) => (
              <span key={r.what}>
                <span className="text-cream">{r.what}:</span> {r.from}
              </span>
            ))}
          </div>
        )}

        {/* the region or the spectrum */}
        {mode === "stars" && <RegionSweep geometry={geometry} mapping={station.mapping} track={station.track} position={player.position} regionName={region.name} />}
        {mode === "spectrum" && spectrumTrack && spec.pick && <SpectrumPlot track={spectrumTrack} position={player.position} label={region.name} />}
        {mode === "spectrum" && !spectrumTrack && (
          <div className="border border-cream/20 rounded p-4 min-h-[140px] flex flex-col items-center justify-center gap-2 text-center leading-relaxed" role="status">
            {spec.status === "error" ? (
              <>
                <span>{spec.error}</span>
                <button type="button" onClick={retry} className={btn}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <span>Reading the real SPHEREx spectrum at {spec.total || candidates.length} positions in {region.name}...</span>
                <span className="text-cream/60 font-mono">
                  {spec.checked} of {spec.total || candidates.length} read{spec.failed ? ` · ${spec.failed} did not answer` : ""}
                </span>
                <div className="w-48 h-1 bg-cream/15 rounded overflow-hidden">
                  <div className="h-full bg-blue transition-all" style={{ width: `${((spec.checked || 0) / Math.max(1, spec.total || candidates.length)) * 100}%` }} />
                </div>
                <span className="text-cream/60">The first read of a position takes a while. The Stars mode plays at once.</span>
              </>
            )}
          </div>
        )}

        {/* pitch graph */}
        {track && (
          <>
            <div className="flex items-baseline justify-between text-cream/60 uppercase tracking-widest">
              <span>Pitch graph</span>
              <span className="normal-case tracking-normal font-mono text-cream/80" aria-live="off">
                {track.silent ? "no usable sample here: silent" : now ? `${now.name} · ${noteLabel(now.pitch ?? 60)} ${now.frequencyHz?.toFixed(1)} Hz` : "ready"}
              </span>
            </div>
            <PitchGraph track={track} position={player.position} />
          </>
        )}

        {/* controls */}
        {track && (
          <div className="flex flex-wrap items-center gap-2">
            {player.status === "playing" ? (
              <button type="button" onClick={player.pause} className={`${btn} bg-blue border-blue`} disabled={track.silent}>
                Pause
              </button>
            ) : (
              <button type="button" onClick={player.play} className={`${btn} bg-blue border-blue`} disabled={track.silent}>
                {player.status === "paused" ? "Resume" : player.status === "ended" ? "Play again" : "Play"}
              </button>
            )}
            <button type="button" onClick={player.stop} className={btn}>
              Stop
            </button>
            <div role="group" aria-label="Speed" className="flex border border-cream/35 rounded overflow-hidden">
              {SPEEDS.map((s, i) => (
                <button key={s.label} type="button" aria-pressed={player.speedIndex === i} onClick={() => player.setSpeed(i)} className={`px-2 py-1.5 uppercase tracking-wider cursor-pointer focus-visible:outline-2 focus-visible:outline-blue ${player.speedIndex === i ? "bg-cream text-ink" : "text-cream/75 hover:text-cream"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <span className="text-cream/60 font-mono">{Math.round(track.bpm * speed.factor)} beats per minute</span>
            <label className="flex items-center gap-1.5 text-cream/75 uppercase tracking-wider">
              Volume limit
              <input type="range" min={0} max={100} value={player.volume} onChange={(e) => player.setVolume(parseInt(e.target.value))} className="w-24 accent-blue" aria-label="Volume limit" />
            </label>
          </div>
        )}
        {track && (
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={1000} value={Math.round(frac * 1000)} onChange={(e) => player.seek(parseInt(e.target.value) / 1000)} className="flex-1 accent-blue" aria-label="Scan position" />
            <span className="font-mono text-cream/70 min-w-[110px] text-right">
              {player.position.toFixed(0)} s of {track.scanSeconds.toFixed(0)} s
            </span>
          </div>
        )}

        {/* downloads and links */}
        {track && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={downloadMidi} className={btn} disabled={track.silent}>
              MIDI
            </button>
            <button type="button" onClick={downloadWav} className={btn} disabled={track.silent || busy !== null}>
              {busy ?? "WAV"}
            </button>
            <button type="button" onClick={downloadCsv} className={btn}>
              Note table (CSV)
            </button>
            <button
              type="button"
              onClick={() => {
                player.stop();
                onOpenTimelapse();
              }}
              className={`${btn} ml-auto`}
            >
              Open time-lapse
            </button>
          </div>
        )}

        {/* the text equivalent and the mapping key */}
        {track && <NoteTable track={track} />}
        {track && (
          <details className="border border-cream/20 rounded">
            <summary className="px-2 py-1.5 cursor-pointer tracking-wider uppercase text-cream/80 hover:text-cream focus-visible:outline-2 focus-visible:outline-blue">How the data becomes sound</summary>
            <table className="w-full text-left border-t border-cream/15">
              <tbody className="divide-y divide-cream/10">
                {track.info.rows.map((r) => (
                  <tr key={r.what}>
                    <td className="p-1.5 text-cream whitespace-nowrap align-top">{r.what}</td>
                    <td className="p-1.5 text-cream/70 whitespace-nowrap align-top">{r.from}</td>
                    <td className="p-1.5 text-cream/70">{r.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        {/* honesty */}
        <div className="text-cream/60 leading-relaxed space-y-1">
          {mode === "stars" ? (
            <p>Catalogue data (Hipparcos and Yale), not SPHEREx. Stars fainter than the 140 brightest are listed in the table but stay silent.</p>
          ) : (
            spec.pick && (
              <>
                <p>
                  Real SPHEREx data: {spec.pick.label}. Chosen because it has the most usable channels ({spec.pick.positiveValid} of 102) among {candidates.length} positions tried
                  {spec.failed ? `; ${spec.failed} could not be read` : ""}. Channels 51 and 52 are blank by design and stay silent. This does not show a detection.
                </p>
                {spec.pick.warnings.slice(0, 3).map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </>
            )
          )}
          <p>Sound does not travel through space. This sound is a chosen mapping of data, not a recording. Right ascension is drawn growing to the right, the opposite of most sky charts.</p>
        </div>

        {toast && (
          <div role="status" className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-cream text-ink px-3 py-1.5 rounded">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

export default SonificationDialog;
