/**
 * Just intonation rooted on C, as specified in docs/HANOS_METHOD_MASTERPROMPT.md section 16.
 * Frequencies are calculated from the ratio formula, never from equal temperament.
 */

/** Ratios to C for the 12 degrees of the octave (the unison is 1/1; the octave extension is 2/1). */
export const JUST_RATIOS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [16, 15],
  [9, 8],
  [6, 5],
  [5, 4],
  [4, 3],
  [45, 32],
  [3, 2],
  [8, 5],
  [5, 3],
  [9, 5],
  [15, 8],
];

export const INTERVAL_NAMES: readonly string[] = [
  "unison",
  "minor second",
  "major second",
  "minor third",
  "major third",
  "perfect fourth",
  "tritone",
  "perfect fifth",
  "minor sixth",
  "major sixth",
  "minor seventh",
  "major seventh",
];

/** MIDI key 60 (C4) in the equal-tempered reference the implementation uses, kept at full precision. */
export const REFERENCE_C4_HZ = 440 * Math.pow(2, (60 - 69) / 12);

/** C Lydian: pitch-class offsets from C. */
export const LYDIAN: readonly number[] = [0, 2, 4, 6, 7, 9, 11];

export interface JustPitch {
  frequencyHz: number;
  intervalFromC: string;
  ratioToC: string;
  octavesFromC4: number;
  centsFromEqual: number;
}

export function equalFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Floor-based divmod, so keys below C4 land in the right octave. */
function divmod12(n: number): [number, number] {
  const octave = Math.floor(n / 12);
  return [octave, n - octave * 12];
}

export function justFrequency(midi: number): number {
  const [octave, degree] = divmod12(midi - 60);
  const [num, den] = JUST_RATIOS[degree];
  return REFERENCE_C4_HZ * (num / den) * Math.pow(2, octave);
}

export function describePitch(midi: number): JustPitch {
  const [octave, degree] = divmod12(midi - 60);
  const [num, den] = JUST_RATIOS[degree];
  const f = justFrequency(midi);
  return {
    frequencyHz: f,
    intervalFromC: INTERVAL_NAMES[degree],
    ratioToC: `${num}/${den}`,
    octavesFromC4: octave,
    centsFromEqual: 1200 * Math.log2(f / equalFrequency(midi)),
  };
}

/** Keys in [low, high] whose pitch class belongs to the mode, in ascending order. */
export function modeLadder(low: number, high: number, mode: readonly number[] = LYDIAN): number[] {
  const keys: number[] = [];
  for (let k = low; k <= high; k++) {
    if (mode.includes(((k % 12) + 12) % 12)) keys.push(k);
  }
  return keys;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** A readable label such as "C4". The number and the frequency are what define the pitch. */
export function noteLabel(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
