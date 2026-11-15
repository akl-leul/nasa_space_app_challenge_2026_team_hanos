import type { TargetCategory } from "@/types/sky";

/**
 * Strips catalog prefix noise like "NAME ", "Name ", "NAME:", "* ", "V* "
 * so users see clean celestial object names (e.g. "Ceres" instead of "NAME Ceres").
 */
export function cleanObjectName(rawName: string | undefined | null): string {
  if (!rawName) return "";
  return rawName
    .replace(/^(NAME|Name)\s*[:\-]?\s+/i, "")
    .replace(/^(\*|V\*)\s+/i, "")
    .trim();
}

/**
 * Detects whether a celestial object is a star, brown dwarf, galaxy, asteroid/planet, or region
 * based on its name, SIMBAD otype, and detail string.
 */
export function detectCategory(
  name: string,
  objectType?: string | null,
  detail?: string
): TargetCategory {
  const n = (name || "").toLowerCase();
  const d = (detail || "").toLowerCase();
  const ot = (objectType || "").toUpperCase();

  // 1. Constellations / Regions
  if (d.includes("constellation") || n.startsWith("region:") || n.startsWith("iau ")) {
    return "region";
  }

  // 2. Galaxies
  if (
    ot === "G" ||
    ot === "AGN" ||
    ot.includes("GALAXY") ||
    ot.includes("SEYFERT") ||
    ot.includes("LINER") ||
    ot.includes("BLAZAR") ||
    ot.includes("QUASAR") ||
    n.includes("galaxy") ||
    n.includes("andromeda") ||
    n.includes("triangulum") ||
    n.includes("whirlpool") ||
    n.includes("pinwheel") ||
    n.includes("sombrero") ||
    n.includes("centaurus a") ||
    n.includes("magellanic") ||
    /^m\s*(31|32|33|51|81|82|87|101|104)\b/i.test(n) ||
    /^ngc\s*\d+/i.test(n) ||
    /^ugc\s*\d+/i.test(n) ||
    /^ic\s*\d+/i.test(n) ||
    d.includes("galaxy")
  ) {
    return "galaxy";
  }

  // 3. Asteroids / Solar-system bodies / Comets / Minor Planets
  if (
    ot.includes("ASTEROID") ||
    ot.includes("PLANET") ||
    ot.includes("COMET") ||
    n.includes("asteroid") ||
    n.includes("ceres") ||
    n.includes("pallas") ||
    n.includes("vesta") ||
    n.includes("hygiea") ||
    n.includes("apophis") ||
    n.includes("eros") ||
    n.includes("sedna") ||
    n.includes("bennu") ||
    n.includes("ryugu") ||
    n.includes("29p") ||
    d.includes("solar-system") ||
    d.includes("solar system") ||
    d.includes("jpl horizons") ||
    d.includes("irsa most") ||
    d.includes("asteroid") ||
    d.includes("minor planet") ||
    d.includes("comet")
  ) {
    return "asteroid";
  }

  // 4. Brown Dwarfs
  if (
    ot === "BD*" ||
    ot.includes("BROWN DWARF") ||
    n.includes("wise 0855") ||
    n.includes("0855") ||
    n.includes("epsilon indi b") ||
    n.includes("eps ind b") ||
    n.includes("gliese 229 b") ||
    n.includes("luhman 16") ||
    n.includes("trappist-1") ||
    d.includes("brown dwarf")
  ) {
    return "dwarf";
  }

  // 5. Default: Star
  return "star";
}
