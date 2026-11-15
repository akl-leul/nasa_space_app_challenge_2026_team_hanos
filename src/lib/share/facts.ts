import { SkySelection, ConstellationInfo, StarRecord } from "@/types/sky";

export interface FactLine {
  label: string;
  value: string;
}

export interface ShareCardFacts {
  title: string;
  coordinatesSexagesimal: string;
  facts: FactLine[];
}

/**
 * Total celestial sphere area in square degrees: 4 * pi * (180 / pi)^2
 */
export const TOTAL_SKY_SQ_DEG = 41252.96;

/**
 * Formats RA and Dec into standard J2000 sexagesimal string.
 * Example: "RA 00h 42m 44s · DEC +41° 16′ 09″ · J2000"
 */
export function formatCoordinatesSexagesimal(raDeg: number, decDeg: number): string {
  const normRa = ((raDeg % 360) + 360) % 360;
  let totalRaSec = Math.round((normRa / 15.0) * 3600.0);
  if (totalRaSec >= 86400) totalRaSec -= 86400;
  const h = Math.floor(totalRaSec / 3600);
  const m = Math.floor((totalRaSec % 3600) / 60);
  const s = totalRaSec % 60;

  const sign = decDeg >= 0 ? "+" : "−";
  const totalDecSec = Math.round(Math.abs(decDeg) * 3600.0);
  const d = Math.floor(totalDecSec / 3600);
  const dm = Math.floor((totalDecSec % 3600) / 60);
  const ds = totalDecSec % 60;

  const raStr = `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  const decStr = `${sign}${String(d).padStart(2, "0")}° ${String(dm).padStart(2, "0")}′ ${String(ds).padStart(2, "0")}″`;

  return `RA ${raStr} · DEC ${decStr} · J2000`;
}

/**
 * Formats RA and Dec into PDF straight-quote style sexagesimal string per Prompt 08.
 * Example: `00h42'44.3" +41°16'09" J2000`
 */
export function formatStraightCoordinatesSexagesimal(raDeg: number, decDeg: number): string {
  const normRa = ((raDeg % 360) + 360) % 360;
  const totalRaSec = (normRa / 15.0) * 3600.0;
  const h = Math.floor(totalRaSec / 3600);
  const m = Math.floor((totalRaSec % 3600) / 60);
  const s = (totalRaSec % 60).toFixed(1);

  const sign = decDeg >= 0 ? "+" : "-";
  const totalDecSec = Math.round(Math.abs(decDeg) * 3600.0);
  const d = Math.floor(totalDecSec / 3600);
  const dm = Math.floor((totalDecSec % 3600) / 60);
  const ds = totalDecSec % 60;

  const raStr = `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}'${String(s).padStart(4, "0")}"`;
  const decStr = `${sign}${String(d).padStart(2, "0")}°${String(dm).padStart(2, "0")}'${String(ds).padStart(2, "0")}"`;

  return `${raStr} ${decStr} J2000`;
}

/**
 * Computes facts for the selected star or region based solely on vendored catalogue data.
 */
export function computeCardFacts(
  selection: SkySelection,
  constellations: ConstellationInfo[],
  stars: StarRecord[] = []
): ShareCardFacts {
  if (selection.kind === "region") {
    const con = constellations.find((c) => c.id === selection.abbr) || selection.constellation;
    const title = selection.name.toUpperCase();
    const area = selection.areaSqDeg ?? con?.area ?? 0;

    // Calculate constellation area rank among all 88
    const sortedConstellations = [...constellations].sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
    const rankIndex = sortedConstellations.findIndex((c) => c.id === selection.abbr);
    const rank = rankIndex >= 0 ? rankIndex + 1 : null;
    const skyPercent = ((area / TOTAL_SKY_SQ_DEG) * 100).toFixed(1);

    const facts: FactLine[] = [];

    // Fact 1: Area
    if (area > 0) {
      const rankSuffix = rank ? `, rank ${rank}/88` : "";
      facts.push({
        label: "Area",
        value: `${Math.round(area).toLocaleString()} sq deg (${skyPercent}% of sky${rankSuffix})`,
      });
    }

    // Fact 2: Brightest Stars inside region (up to 3 named stars from catalogue)
    let namedStarsStr = "";
    if (con?.brightestStars && con.brightestStars.length > 0) {
      namedStarsStr = con.brightestStars.slice(0, 3).map((s) => s.name).join(", ");
    } else {
      const regionStars = stars
        .filter((s) => s.con === selection.abbr)
        .sort((a, b) => a.mag - b.mag);
      const namedRegionStars = regionStars
        .filter((s) => s.label)
        .slice(0, 3)
        .map((s) => s.label);
      if (namedRegionStars.length > 0) {
        namedStarsStr = namedRegionStars.join(", ");
      }
    }

    if (namedStarsStr) {
      facts.push({
        label: "Brightest Stars",
        value: namedStarsStr,
      });
    }

    const regionStars = stars
      .filter((s) => s.con === selection.abbr);

    // Fact 3: Catalogue stars count
    if (regionStars.length > 0) {
      facts.push({
        label: "Catalogue Stars",
        value: `${regionStars.length} stars (V ≤ 6.5)`,
      });
    }

    // Fact 4: Abbreviation
    facts.push({
      label: "Abbreviation",
      value: `IAU: ${selection.abbr}`,
    });

    return {
      title,
      coordinatesSexagesimal: formatCoordinatesSexagesimal(selection.ra, selection.dec),
      facts: facts.slice(0, 4),
    };
  }

  // Star Selection
  const title = (selection.name || `HIP ${selection.id}`).toUpperCase();
  const facts: FactLine[] = [];

  // Fact 1: Visual Magnitude
  facts.push({
    label: "Magnitude",
    value: `V = ${selection.mag.toFixed(2)} (catalogue)`,
  });

  // Fact 2: Color Index B-V (if present)
  if (selection.bv !== undefined && selection.bv !== null) {
    facts.push({
      label: "Colour Index",
      value: `B−V = ${selection.bv >= 0 ? "+" : ""}${selection.bv.toFixed(2)}`,
    });
  }

  // Fact 3: Constellation
  if (selection.constellation) {
    facts.push({
      label: "Constellation",
      value: `${selection.constellation.name} (${selection.constellation.id})`,
    });
  }

  // Fact 4: Catalogue ID
  facts.push({
    label: "Catalogue ID",
    value: `Hipparcos HIP ${selection.id}`,
  });

  return {
    title,
    coordinatesSexagesimal: formatCoordinatesSexagesimal(selection.ra, selection.dec),
    facts: facts.slice(0, 4),
  };
}
