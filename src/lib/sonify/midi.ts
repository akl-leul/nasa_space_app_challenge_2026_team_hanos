/**
 * Standard MIDI file writer (format 0) with MIDI Tuning Standard messages, so a compatible synthesizer plays the
 * just ratios. A plain player ignores the tuning and plays equal temperament; the WAV and the note table carry the
 * exact frequencies. (docs/HANOS_METHOD_MASTERPROMPT.md sections 16 and 17.)
 */
import { TICKS_PER_BEAT, VOICES, type SonifyTrack } from "./mapping.ts";
import { justFrequency } from "./tuning.ts";

function vlq(n: number): number[] {
  let v = Math.max(0, Math.floor(n));
  const out = [v & 0x7f];
  while ((v >>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
  return out;
}

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const text = (s: string) => Array.from(new TextEncoder().encode(s));

/** Frequency as MTS data: nearest semitone below, then a 14-bit fraction of a semitone. */
export function mtsFrequencyBytes(hz: number): [number, number, number] {
  const semis = 69 + 12 * Math.log2(hz / 440);
  const base = Math.min(127, Math.max(0, Math.floor(semis)));
  const frac = Math.min(0x3fff, Math.round((semis - base) * 16384));
  return [base, (frac >> 7) & 0x7f, frac & 0x7f];
}

/** Two real-time single-note tuning messages of 64 keys each cover all 128 keys (tuning program 0). */
export function tuningMessages(): number[][] {
  const msgs: number[][] = [];
  for (let half = 0; half < 2; half++) {
    const body: number[] = [];
    for (let k = half * 64; k < half * 64 + 64; k++) body.push(k, ...mtsFrequencyBytes(justFrequency(k)));
    msgs.push([0xf0, 0x7f, 0x7f, 0x08, 0x02, 0x00, 64, ...body, 0xf7]);
  }
  return msgs;
}

export function encodeMidi(track: SonifyTrack, title: string): Uint8Array {
  type Ev = { tick: number; order: number; bytes: number[] };
  const evs: Ev[] = [];
  const tempo = Math.trunc(60_000_000 / track.bpm);
  evs.push({ tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff] });
  evs.push({ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(text(title).length), ...text(title)] });
  // select tuning bank 0, program 0 on every voice channel (RPN 4 then RPN 3), then send the tuning tables
  const voices = Object.values(VOICES);
  for (const v of voices) {
    for (const [rpn, val] of [[4, 0], [3, 0]] as const) {
      evs.push({ tick: 0, order: 1, bytes: [0xb0 | v.channel, 101, 0] });
      evs.push({ tick: 0, order: 1, bytes: [0xb0 | v.channel, 100, rpn] });
      evs.push({ tick: 0, order: 1, bytes: [0xb0 | v.channel, 6, val] });
    }
    evs.push({ tick: 0, order: 2, bytes: [0xc0 | v.channel, v.program] });
  }
  for (const m of tuningMessages()) evs.push({ tick: 0, order: 3, bytes: [m[0], ...vlq(m.length - 1), ...m.slice(1)] });

  for (const e of track.events) {
    if (e.kind !== "note" || !e.voice || e.pitch === undefined || e.onsetTick === undefined || e.durationTick === undefined) continue;
    const ch = VOICES[e.voice].channel;
    evs.push({ tick: e.onsetTick, order: 5, bytes: [0x90 | ch, e.pitch, Math.min(127, Math.max(1, e.velocity ?? 64))] });
    evs.push({ tick: e.onsetTick + e.durationTick, order: 4, bytes: [0x80 | ch, e.pitch, 0] });
  }
  evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const last = evs.length ? evs[evs.length - 1].tick : 0;
  evs.push({ tick: last, order: 9, bytes: [0xff, 0x2f, 0x00] });

  const body: number[] = [];
  let prev = 0;
  for (const e of evs) {
    body.push(...vlq(e.tick - prev), ...e.bytes);
    prev = e.tick;
  }
  const header = [...text("MThd"), ...u32(6), ...u16(0), ...u16(1), ...u16(TICKS_PER_BEAT)];
  const trk = [...text("MTrk"), ...u32(body.length), ...body];
  return Uint8Array.from([...header, ...trk]);
}
