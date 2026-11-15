import type { ActiveTarget } from "@/components/explore/toolbar/ExploreContext";

export interface ResolveResult extends ActiveTarget {
  raJ2000: number;
  decJ2000: number;
  parallaxMas: number | null;
  objectType: string | null;
  resolvedBy: string;
  nasaReference?: { derived_epoch: number; residual_arcsec_after_propagation: number } | null;
}

const OTYPE_WORDS: Record<string, string> = {
  "BY*": "red dwarf star", "BD*": "brown dwarf", "TT*": "young variable star", "Mi*": "Mira variable star",
  "SB*": "double star", "*": "star", AGN: "galaxy with an active core", G: "galaxy",
};

/** Resolve a name or typed coordinates through the API (SIMBAD at run time, real proper motion). */
export async function resolveActiveTarget(name: string, epoch = 2026.0): Promise<ResolveResult> {
  const r = await fetch(`/api/resolve?name=${encodeURIComponent(name.trim())}&epoch=${epoch}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || `Could not resolve "${name}"`);
  const typed = !!d.is_direct_coordinate;
  const words = d.otype ? OTYPE_WORDS[d.otype] ?? d.otype : null;
  const bits: string[] = [];
  if (words) bits.push(words);
  if (d.parallax) bits.push(`${(3261.56 / d.parallax).toFixed(1)} light years away`);
  return {
    name: d.name,
    kind: typed ? "coordinates" : "object",
    ra: d.ra,
    dec: d.dec,
    pmra: d.pmra_cosdec ?? 0,
    pmdec: d.pmdec ?? 0,
    epoch,
    detail: bits.join(", ") || undefined,
    raJ2000: d.ra_j2000,
    decJ2000: d.dec_j2000,
    parallaxMas: d.parallax ?? null,
    objectType: d.otype ?? null,
    resolvedBy: d.resolved_by,
    nasaReference: d.nasa_reference ?? null,
  };
}
