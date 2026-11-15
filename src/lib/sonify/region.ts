/**
 * Geometry for the region picture: stars and the IAU boundary placed on one flat axis where right ascension grows to
 * the right, using the same unwrapping as the sound, so the scan line and the notes agree.
 */
import type { StationMapping, SweepStar } from "./mapping.ts";

export interface PanelStar {
  id: string;
  /** Unwrapped right ascension, degrees. */
  x: number;
  /** Declination, degrees. */
  y: number;
  magnitude: number;
  sounded: boolean;
}

export interface RegionGeometry {
  stars: PanelStar[];
  /** Boundary rings in (unwrapped RA, Dec). Empty for polar regions, which cannot be drawn flat. */
  rings: Array<Array<[number, number]>>;
  polar: boolean;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const signed = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

export function buildRegionGeometry(allStars: readonly SweepStar[], mapping: StationMapping, soundedIds: ReadonlySet<string>, polygons?: number[][][] | null): RegionGeometry {
  const center = mapping.start + mapping.span / 2;
  const place = (ra: number): number => center + signed(ra - center);
  const stars: PanelStar[] = allStars
    .filter((s) => Number.isFinite(s.raDeg) && Number.isFinite(s.decDeg))
    .map((s) => ({ id: s.id, x: place(s.raDeg), y: s.decDeg, magnitude: s.magnitude, sounded: soundedIds.has(s.id) }));

  let rings: Array<Array<[number, number]>> = [];
  let polar = false;
  if (polygons && polygons.length) {
    const placed = polygons.map((ring) => ring.map(([ra, dec]) => [place(ra), dec] as [number, number]));
    const xs = placed.flat().map((p) => p[0]);
    const spanX = Math.max(...xs) - Math.min(...xs);
    if (spanX > 300) polar = true; // a ring that circles the pole cannot be flattened without a cut
    else rings = placed;
  }

  const xsAll = [...stars.map((s) => s.x), ...rings.flat().map((p) => p[0])];
  const ysAll = [...stars.map((s) => s.y), ...rings.flat().map((p) => p[1])];
  const xMin = xsAll.length ? Math.min(...xsAll) : 0;
  const xMax = xsAll.length ? Math.max(...xsAll) : 1;
  const yMin = ysAll.length ? Math.min(...ysAll) : -1;
  const yMax = ysAll.length ? Math.max(...ysAll) : 1;
  return { stars, rings, polar, xMin, xMax: xMax > xMin ? xMax : xMin + 1, yMin, yMax: yMax > yMin ? yMax : yMin + 1 };
}

export interface MapFit {
  /** Height of the picture in view-box units (the width is fixed). */
  height: number;
  /** View-box units per degree of true angle, the same in both directions. */
  scale: number;
  /** Shortening of right ascension at the middle declination. */
  cosDec: number;
  sx: (unwrappedRa: number) => number;
  sy: (decDeg: number) => number;
}

/**
 * Places the region on the picture with ONE scale for both directions, so its shape is never stretched or squashed.
 * A degree of right ascension is shortened by cos(declination) at the middle of the region, which is what keeps true
 * proportions on the sky; the meridians stay vertical, so the scan line is still a line of constant right ascension.
 * The picture gets the height the region needs (up to maxHeight) and the map is centred in it.
 */
export function fitMap(g: RegionGeometry, width: number, maxHeight: number, pad: number, minHeight = 120): MapFit {
  const decMid = (g.yMin + g.yMax) / 2;
  const cosDec = Math.max(0.2, Math.cos((decMid * Math.PI) / 180));
  const wDeg = (g.xMax - g.xMin) * cosDec;
  const hDeg = g.yMax - g.yMin;
  let scale = (width - 2 * pad) / wDeg;
  let height = hDeg * scale + 2 * pad;
  if (height > maxHeight) {
    scale = (maxHeight - 2 * pad) / hDeg;
    height = maxHeight;
  }
  height = Math.max(height, minHeight);
  const offX = (width - wDeg * scale) / 2;
  const offY = (height - hDeg * scale) / 2;
  return {
    height,
    scale,
    cosDec,
    sx: (x) => offX + (x - g.xMin) * cosDec * scale,
    sy: (y) => offY + (g.yMax - y) * scale,
  };
}
