import { degToRad } from "@/lib/astro/coordinates";

export interface StereographicPoint {
  x: number;
  y: number;
  visible: boolean;
}

/**
 * Celestial stereographic projection centered at (ra0Deg, dec0Deg).
 * Follows planetarium / inside-the-sphere handedness:
 * - North is UP (+y)
 * - South is DOWN (-y)
 * - East (increasing RA) is LEFT (-x)
 * - West (decreasing RA) is RIGHT (+x)
 *
 * @param raDeg Target Right Ascension in degrees [0, 360)
 * @param decDeg Target Declination in degrees [-90, +90]
 * @param ra0Deg Center Right Ascension in degrees
 * @param dec0Deg Center Declination in degrees
 */
export function projectStereographic(
  raDeg: number,
  decDeg: number,
  ra0Deg: number,
  dec0Deg: number
): StereographicPoint {
  const ra = degToRad(raDeg);
  const dec = degToRad(decDeg);
  const ra0 = degToRad(ra0Deg);
  const dec0 = degToRad(dec0Deg);

  const dRa = ra - ra0;

  // Angular distance cosine from center
  const cosC = Math.sin(dec0) * Math.sin(dec) + Math.cos(dec0) * Math.cos(dec) * Math.cos(dRa);

  // If point is on the opposite hemisphere behind the tangent plane, mark invisible
  if (cosC <= 0.0) {
    return { x: 0, y: 0, visible: false };
  }

  // Stereographic scale factor k = 2 / (1 + cos(c))
  const k = 2.0 / (1.0 + cosC);

  // East is to the LEFT -> negate x so increasing RA produces negative x
  const x = -k * Math.cos(dec) * Math.sin(dRa);

  // North is UP -> positive y
  const y = k * (Math.cos(dec0) * Math.sin(dec) - Math.sin(dec0) * Math.cos(dec) * Math.cos(dRa));

  return { x, y, visible: true };
}
