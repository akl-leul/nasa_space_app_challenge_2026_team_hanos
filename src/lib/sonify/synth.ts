/**
 * Web Audio synthesis: additive vibraphone and string timbres, deterministic envelopes, a deterministic generated
 * reverb. The same scheduling code plays live and renders the WAV (method section 18). Frequencies come from the
 * just-intonation ratio table, never from equal temperament. Browser-only.
 */
import type { SonifyEvent, SonifyTrack, Voice } from "./mapping.ts";
import { encodeWav, peakNormalize } from "./wav.ts";

interface Timbre {
  partials: Array<{ ratio: number; gain: number; decay: number }>;
  attack: number;
  release: number;
  sustain: boolean;
  level: number;
}

const TIMBRES: Record<Voice, Timbre> = {
  vibraphone: {
    partials: [
      { ratio: 1, gain: 1, decay: 2.4 },
      { ratio: 4, gain: 0.3, decay: 0.7 },
      { ratio: 10, gain: 0.09, decay: 0.25 },
    ],
    attack: 0.004,
    release: 0.5,
    sustain: false,
    level: 0.2,
  },
  strings: {
    partials: [
      { ratio: 1, gain: 1, decay: 0 },
      { ratio: 2, gain: 0.5, decay: 0 },
      { ratio: 3, gain: 0.3, decay: 0 },
      { ratio: 4, gain: 0.18, decay: 0 },
    ],
    attack: 0.3,
    release: 0.9,
    sustain: true,
    level: 0.12,
  },
};

export const OUTPUT_SAMPLE_RATE = 22050;
const TAIL_SECONDS = 3.0;

/** A generated room: decaying noise from a fixed seed, so the same track always renders the same sound. */
function impulse(ctx: BaseAudioContext, seconds = 2.0): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = seed / 0x80000000 - 1;
    d[i] = noise * Math.pow(1 - i / len, 3);
  }
  return buf;
}

export interface AudioGraph {
  input: GainNode;
  master: GainNode;
}

export function createGraph(ctx: BaseAudioContext, reverbMix: number, masterGain: number, limit: boolean): AudioGraph {
  const input = ctx.createGain();
  const master = ctx.createGain();
  master.gain.value = masterGain;
  const dry = ctx.createGain();
  dry.gain.value = 1;
  const wet = ctx.createGain();
  wet.gain.value = reverbMix;
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx);
  input.connect(dry).connect(master);
  input.connect(conv).connect(wet).connect(master);
  if (limit) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
  } else {
    master.connect(ctx.destination);
  }
  return { input, master };
}

export interface ScheduleOptions {
  /** Seconds of real time per nominal second (1 = nominal tempo, 0.5 = twice as fast). */
  scale: number;
  /** Nominal position to start from (seconds into the track). */
  offset: number;
  /** Context time that corresponds to the offset. */
  startAt: number;
}

function scheduleNote(ctx: BaseAudioContext, out: AudioNode, e: SonifyEvent, o: ScheduleOptions): void {
  if (e.kind !== "note" || !e.voice || e.frequencyHz === undefined || e.onsetSeconds === undefined || e.durationSeconds === undefined) return;
  const t = o.startAt + (e.onsetSeconds - o.offset) * o.scale;
  const gate = e.durationSeconds * o.scale;
  if (e.onsetSeconds < o.offset - 1e-6) return; // already played before the seek position
  const tb = TIMBRES[e.voice];
  const amp = Math.pow((e.velocity ?? 64) / 127, 1.4) * tb.level;
  const nyquist = ctx.sampleRate / 2;
  const end = t + gate + tb.release;
  for (const p of tb.partials) {
    const f = e.frequencyHz * p.ratio;
    if (f >= nyquist) continue; // no partial at or above Nyquist
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    const peak = amp * p.gain;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + tb.attack);
    if (tb.sustain) {
      g.gain.setValueAtTime(peak, Math.max(t + tb.attack, t + gate));
      g.gain.linearRampToValueAtTime(0, end);
    } else {
      g.gain.setTargetAtTime(0, t + tb.attack, p.decay / 4);
      g.gain.setValueAtTime(peak * Math.exp(-(gate + 0.0) / (p.decay / 4)), t + gate);
      g.gain.linearRampToValueAtTime(0, end);
    }
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(end + 0.05);
  }
}

export function scheduleTrack(ctx: BaseAudioContext, out: AudioNode, track: SonifyTrack, o: ScheduleOptions): void {
  for (const e of track.events) scheduleNote(ctx, out, e, o);
}

/** Renders the track offline at nominal tempo: mono, 16-bit, 22,050 Hz, peak-normalised to 0.95, 3 s of padding. */
export async function renderTrackWav(track: SonifyTrack): Promise<Uint8Array> {
  const seconds = Math.max(1, Math.max(track.scanSeconds, track.notesEndSeconds) + TAIL_SECONDS);
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * OUTPUT_SAMPLE_RATE), OUTPUT_SAMPLE_RATE);
  const graph = createGraph(ctx, track.reverbMix, 0.8, false);
  scheduleTrack(ctx, graph.input, track, { scale: 1, offset: 0, startAt: 0 });
  const buf = await ctx.startRendering();
  const samples = peakNormalize(buf.getChannelData(0), 0.95);
  return encodeWav(samples, OUTPUT_SAMPLE_RATE);
}
