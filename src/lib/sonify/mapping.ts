/**
 * Data-to-music mappings for the Cosmic Sound pop-up.
 * Follows docs/HANOS_METHOD_MASTERPROMPT.md: section 14 (station sweep), 15 (spectrum), 17 (timing and collisions).
 * Pure functions only: no DOM, no audio, so every number can be tested.
 */
import { describePitch, modeLadder } from "./tuning.ts";

// ---------------------------------------------------------------- shared helpers

export const TICKS_PER_BEAT = 960;
export const STATION_BPM = 36;
export const SPECTRUM_BPM = 30;
export const STATION_SCAN_BEATS = 24;
export const SPECTRUM_SCAN_BEATS = 10;
export const MAX_STARS = 140;
export const SPECTRUM_CHANNELS = 102;
export const WAVELENGTH_LOW_UM = 0.75;
export const WAVELENGTH_HIGH_UM = 5.0;

export const clip01 = (z: number): number => Math.min(1, Math.max(0, z));

/** Python's round(): ties go to the even integer. The method reproduces the original implementation's rounding. */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** numpy.percentile with linear interpolation. */
export function percentile(values: readonly number[], p: number): number {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const pos = ((v.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export type EventKind = "note" | "rest" | "skipped" | "merged";
export type EventRole = "catalog" | "measurement" | "harmony";
export type Voice = "vibraphone" | "strings";

export const VOICES: Record<Voice, { program: number; channel: number; label: string }> = {
  vibraphone: { program: 11, channel: 0, label: "Vibraphone" },
  strings: { program: 48, channel: 1, label: "Strings" },
};

/** One row of the note table: a note, a rest, a skipped object or a merged duplicate, with the reason. */
export interface SonifyEvent {
  id: string;
  kind: EventKind;
  role: EventRole;
  reason: string;
  name: string;
  /** Source quantities (units in the table headers). */
  raDeg?: number;
  decDeg?: number;
  magnitude?: number;
  channel?: number;
  wavelengthUm?: number;
  brightnessMjySr?: number | null;
  qualityValid?: boolean;
  /** Composition. */
  voice?: Voice;
  pitch?: number;
  velocity?: number;
  onsetBeats?: number;
  durationBeats?: number;
  onsetTick?: number;
  durationTick?: number;
  onsetSeconds?: number;
  durationSeconds?: number;
  adjustment?: string;
  mergedInto?: string;
  /** Tuning, for notes. */
  frequencyHz?: number;
  intervalFromC?: string;
  ratioToC?: string;
  octavesFromC4?: number;
  centsFromEqual?: number;
}

export interface MappingInfo {
  title: string;
  /** Axis meanings, for the legend and the table. */
  rows: Array<{ what: string; from: string; rule: string }>;
}

export interface SonifyTrack {
  kind: "stars" | "spectrum";
  bpm: number;
  scanBeats: number;
  scanSeconds: number;
  /** Seconds until the last note has finished (excluding reverb tail). */
  notesEndSeconds: number;
  events: SonifyEvent[];
  noteCount: number;
  supportCount: number;
  restCount: number;
  mergedCount: number;
  skippedCount: number;
  ladder: number[];
  info: MappingInfo;
  reverbMix: number;
  /** True when nothing sounds (for example no valid positive channel). */
  silent: boolean;
  /** Actual input ranges used, recorded for the table and the manifest. */
  ranges: Record<string, number | string>;
}

export interface SweepStar {
  id: string;
  name?: string;
  raDeg: number;
  decDeg: number;
  magnitude: number;
}

const PITCH_LOW = 48;
const PITCH_HIGH = 72;

function tempoSeconds(bpm: number): number {
  // The encoded MIDI tempo (microseconds per beat, an integer) decides the real timing.
  return Math.trunc(60_000_000 / bpm) / 1_000_000;
}

function finishTiming(e: SonifyEvent, bpm: number): void {
  if (e.onsetBeats === undefined || e.durationBeats === undefined) return;
  const spb = tempoSeconds(bpm);
  e.onsetTick = pyRound(e.onsetBeats * TICKS_PER_BEAT);
  e.durationTick = Math.max(1, pyRound(e.durationBeats * TICKS_PER_BEAT));
  e.onsetSeconds = (e.onsetTick / TICKS_PER_BEAT) * spb;
  e.durationSeconds = (e.durationTick / TICKS_PER_BEAT) * spb;
}

function addTuning(e: SonifyEvent): void {
  if (e.pitch === undefined) return;
  const t = describePitch(e.pitch);
  e.frequencyHz = t.frequencyHz;
  e.intervalFromC = t.intervalFromC;
  e.ratioToC = t.ratioToC;
  e.octavesFromC4 = t.octavesFromC4;
  e.centsFromEqual = t.centsFromEqual;
}

/**
 * Equal-pitch notes on one voice (method section 17): simultaneous ones merge into the strongest,
 * an overlapping one is shortened to the next retrigger. Every change is written on the event.
 */
export function resolveCollisions(events: SonifyEvent[]): void {
  const notes = events.filter((e) => e.kind === "note" && e.voice && e.pitch !== undefined);
  const groups = new Map<string, SonifyEvent[]>();
  for (const n of notes) {
    const key = `${n.voice}:${n.pitch}`;
    const g = groups.get(key);
    if (g) g.push(n);
    else groups.set(key, [n]);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => a.onsetTick! - b.onsetTick! || b.velocity! - a.velocity! || (a.id < b.id ? -1 : 1));
    let last: SonifyEvent | null = null;
    for (const e of g) {
      if (last && e.onsetTick === last.onsetTick) {
        e.kind = "merged";
        e.mergedInto = last.id;
        e.reason = "same pitch at the same moment; merged into the louder note";
        continue;
      }
      if (last && last.onsetTick! + last.durationTick! > e.onsetTick!) {
        last.durationTick = e.onsetTick! - last.onsetTick!;
        last.adjustment = "shortened for a retrigger of the same pitch";
      }
      last = e;
    }
  }
}

function recomputeSeconds(events: SonifyEvent[], bpm: number): void {
  const spb = tempoSeconds(bpm);
  for (const e of events) {
    if (e.kind !== "note") continue;
    e.durationBeats = e.durationTick! / TICKS_PER_BEAT;
    e.onsetSeconds = (e.onsetTick! / TICKS_PER_BEAT) * spb;
    e.durationSeconds = (e.durationTick! / TICKS_PER_BEAT) * spb;
  }
}

function summarize(events: SonifyEvent[]) {
  const count = (k: EventKind, role?: EventRole) => events.filter((e) => e.kind === k && (!role || e.role === role)).length;
  const notes = events.filter((e) => e.kind === "note");
  const notesEnd = notes.reduce((m, e) => Math.max(m, e.onsetSeconds! + e.durationSeconds!), 0);
  return {
    noteCount: notes.filter((e) => e.role !== "harmony").length,
    supportCount: notes.filter((e) => e.role === "harmony").length,
    restCount: count("rest"),
    mergedCount: count("merged"),
    skippedCount: count("skipped"),
    notesEnd,
  };
}

// ---------------------------------------------------------------- station sweep (stars)

/** The brightest stars, ascending magnitude with stable id tie-breaking; the rest are listed as skipped. */
export function selectStars(stars: readonly SweepStar[], max = MAX_STARS): { chosen: SweepStar[]; skipped: SweepStar[]; invalid: SweepStar[] } {
  const valid: SweepStar[] = [];
  const invalid: SweepStar[] = [];
  for (const s of stars) {
    if (Number.isFinite(s.raDeg) && Number.isFinite(s.decDeg) && Number.isFinite(s.magnitude)) valid.push(s);
    else invalid.push(s);
  }
  valid.sort((a, b) => a.magnitude - b.magnitude || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { chosen: valid.slice(0, max), skipped: valid.slice(max), invalid };
}

/**
 * The scan starts immediately after the largest circular gap in right ascension, so the 0/360 seam never cuts a region.
 * Returns the start and a function that unwraps any RA into [start, start + 360).
 */
export function scanStart(raValues: readonly number[]): number {
  const u = Array.from(new Set(raValues.map((r) => ((r % 360) + 360) % 360))).sort((a, b) => a - b);
  if (u.length === 0) return 0;
  if (u.length === 1) return u[0];
  let best = -1;
  let bestGap = -1;
  for (let i = 0; i < u.length; i++) {
    const gap = i < u.length - 1 ? u[i + 1] - u[i] : u[0] + 360 - u[u.length - 1];
    if (gap > bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return u[(best + 1) % u.length];
}

export const unwrapRa = (ra: number, start: number): number => start + ((((ra - start) % 360) + 360) % 360);

export interface StationMapping {
  start: number;
  minUnwrapped: number;
  span: number;
  decMin: number;
  decSpan: number;
  magBright: number;
  magFaint: number;
}

export function buildStationTrack(allStars: readonly SweepStar[], regionName: string): { track: SonifyTrack; mapping: StationMapping } {
  const { chosen, skipped, invalid } = selectStars(allStars);
  const ladder = modeLadder(PITCH_LOW, PITCH_HIGH);
  const events: SonifyEvent[] = [];

  const start = scanStart(chosen.map((s) => s.raDeg));
  const unwrapped = chosen.map((s) => unwrapRa(s.raDeg, start));
  const minU = unwrapped.length ? Math.min(...unwrapped) : 0;
  const maxU = unwrapped.length ? Math.max(...unwrapped) : 0;
  const span = maxU - minU > 0 ? maxU - minU : 1; // a single star (or equal positions) must not divide by zero
  const decs = chosen.map((s) => s.decDeg);
  const decMin = decs.length ? Math.min(...decs) : 0;
  const decRaw = decs.length ? Math.max(...decs) - decMin : 0;
  const decSpan = decRaw > 0 ? decRaw : 1; // equal declinations map to the low end
  const mags = chosen.map((s) => s.magnitude);
  const magBright = percentile(mags, 5);
  let magFaint = percentile(mags, 95);
  if (!(magFaint > magBright)) magFaint = magBright + 1; // collapsed range

  chosen.forEach((s, i) => {
    const u = clip01((s.decDeg - decMin) / decSpan);
    const pitch = ladder[pyRound(u * (ladder.length - 1))];
    const um = clip01((magFaint - s.magnitude) / (magFaint - magBright));
    const velocity = Math.trunc(35 + 85 * Math.sqrt(um));
    const e: SonifyEvent = {
      id: s.id,
      kind: "note",
      role: "catalog",
      reason: "catalogue star",
      name: s.name ?? s.id,
      raDeg: s.raDeg,
      decDeg: s.decDeg,
      magnitude: s.magnitude,
      voice: "vibraphone",
      pitch,
      velocity,
      onsetBeats: (STATION_SCAN_BEATS * (unwrapped[i] - minU)) / span,
      durationBeats: 1,
    };
    finishTiming(e, STATION_BPM);
    addTuning(e);
    events.push(e);
  });

  resolveCollisions(events);
  recomputeSeconds(events, STATION_BPM);
  for (const s of skipped) {
    events.push({ id: s.id, kind: "skipped", role: "catalog", reason: `fainter than the ${MAX_STARS} brightest stars chosen for listening`, name: s.name ?? s.id, raDeg: s.raDeg, decDeg: s.decDeg, magnitude: s.magnitude });
  }
  for (const s of invalid) {
    events.push({ id: s.id, kind: "skipped", role: "catalog", reason: "missing or invalid position or magnitude", name: s.name ?? s.id, raDeg: s.raDeg, decDeg: s.decDeg, magnitude: s.magnitude });
  }

  const sum = summarize(events);
  const spb = tempoSeconds(STATION_BPM);
  const track: SonifyTrack = {
    kind: "stars",
    bpm: STATION_BPM,
    scanBeats: STATION_SCAN_BEATS,
    scanSeconds: STATION_SCAN_BEATS * spb,
    notesEndSeconds: sum.notesEnd,
    events,
    noteCount: sum.noteCount,
    supportCount: sum.supportCount,
    restCount: sum.restCount,
    mergedCount: sum.mergedCount,
    skippedCount: sum.skippedCount,
    ladder,
    reverbMix: 0.25,
    silent: sum.noteCount === 0,
    info: {
      title: `${regionName}: catalogue stars`,
      rows: [
        { what: "Left to right", from: "right ascension", rule: "scan starts after the largest gap, so the 0/360 seam never cuts the region" },
        { what: "Height of the note", from: "declination", rule: "this region's lowest to highest star, onto a C Lydian scale (C3 to C5)" },
        { what: "Loudness", from: "apparent magnitude", rule: "brighter is louder (5th to 95th percentile of this region)" },
        { what: "Length", from: "fixed", rule: "one beat per star" },
        { what: "Tuning and tempo", from: "composition", rule: `just intonation on C, ${STATION_BPM} beats per minute` },
      ],
    },
    ranges: { raStartDeg: start, raSpanDeg: span, decMinDeg: decMin, decSpanDeg: decSpan, magnitudeBright: magBright, magnitudeFaint: magFaint, starsConsidered: allStars.length, starsSounded: chosen.length },
  };
  return { track, mapping: { start, minUnwrapped: minU, span, decMin, decSpan, magBright, magFaint } };
}

// ---------------------------------------------------------------- SPHEREx spectrum

export interface SpectrumChannel {
  /** One-based, as in the archive. */
  channel: number;
  wavelengthUm: number;
  /** Surface brightness in MJy/sr, null when missing. */
  brightnessMjySr: number | null;
  valid: boolean;
  blank: boolean;
}

export function wavelengthToPitch(wavelengthUm: number, ladder: readonly number[]): number {
  const u = clip01(1 - Math.log(wavelengthUm / WAVELENGTH_LOW_UM) / Math.log(WAVELENGTH_HIGH_UM / WAVELENGTH_LOW_UM));
  return ladder[pyRound(u * (ladder.length - 1))];
}

export function buildSpectrumTrack(channels: readonly SpectrumChannel[], label: string): SonifyTrack {
  if (channels.length !== SPECTRUM_CHANNELS) throw new Error(`A SPHEREx cube spectrum has ${SPECTRUM_CHANNELS} channels, got ${channels.length}`);
  const ladder = modeLadder(PITCH_LOW, PITCH_HIGH);
  const slot = SPECTRUM_SCAN_BEATS / SPECTRUM_CHANNELS;
  const eligible = channels.filter((c) => !c.blank && c.valid && c.brightnessMjySr !== null && Number.isFinite(c.brightnessMjySr) && c.brightnessMjySr > 0).map((c) => c.brightnessMjySr as number);
  const low = eligible.length ? percentile(eligible, 5) : NaN;
  let high = eligible.length ? percentile(eligible, 95) : NaN;
  if (eligible.length && !(high > low)) high = low + 1;

  const events: SonifyEvent[] = [];
  channels.forEach((c, i) => {
    const base: SonifyEvent = {
      id: `ch${c.channel}`,
      kind: "note",
      role: "measurement",
      reason: "",
      name: `channel ${c.channel}`,
      channel: c.channel,
      wavelengthUm: c.wavelengthUm,
      brightnessMjySr: c.brightnessMjySr,
      qualityValid: c.valid,
    };
    let rest = "";
    if (c.blank || c.channel === 51 || c.channel === 52) rest = "blank channel next to the dichroic (no data by design)";
    else if (!c.valid) rest = "rejected by the quality mask";
    else if (c.brightnessMjySr === null || !Number.isFinite(c.brightnessMjySr)) rest = "missing value";
    else if (c.brightnessMjySr <= 0) rest = "zero or negative brightness (rests under the positive-only rule)";
    if (rest) {
      events.push({ ...base, kind: "rest", reason: rest });
      return;
    }
    const b = c.brightnessMjySr as number;
    const uB = Math.pow(clip01((b - low) / (high - low)), 0.6);
    const velocity = Math.trunc(45 + 75 * uB);
    const pitch = wavelengthToPitch(c.wavelengthUm, ladder);
    const durationBeats = Math.max(0.25, 1.5 * slot);
    const melody: SonifyEvent = { ...base, reason: "SPHEREx channel", voice: "vibraphone", pitch, velocity, onsetBeats: i * slot, durationBeats };
    finishTiming(melody, SPECTRUM_BPM);
    addTuning(melody);
    events.push(melody);
    if (uB > 0.65) {
      const quantized = melody.durationTick! / TICKS_PER_BEAT;
      const support: SonifyEvent = {
        ...base,
        id: `ch${c.channel}-support`,
        role: "harmony",
        reason: "composition: octave support under a bright channel (not a second measurement)",
        voice: "strings",
        pitch: pitch - 12,
        velocity: Math.trunc(0.6 * velocity),
        onsetBeats: i * slot,
        durationBeats: 2.5 * quantized,
      };
      finishTiming(support, SPECTRUM_BPM);
      addTuning(support);
      events.push(support);
    }
  });

  resolveCollisions(events);
  recomputeSeconds(events, SPECTRUM_BPM);
  const sum = summarize(events);
  const spb = tempoSeconds(SPECTRUM_BPM);
  return {
    kind: "spectrum",
    bpm: SPECTRUM_BPM,
    scanBeats: SPECTRUM_SCAN_BEATS,
    scanSeconds: SPECTRUM_SCAN_BEATS * spb,
    notesEndSeconds: sum.notesEnd,
    events,
    noteCount: sum.noteCount,
    supportCount: sum.supportCount,
    restCount: sum.restCount,
    mergedCount: sum.mergedCount,
    skippedCount: sum.skippedCount,
    ladder,
    reverbMix: 0.3,
    silent: sum.noteCount === 0,
    info: {
      title: `${label}: SPHEREx spectrum`,
      rows: [
        { what: "Left to right", from: "channel order", rule: "102 equal slots (not observing time); wavelength grows to the right" },
        { what: "Height of the note", from: "wavelength", rule: "0.75 to 5 micron on a log scale: short wavelength high, long wavelength low" },
        { what: "Loudness", from: "surface brightness (MJy/sr)", rule: "positive quality-valid channels only, 5th to 95th percentile, power 0.6" },
        { what: "Silence", from: "blank, masked, missing, non-positive", rule: "rests; nothing is filled in or interpolated" },
        { what: "Strings below", from: "composition", rule: "an octave below the melody on bright channels; decoration, not data" },
      ],
    },
    ranges: { brightnessLowMjySr: Number.isFinite(low) ? low : "none", brightnessHighMjySr: Number.isFinite(high) ? high : "none", positiveValidChannels: eligible.length },
  };
}

/** The brightest candidate is not necessarily the best sample: the one with the most positive valid channels is used. */
export function countPositiveValid(channels: readonly SpectrumChannel[]): number {
  return channels.filter((c) => !c.blank && c.valid && c.brightnessMjySr !== null && Number.isFinite(c.brightnessMjySr) && c.brightnessMjySr > 0).length;
}
