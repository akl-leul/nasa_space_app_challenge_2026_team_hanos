// Run with: npm test   (Node's built-in test runner; no extra dependency)
import assert from "node:assert/strict";
import { test } from "node:test";
import { noteTableCsv, NOTE_TABLE_HEADERS } from "./csv.ts";
import { buildSpectrumTrack, buildStationTrack, countPositiveValid, percentile, pyRound, scanStart, unwrapRa, wavelengthToPitch, type SpectrumChannel, type SweepStar } from "./mapping.ts";
import { buildRegionGeometry, fitMap } from "./region.ts";
import { encodeMidi, mtsFrequencyBytes, tuningMessages } from "./midi.ts";
import { describePitch, justFrequency, modeLadder, REFERENCE_C4_HZ } from "./tuning.ts";
import { encodeWav, peakNormalize } from "./wav.ts";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test("pyRound sends ties to the even integer, like the original implementation", () => {
  assert.equal(pyRound(0.5), 0);
  assert.equal(pyRound(1.5), 2);
  assert.equal(pyRound(2.5), 2);
  assert.equal(pyRound(2.4), 2);
  assert.equal(pyRound(2.6), 3);
});

test("percentile matches numpy linear interpolation", () => {
  close(percentile([1, 2, 3, 4], 50), 2.5);
  close(percentile([10, 20, 30, 40, 50], 5), 12);
  close(percentile([10, 20, 30, 40, 50], 95), 48);
});

test("just frequencies follow the ratio table, including the tritone, the minor seventh and keys below C4", () => {
  close(justFrequency(60), REFERENCE_C4_HZ);
  close(justFrequency(66), REFERENCE_C4_HZ * (45 / 32));
  close(justFrequency(70), REFERENCE_C4_HZ * (9 / 5));
  close(justFrequency(55), REFERENCE_C4_HZ * (3 / 2) * 0.5); // G3, one octave down
  close(justFrequency(48), REFERENCE_C4_HZ / 2);
  close(justFrequency(72), REFERENCE_C4_HZ * 2);
  const g = describePitch(67);
  assert.equal(g.intervalFromC, "perfect fifth");
  assert.equal(g.ratioToC, "3/2");
  close(g.centsFromEqual, 1200 * Math.log2(1.5 / 2 ** (7 / 12)), 1e-9);
});

test("the C Lydian ladder from C3 to C5 holds only mode members, lowest C3, highest C5", () => {
  const l = modeLadder(48, 72);
  assert.equal(l[0], 48);
  assert.equal(l[l.length - 1], 72);
  assert.equal(l.length, 15);
  for (const k of l) assert.ok([0, 2, 4, 6, 7, 9, 11].includes(k % 12));
  assert.ok(justFrequency(72) < 523.3);
});

test("the scan starts after the largest RA gap, so the 0/360 seam does not cut a region", () => {
  const start = scanStart([350, 5, 10, 20, 340]);
  assert.equal(start, 340);
  close(unwrapRa(5, start), 365);
  close(unwrapRa(340, start), 340);
  assert.equal(scanStart([]), 0);
  assert.equal(scanStart([42]), 42);
});

const stars: SweepStar[] = [
  { id: "A", raDeg: 350, decDeg: -10, magnitude: 1 },
  { id: "B", raDeg: 5, decDeg: 30, magnitude: 4 },
  { id: "C", raDeg: 20, decDeg: 10, magnitude: 6 },
  { id: "D", raDeg: 340, decDeg: 0, magnitude: 5 },
];

test("station sweep: onset from RA, pitch from Dec, loudness from magnitude", () => {
  const { track, mapping } = buildStationTrack(stars, "Test");
  assert.equal(mapping.start, 340);
  const notes = track.events.filter((e) => e.kind === "note");
  const byId = Object.fromEntries(notes.map((e) => [e.id, e]));
  close(byId.D.onsetBeats!, 0); // first star after the seam
  close(byId.C.onsetBeats!, 24); // last star ends the scan
  assert.equal(byId.A.pitch, 48); // lowest declination -> C3
  assert.equal(byId.B.pitch, 72); // highest declination -> C5
  assert.equal(byId.A.velocity, 120); // brightest star: 35 + 85
  assert.ok(byId.C.velocity! < byId.A.velocity!); // fainter is quieter
  assert.equal(track.bpm, 36);
  close(track.scanSeconds, 24 * (Math.trunc(60_000_000 / 36) / 1_000_000));
  for (const n of notes) assert.ok(n.frequencyHz! >= 130 && n.frequencyHz! < 524);
});

