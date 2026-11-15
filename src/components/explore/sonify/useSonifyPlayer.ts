"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SonifyTrack } from "@/lib/sonify/mapping";
import { createGraph, scheduleTrack, type AudioGraph } from "@/lib/sonify/synth";

export type PlayerStatus = "idle" | "playing" | "paused" | "ended";

/** Tempo multipliers. Speed moves the notes in time; it never changes pitch. */
export const SPEEDS = [
  { label: "Slow", factor: 1 },
  { label: "Medium", factor: 1.5 },
  { label: "Fast", factor: 2 },
] as const;

const volumeToGain = (v: number): number => (v / 100) * 0.8; // volume limit: the slider can never go past 0.8

/**
 * Plays a track with the Web Audio API. The scan position is read from the audio clock, so the picture and the sound
 * cannot drift apart. Audio starts only inside a user gesture (the Play click).
 */
export function useSonifyPlayer(track: SonifyTrack | null) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [position, setPosition] = useState(0); // nominal seconds into the track
  const [speedIndex, setSpeedIndex] = useState(0);
  const [volume, setVolumeState] = useState(40);

  const ctxRef = useRef<AudioContext | null>(null);
  const graphRef = useRef<AudioGraph | null>(null);
  const rafRef = useRef(0);
  const startCtxRef = useRef(0);
  const offsetRef = useRef(0);
  const speedRef = useRef(1);
  const volumeRef = useRef(40);
  const statusRef = useRef<PlayerStatus>("idle");
  const trackRef = useRef<SonifyTrack | null>(track);
  const tickRef = useRef<() => void>(() => undefined);
  const schedule = () => requestAnimationFrame(() => tickRef.current());

  const setStatusBoth = useCallback((s: PlayerStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const endSeconds = useCallback((t: SonifyTrack) => Math.max(t.scanSeconds, t.notesEndSeconds + 1.2), []);

  const closeContext = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const ctx = ctxRef.current;
    ctxRef.current = null;
    graphRef.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => undefined);
  }, []);

  const loop = useCallback(() => {
    const ctx = ctxRef.current;
    const t = trackRef.current;
    if (!ctx || !t) return;
    const pos = offsetRef.current + Math.max(0, ctx.currentTime - startCtxRef.current) * speedRef.current;
    if (pos >= endSeconds(t)) {
      setPosition(t.scanSeconds);
      closeContext();
      setStatusBoth("ended");
      return;
    }
    setPosition(Math.min(pos, t.scanSeconds));
    rafRef.current = schedule();
  }, [closeContext, endSeconds, setStatusBoth]);

  const begin = useCallback(
    (offset: number) => {
      const t = trackRef.current;
      if (!t) return;
      closeContext();
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const graph = createGraph(ctx, t.reverbMix, volumeToGain(volumeRef.current), true);
      const startAt = ctx.currentTime + 0.08;
      scheduleTrack(ctx, graph.input, t, { scale: 1 / speedRef.current, offset, startAt });
      ctxRef.current = ctx;
      graphRef.current = graph;
      startCtxRef.current = startAt;
      offsetRef.current = offset;
      setStatusBoth("playing");
      rafRef.current = schedule();
    },
    [closeContext, setStatusBoth]
  );

  useEffect(() => {
    tickRef.current = loop;
  }, [loop]);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  const play = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    if (statusRef.current === "paused" && ctxRef.current) {
      ctxRef.current.resume().then(() => {
        setStatusBoth("playing");
        rafRef.current = schedule();
      });
      return;
    }
    const from = statusRef.current === "idle" ? offsetRef.current : 0;
    begin(from);
  }, [begin, setStatusBoth]);

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || statusRef.current !== "playing") return;
    cancelAnimationFrame(rafRef.current);
    ctx.suspend().then(() => setStatusBoth("paused"));
  }, [setStatusBoth]);

  const stop = useCallback(() => {
    closeContext();
    offsetRef.current = 0;
    setPosition(0);
    setStatusBoth("idle");
  }, [closeContext, setStatusBoth]);

  const seek = useCallback(
    (fraction: number) => {
      const t = trackRef.current;
      if (!t) return;
      const pos = Math.min(1, Math.max(0, fraction)) * t.scanSeconds;
      setPosition(pos);
      if (statusRef.current === "playing") begin(pos);
      else {
        closeContext();
        offsetRef.current = pos;
        setStatusBoth("idle");
      }
    },
    [begin, closeContext, setStatusBoth]
  );

  const setSpeed = useCallback(
    (i: number) => {
      speedRef.current = SPEEDS[i].factor;
      setSpeedIndex(i);
      if (statusRef.current === "playing" && ctxRef.current) {
        const pos = offsetRef.current + Math.max(0, ctxRef.current.currentTime - startCtxRef.current) * (SPEEDS[speedIndex].factor);
        begin(pos);
      }
    },
    [begin, speedIndex]
  );

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v;
    setVolumeState(v);
    const g = graphRef.current;
    const ctx = ctxRef.current;
    if (g && ctx) g.master.gain.setTargetAtTime(volumeToGain(v), ctx.currentTime, 0.03);
  }, []);

  // a new track (another region or mode) starts from silence
  useEffect(() => {
    closeContext();
    offsetRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the player when the track changes
    setPosition(0);
    setStatusBoth("idle");
  }, [track, closeContext, setStatusBoth]);

  useEffect(() => closeContext, [closeContext]);

  return { status, position, speedIndex, volume, play, pause, stop, seek, setSpeed, setVolume };
}
