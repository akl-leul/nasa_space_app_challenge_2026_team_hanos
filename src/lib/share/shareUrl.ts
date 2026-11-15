import { SITE_URL } from "@/config/site";
import { SkySelection } from "@/types/sky";

export interface ShareUrlOptions {
  selection: SkySelection;
  siteUrl?: string;
}

/**
 * Calculates a sensible default field of view for a selection:
 * - Region: 2.2 * angular_radius (clamped between 20° and 100°)
 * - Star: 12.0°
 */
export function getDefaultFovForSelection(selection: SkySelection): number {
  if (selection.kind === "region") {
    const area = selection.areaSqDeg ?? 500;
    const angularRadius = Math.sqrt(area / Math.PI);
    const computed = 2.2 * angularRadius;
    return Math.round(Math.max(20.0, Math.min(100.0, computed)) * 10) / 10;
  }
  return 12.0;
}

/**
 * Resolves the public base address used in share links and QR codes: an explicit origin if given, otherwise the
 * site address from the configuration (https://hanos.surf unless NEXT_PUBLIC_SITE_URL says otherwise).
 */
export function getBaseOrigin(explicitOrigin?: string): string {
  if (explicitOrigin && explicitOrigin.trim()) {
    return explicitOrigin.trim().replace(/\/+$/, "");
  }

  return SITE_URL;
}

/**
 * Builds the canonical share URL with exactly 4 parameters: ra, dec, fov, sel.
 */
export function buildShareUrl(selection: SkySelection, explicitOrigin?: string): string {
  const origin = getBaseOrigin(explicitOrigin);
  const fov = getDefaultFovForSelection(selection);

  const raStr = selection.ra.toFixed(2);
  const decStr = selection.dec.toFixed(2);
  const fovStr = fov.toFixed(1);
  const selStr = selection.kind === "region" ? `region:${selection.abbr}` : `star:${selection.id}`;

  return `${origin}/explore?ra=${raStr}&dec=${decStr}&fov=${fovStr}&sel=${encodeURIComponent(selStr)}`;
}

/**
 * Generates an ASCII, lowercase, filesystem-safe filename for exported PNG cards.
 * Format: hanos-<slug>-<abbr-or-hip>.png
 */
export function generateCardFilename(selection: SkySelection): string {
  const rawName = selection.name || (selection.kind === "star" ? `hip-${selection.id}` : selection.abbr);
  const slug = rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const idSuffix = selection.kind === "region" ? selection.abbr.toLowerCase() : `hip${selection.id}`;
  return `hanos-${slug}-${idSuffix}.png`;
}