test("station sweep keeps every star: the faint ones are listed as skipped, with the reason", () => {
  const many: SweepStar[] = Array.from({ length: 200 }, (_, i) => ({ id: `S${i}`, raDeg: i, decDeg: i % 50, magnitude: i / 10 }));
  const { track } = buildStationTrack(many, "Many");
  assert.equal(track.noteCount + track.mergedCount, 140);
  assert.equal(track.skippedCount, 60);
  assert.ok(track.events.filter((e) => e.kind === "skipped").every((e) => e.reason.length > 0));
});

test("equal-pitch stars at the same moment merge into the louder one and are recorded", () => {
  const twin: SweepStar[] = [
    { id: "L", raDeg: 10, decDeg: 5, magnitude: 1 },
    { id: "Q", raDeg: 10, decDeg: 5, magnitude: 3 },
    { id: "Z", raDeg: 50, decDeg: 40, magnitude: 2 },
  ];
  const { track } = buildStationTrack(twin, "Twin");
  const q = track.events.find((e) => e.id === "Q")!;
  assert.equal(q.kind, "merged");
  assert.equal(q.mergedInto, "L");
  assert.equal(track.mergedCount, 1);
});

test("a single star does not break the maths", () => {
  const { track } = buildStationTrack([{ id: "one", raDeg: 10, decDeg: 5, magnitude: 2 }], "One");
  assert.equal(track.noteCount, 1);
  assert.equal(track.events[0].pitch, 48);
});

function channels(over: (i: number) => Partial<SpectrumChannel> = () => ({})): SpectrumChannel[] {
  return Array.from({ length: 102 }, (_, i) => ({
    channel: i + 1,
    wavelengthUm: 0.75 * Math.pow(5 / 0.75, i / 101),
    brightnessMjySr: 1 + (i % 10),
    valid: true,
    blank: i === 50 || i === 51,
    ...over(i),
  }));
}

test("wavelength to pitch: short wavelength high, long wavelength low, one shared scale", () => {
  const ladder = modeLadder(48, 72);
  assert.equal(wavelengthToPitch(0.75, ladder), 72);
  assert.equal(wavelengthToPitch(5.0, ladder), 48);
  assert.ok(wavelengthToPitch(1.5, ladder) > wavelengthToPitch(3.0, ladder));
});

test("spectrum: 102 measurement rows, blank channels 51 and 52 rest, nothing is interpolated", () => {
  const t = buildSpectrumTrack(channels(), "Test");
  const rows = t.events.filter((e) => e.role === "measurement");
  assert.equal(rows.length, 102);
  const ch51 = rows.find((e) => e.channel === 51)!;
  const ch52 = rows.find((e) => e.channel === 52)!;
  assert.equal(ch51.kind, "rest");
  assert.equal(ch52.kind, "rest");
  assert.equal(ch51.pitch, undefined);
  assert.equal(t.restCount, 2);
  assert.equal(t.bpm, 30);
});

test("spectrum: masked, missing and non-positive samples rest with their own reason and keep the signed value", () => {
  const t = buildSpectrumTrack(
    channels((i) => (i === 5 ? { valid: false } : i === 6 ? { brightnessMjySr: null } : i === 7 ? { brightnessMjySr: -2 } : {})),
    "Test"
  );
  const get = (n: number) => t.events.find((e) => e.channel === n && e.role === "measurement")!;
  assert.match(get(6).reason, /quality mask/);
  assert.match(get(7).reason, /missing/);
  assert.match(get(8).reason, /negative/);
  assert.equal(get(8).brightnessMjySr, -2);
  assert.equal(get(8).pitch, undefined);
});

test("spectrum: bright channels get derived string support an octave lower, labelled as composition", () => {
  const t = buildSpectrumTrack(channels(), "Test");
  const support = t.events.filter((e) => e.role === "harmony");
  assert.ok(support.length > 0);
  for (const s of support) {
    const melody = t.events.find((e) => e.id === s.id.replace("-support", ""))!;
    assert.equal(s.pitch, melody.pitch! - 12);
    assert.equal(s.velocity, Math.trunc(0.6 * melody.velocity!));
    assert.match(s.reason, /composition/);
  }
});

test("spectrum with no positive valid sample is silent and says so", () => {
  const t = buildSpectrumTrack(channels(() => ({ valid: false })), "Test");
  assert.equal(t.silent, true);
  assert.equal(t.noteCount, 0);
  assert.equal(countPositiveValid(channels(() => ({ valid: false }))), 0);
});

test("a spectrum needs all 102 channels", () => {
  assert.throws(() => buildSpectrumTrack(channels().slice(0, 50), "Short"));
});

