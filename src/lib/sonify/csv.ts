import type { SonifyEvent, SonifyTrack } from "./mapping.ts";

const COLUMNS: Array<[string, (e: SonifyEvent) => unknown]> = [
  ["event_kind", (e) => e.kind],
  ["event_role", (e) => e.role],
  ["reason", (e) => e.reason],
  ["object_id", (e) => e.id],
  ["object_name", (e) => e.name],
  ["channel", (e) => e.channel],
  ["wavelength_um", (e) => e.wavelengthUm],
  ["surface_brightness_mjy_sr", (e) => e.brightnessMjySr],
  ["quality_valid", (e) => e.qualityValid],
  ["ra_deg", (e) => e.raDeg],
  ["dec_deg", (e) => e.decDeg],
  ["apparent_magnitude", (e) => e.magnitude],
  ["voice", (e) => e.voice],
  ["pitch_midi", (e) => e.pitch],
  ["velocity", (e) => e.velocity],
  ["onset_beats", (e) => e.onsetBeats],
  ["duration_beats", (e) => (e.durationTick !== undefined ? e.durationTick / 960 : e.durationBeats)],
  ["onset_seconds", (e) => e.onsetSeconds],
  ["duration_seconds", (e) => e.durationSeconds],
  ["frequency_hz", (e) => e.frequencyHz],
  ["interval_from_c", (e) => e.intervalFromC],
  ["ratio_to_c", (e) => e.ratioToC],
  ["octaves_from_c4", (e) => e.octavesFromC4],
  ["cents_from_equal_temperament", (e) => e.centsFromEqual],
  ["playback_adjustment", (e) => e.adjustment],
  ["merged_into_object_id", (e) => e.mergedInto],
];

export const NOTE_TABLE_HEADERS = COLUMNS.map(([h]) => h);

const cell = (v: unknown): string => {
  if (v === undefined || v === null) return ""; // unavailable stays empty, never zero
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function noteTableCsv(track: SonifyTrack): string {
  const rows = [NOTE_TABLE_HEADERS.join(",")];
  for (const e of track.events) rows.push(COLUMNS.map(([, f]) => cell(f(e))).join(","));
  return rows.join("\n") + "\n";
}
