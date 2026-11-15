# 10. Region sonification pop-up ("Cosmic Sound")

Status: **built** (`src/lib/sonify/`, `src/components/explore/SonificationDialog.tsx`, `src/components/explore/sonify/`). The plan below is what was built. Method source: `docs/HANOS_METHOD_MASTERPROMPT.md` (sections 13 to 19, 22).
Decisions taken with the team: instrument notes (no spoken voice), both data sources switchable, Play opens this pop-up, extras = pause/stop/speed, MIDI and WAV download, note table, mapping legend.

## 1. Flow

1. The user selects a **constellation region** on the sky dome. The selection capsule shows **Play, Info, Share**.
2. **Play** opens the **Cosmic Sound pop-up** (same dialog pattern as the share card: lazy-loaded, focus trapped, Escape closes, focus returns to Play). Nothing sounds yet.
3. The pop-up shows the **region**: its IAU boundary and its catalogue stars, drawn flat (right ascension to the right).
4. The user presses **Play** inside the pop-up (a user gesture, so audio may start). A **vertical scan line** moves **left to right** across the region. A star sounds when the line reaches it.
5. At the bottom a **pitch graph** shows every note (time across, pitch up). A second playhead moves in step with the scan line. Notes already played turn blue.
6. Playback is **slow** by default.

The old Play behaviour (open the time-lapse for the region centre) moves to an **"Open time-lapse"** link inside the pop-up.

## 2. Layout (top to bottom)

| Block | Content |
|---|---|
| Header | "Cosmic sound · region", the region name, star count, **mode switch** (Stars / SPHEREx spectrum), close button |
| Legend | Left to right: right ascension. Higher: further north. Louder: brighter. (Spectrum mode: left to right is wavelength order, higher is shorter wavelength, louder is brighter.) |
| Sky panel | Region boundary, stars sized by brightness, the scan line. Under it: "RA increasing". |
| Pitch graph | One dot per note, pitch on the vertical axis (C3 to C5 range), playhead, current note readout. |
| Controls | Play/Pause, Stop, speed (Slow, Normal, Fast), volume limit, MIDI and WAV download, scrub bar |
| Note table | Collapsed by default. Every note: object, RA, Dec, magnitude, pitch, frequency, velocity, onset. Also lists rests and skipped objects with the reason. |
| Footer note | "Sound does not travel through space. This sound is a chosen mapping of catalogue data, not a recording." |

The pop-up follows the app design system: 9 px regular text, ink panel, cream text, blue for the playhead, scan line and played notes only.

## 3. Mode A: Stars (catalogue sweep)

Data: our own packed catalogue (`public/data/stars.json`, 5,044 stars, fields `ra, dec, mag, con`). **This is catalogue data (Hipparcos/Yale), not SPHEREx.** The pop-up says so.

Mapping (method section 14, melodic profile):

| Sound | From | Rule |
|---|---|---|
| Selection | brightness | The brightest **140** stars of the region (ascending magnitude, ties by id). No deep-sky objects: we have no such catalogue, so that voice is omitted and stated. |
| Onset | RA | Start after the largest RA gap (handles 0/360), `onset = 24 beats × (RA − start) / span`. |
| Pitch | Dec | Local min to max Dec onto a C Lydian ladder, MIDI 48 to 72. |
| Loudness | magnitude | 5th to 95th percentile, `velocity = int(35 + 85·√u)`. Brighter is louder. |
| Length | fixed | 1 beat per star. |
| Tuning | | Just intonation rooted on C (ratio table in method section 16). |
| Tempo | | 36 BPM, 960 ticks per beat. Slow ≈ 40 s for the whole region. |
| Instrument | | Vibraphone (GM program 11). |

Same-pitch collisions are merged or retriggered as the method says, and every adjustment is kept in the note table.

## 4. Mode B: SPHEREx spectrum

Data: a **real SPHEREx All-Sky Cube spectrum** (102 channels) sampled at one real catalogue position in the region. It is **stacked data with no time information**, and the pop-up says so. Channels 51 and 52 are blank and stay **silent**; masked, missing and non-positive channels are rests with a stated reason.