test("MIDI: valid header, tick resolution, tuning messages cover all 128 keys with 7-bit data", () => {
  const { track } = buildStationTrack(stars, "Test");
  const bytes = encodeMidi(track, "Test");
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "MThd");
  assert.equal((bytes[12] << 8) | bytes[13], 960);
  const msgs = tuningMessages();
  assert.equal(msgs.length, 2);
  for (const m of msgs) {
    assert.equal(m[0], 0xf0);
    assert.equal(m[m.length - 1], 0xf7);
    assert.equal(m.length, 7 + 64 * 4 + 1);
    for (const b of m.slice(1, -1)) assert.ok(b < 0x80, "SysEx data bytes must be below 0x80");
  }
  assert.deepEqual(mtsFrequencyBytes(440), [69, 0, 0]);
  let noteOns = 0;
  for (let i = 22; i < bytes.length - 2; i++) if (bytes[i] === 0x90 && bytes[i + 1] >= 36 && bytes[i + 1] <= 84 && bytes[i + 2] > 0) noteOns++;
  assert.ok(noteOns >= track.noteCount);
});

test("WAV: PCM header, mono, rate, and a silent track stays silent", () => {
  const w = encodeWav(Float32Array.from([0, 0.5, -0.5, 1, -1]), 22050);
  const dv = new DataView(w.buffer);
  assert.equal(String.fromCharCode(...w.slice(0, 4)), "RIFF");
  assert.equal(dv.getUint16(20, true), 1);
  assert.equal(dv.getUint16(22, true), 1);
  assert.equal(dv.getUint32(24, true), 22050);
  assert.equal(dv.getUint16(34, true), 16);
  assert.equal(dv.getUint32(40, true), 10);
  const silent = peakNormalize(new Float32Array(100), 0.95);
  assert.equal(Math.max(...silent), 0);
  const loud = peakNormalize(Float32Array.from([0.2, -0.4]), 0.95);
  close(Math.abs(loud[1]), 0.95, 1e-6);
});

test("note table: one row per event, unavailable values stay empty and never become zero", () => {
  const t = buildSpectrumTrack(channels((i) => (i === 3 ? { brightnessMjySr: null } : {})), "Test");
  const lines = noteTableCsv(t).trim().split("\n");
  assert.equal(lines.length, 1 + t.events.length);
  assert.equal(lines[0].split(",").length, NOTE_TABLE_HEADERS.length);
  const row = lines.find((l) => l.includes(",ch4,"))!;
  assert.match(row, /^rest,measurement,missing value/);
});

test("region picture: a region across the 0/360 seam stays in one piece, with RA growing to the right", () => {
  const { mapping } = buildStationTrack(stars, "Test");
  const g = buildRegionGeometry(stars, mapping, new Set(["A", "B", "C", "D"]), [[[345, -15], [25, -15], [25, 35], [345, 35]]]);
  assert.equal(g.polar, false);
  assert.equal(g.rings.length, 1);
  const byId = Object.fromEntries(g.stars.map((s) => [s.id, s]));
  assert.ok(byId.D.x < byId.A.x && byId.A.x < byId.B.x && byId.B.x < byId.C.x);
  assert.ok(g.xMax - g.xMin < 100);
});

test("region picture: a ring that circles the pole is not drawn flat", () => {
  const ring: number[][] = Array.from({ length: 12 }, (_, i) => [i * 30, 80]);
  const { mapping } = buildStationTrack(stars, "Test");
  const g = buildRegionGeometry(stars, mapping, new Set(), [ring]);
  assert.equal(g.polar, true);
  assert.equal(g.rings.length, 0);
});

test("the region map has one scale in both directions, whatever the region shape", () => {
  const { mapping } = buildStationTrack(stars, "Test");
  const shapes = [
    [[[345, -15], [25, -15], [25, 35], [345, 35]]], // wide
    [[[0, -40], [8, -40], [8, 60], [0, 60]]], // tall and thin
  ];
  for (const rings of shapes) {
    const g = buildRegionGeometry(stars, mapping, new Set(["A"]), rings);
    const f = fitMap(g, 600, 320, 20);
    const midDec = (g.yMin + g.yMax) / 2;
    // one degree of true angle east-west and one degree north-south must be the same length on the picture
    const eastWest = f.sx(g.xMin + 1 / f.cosDec) - f.sx(g.xMin);
    const northSouth = f.sy(midDec) - f.sy(midDec + 1);
    close(eastWest, northSouth, 1e-9);
    close(eastWest, f.scale, 1e-9);
    // the whole region fits inside the picture
    assert.ok(f.sx(g.xMin) >= 0 && f.sx(g.xMax) <= 600);
    assert.ok(f.sy(g.yMax) >= 0 && f.sy(g.yMin) <= f.height);
    assert.ok(f.height <= 320);
  }
});
