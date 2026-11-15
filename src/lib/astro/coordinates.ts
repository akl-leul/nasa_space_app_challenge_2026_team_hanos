// Standard astronomical coordinate calculations

export const ADDIS_ABABA_LAT = 9.03;
export const ADDIS_ABABA_LON = 38.74;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180.0;
}

export function radToDeg(rad: number): number {
  return (rad * 180.0) / Math.PI;
}

/**
 * Formats Right Ascension in degrees to standard sexagesimal format (HHh MMm SS.ss)
 */
export function formatRaSexagesimal(raDeg: number): string {
  const normRa = ((raDeg % 360.0) + 360.0) % 360.0;
  const totalHours = normRa / 15.0;
  const hours = Math.floor(totalHours);
  const totalMinutes = (totalHours - hours) * 60.0;
  const minutes = Math.floor(totalMinutes);
  const seconds = (totalMinutes - minutes) * 60.0;

  const hStr = String(hours).padStart(2, "0");
  const mStr = String(minutes).padStart(2, "0");
  const sStr = seconds.toFixed(1).padStart(4, "0");

  return `${hStr}h ${mStr}m ${sStr}s`;
}

/**
 * Formats Declination in degrees to standard sexagesimal format (±DD° MM′ SS.s″)
 */
export function formatDecSexagesimal(decDeg: number): string {
  const sign = decDeg < 0 ? "-" : "+";
  const absDec = Math.abs(decDeg);
  const degrees = Math.floor(absDec);
  const totalMinutes = (absDec - degrees) * 60.0;
  const minutes = Math.floor(totalMinutes);
  const seconds = (totalMinutes - minutes) * 60.0;

  const dStr = String(degrees).padStart(2, "0");
  const mStr = String(minutes).padStart(2, "0");
  const sStr = seconds.toFixed(1).padStart(4, "0");

  return `${sign}${dStr}° ${mStr}′ ${sStr}″`;
}

/**
 * Converts RA and Dec in degrees to 3D Cartesian coordinates on a celestial sphere of given radius.
 * Standard inside-the-sphere planetarium setup (camera at origin, looking from inside):
 * +Y is North Celestial Pole (Dec = +90°)
 * -Z is RA = 0°, Dec = 0°
 * -X is RA = 90° (6h), Dec = 0° (East, screen-left when North is up)
 * +X is RA = 270° (18h), Dec = 0° (West, screen-right when North is up)
 */
export function raDecToCartesian(
  raDeg: number,
  decDeg: number,
  radius = 100
): [number, number, number] {
  const raRad = degToRad(raDeg);
  const decRad = degToRad(decDeg);

  const cosDec = Math.cos(decRad);
  const x = -radius * cosDec * Math.sin(raRad);
  const y = radius * Math.sin(decRad);
  const z = -radius * cosDec * Math.cos(raRad);

  return [x, y, z];
}

/**
 * Converts 3D Cartesian vector to RA and Dec in degrees (inside-the-sphere convention).
 */
export function cartesianToRaDec(
  x: number,
  y: number,
  z: number
): [number, number] {
  const r = Math.sqrt(x * x + y * y + z * z);
  if (r < 1e-6) return [0, 0];

  const decRad = Math.asin(Math.max(-1.0, Math.min(1.0, y / r)));
  const decDeg = radToDeg(decRad);

  let raRad = Math.atan2(-x, -z);
  if (raRad < 0) raRad += 2 * Math.PI;
  const raDeg = radToDeg(raRad);

  return [raDeg, decDeg];
}

/**
 * Computes Greenwich Mean Sidereal Time (GMST) and Local Sidereal Time (LST) in degrees.
 */
export function computeSiderealTime(date: Date, lonDeg = ADDIS_ABABA_LON): {
  gmstDeg: number;
  lstDeg: number;
} {
  const jd = date.getTime() / 86400000.0 + 2440587.5;
  const d = jd - 2451545.0; // Days since J2000.0

  // Standard IAU GMST formula in degrees
  let gmst = (280.46061837 + 360.98564736629 * d) % 360.0;
  if (gmst < 0) gmst += 360.0;

  let lst = (gmst + lonDeg) % 360.0;
  if (lst < 0) lst += 360.0;

  return { gmstDeg: gmst, lstDeg: lst };
}

/**
 * Parses user input into valid RA and Dec in degrees, or returns null.
 * Accepts:
 * - "101.28, -16.71" (decimal degrees)
 * - "RA 101.28 Dec -16.71"
 * - "06h 45m 08s, -16d 42m 58s"
 */
export function parseCoordinates(
  input: string
): { ra: number; dec: number } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Please enter RA and Dec coordinates." };
  }

  // Check sexagesimal format e.g. "06h 45m 08s, -16d 42m 58s" or "06:45:08, -16:42:58"
  const sexaRegex =
    /(?:RA\s*:?\s*)?(\d{1,2})[h:]\s*(\d{1,2})[m:]\s*(\d{1,2}(?:\.\d+)?)[s]?\s*[,/ ]+\s*(?:DEC\s*:?\s*)?([+-]?\d{1,2})[d°:]\s*(\d{1,2})[′'m:]\s*(\d{1,2}(?:\.\d+)?)[″"s]?/i;
  const sexaMatch = trimmed.match(sexaRegex);
  if (sexaMatch) {
    const h = parseFloat(sexaMatch[1]);
    const m = parseFloat(sexaMatch[2]);
    const s = parseFloat(sexaMatch[3]);
    const dSign = sexaMatch[4].startsWith("-") ? -1 : 1;
    const d = Math.abs(parseFloat(sexaMatch[4]));
    const dm = parseFloat(sexaMatch[5]);
    const ds = parseFloat(sexaMatch[6]);

    const ra = (h + m / 60.0 + s / 3600.0) * 15.0;
    const dec = dSign * (d + dm / 60.0 + ds / 3600.0);

    if (ra < 0 || ra >= 360 || dec < -90 || dec > 90) {
      return { error: "Coordinates out of bounds (RA: 0–360°, Dec: −90…+90°)." };
    }
    return { ra, dec };
  }

  // Check decimal degrees format e.g. "101.28, -16.71" or "RA 101.28 Dec -16.71"
  const decRegex =
    /(?:RA\s*:?\s*)?([+-]?\d+(?:\.\d+)?)\s*[,/ ]+\s*(?:DEC\s*:?\s*)?([+-]?\d+(?:\.\d+)?)/i;
  const decMatch = trimmed.match(decRegex);
  if (decMatch) {
    const ra = parseFloat(decMatch[1]);
    const dec = parseFloat(decMatch[2]);

    if (isNaN(ra) || isNaN(dec)) {
      return { error: "Invalid coordinate numbers." };
    }
    if (ra < 0 || ra > 360) {
      return { error: "RA must be between 0° and 360°." };
    }
    if (dec < -90 || dec > 90) {
      return { error: "Dec must be between −90° and +90°." };
    }
    return { ra, dec };
  }

  return {
    error:
      "Could not parse coordinates. Format: '101.28, -16.71' or '06h 45m 09s, -16° 42′ 58″'.",
  };
}