Mapping (method section 15):

| Sound | From | Rule |
|---|---|---|
| Onset | channel order | 102 equal slots across 10 beats (30 BPM). Slot order is **not** observing time. |
| Pitch | wavelength | Shared inverse-log map over 0.75 to 5 micron, short wavelength high. |
| Loudness | brightness | Positive valid samples only, 5th to 95th percentile, `u^0.6`, `velocity = int(45 + 75u)`. |
| Support | bright channels | A quiet string note an octave below when `u > 0.65`, **labelled as composition**. |
| Which position | rule | The region's brightest catalogue stars are tried (up to 5); the one with the **most positive valid channels** is the representative. Deterministic, stated in the pop-up. It is not claimed to be the most important or a detection. |

How it is fetched: the existing `/api/spectrum?source=allsky` (about 22 s the first time, then cached). The pop-up shows progress and plays the stars mode meanwhile. If no valid positive channel exists, the pop-up says "no usable samples here" and plays silence; it never invents a spectrum.

Moving stars smear in the cube, so the pop-up shows the existing warning when the chosen star moves fast.

## 5. Sound engine

- **Web Audio API**, no new dependency. Additive vibraphone-like partials, envelopes, a small generated reverb, mono. Frequencies come from the **ratio formula**, not equal temperament.
- Start only after the Play click. Master gain capped by the **volume limit** control. **Stop** always silences everything and resets the scan line.
- Speed changes **schedule times**, never pitch (no sample-rate change).
- **WAV**: rendered offline (OfflineAudioContext), 16-bit mono, 22,050 Hz, peak-normalised to 0.95, 3 s final padding.
- **MIDI**: standard MIDI file, 960 ticks per beat, with MIDI Tuning Standard messages so the just ratios survive in a compatible synthesizer (plain players will play equal temperament; the note table and WAV carry the exact frequencies).
- **Note table CSV** download with the fields in method section 19.

## 6. Honesty and accessibility rules

- Real data only. Catalogue mode labelled as catalogue; spectrum mode labelled as stacked SPHEREx data. No sound from simulated values.
- A visible **mapping legend**, a **text table equivalent** of the graph, a **stop button**, a **volume limit**, a **visual cursor** (the scan line), audio only after a gesture.
- Reduced motion: the scan line still moves because it is the cursor, but there are no decorative animations; the table gives the same information without motion.
- Keyboard: every control reachable, Space plays or pauses, Escape closes.
- Orientation note: sky charts normally show right ascension growing to the left. The method scans increasing right ascension left to right, so the pop-up draws it that way and says "RA increasing".

## 7. Code plan

| Piece | Where |
|---|---|
| Pure mapping, tuning, scheduling, MIDI and WAV encoders, with unit tests | `src/lib/sonify/` (`mapping.ts`, `tuning.ts`, `schedule.ts`, `synth.ts`, `midi.ts`, `wav.ts`, `table.ts`) |
| Pop-up | `src/components/explore/SonificationDialog.tsx` (lazy-loaded like the share card) |
| Pitch graph and sky panel | `src/components/explore/sonify/PitchGraph.tsx`, `RegionSweep.tsx` |
| Hook into Play | `SkyExplorer.tsx` `handlePlayRegion` opens the dialog instead of the time-lapse |
| Spectrum for the pop-up | existing `/api/spectrum`, plus a small helper that ranks candidate stars |
| Docs | this file, README feature table, `docs/01-project` mapping card |

Tests (offline, real numbers): RA wrap and onset, Dec to ladder, velocity range, tuning ratios (45/32, 9/5, below C4), wavelength map, channel 51 and 52 silence, collision handling, MIDI byte validity, WAV header.

## 8. Decisions taken while building

- The spectrum representative is computed on first use with a progress bar (5 positions, 3 at a time). The API now caches every cube spectrum by position, so a repeat is instant. Pre-computing all 88 regions is still possible.
- Whether the "Stars" mode should also play the three or four brightest named stars with their names shown as they sound.
