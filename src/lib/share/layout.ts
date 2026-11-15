/**
 * Share Card Layout Constants
 *
 * All primary measurements are defined in 1600x900 design pixels (Canva template)
 * and multiplied by SCALE = 1.2 for the 1920x1080 export canvas.
 */

export const DESIGN_WIDTH = 1600;
export const DESIGN_HEIGHT = 900;
export const SCALE = 1.2;

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

/** Slabs in design px (130w x 509l stadium pill, radius 65) */
export const SLAB_WIDTH_DESIGN = 130;
export const SLAB_LENGTH_DESIGN = 509;
export const SLAB_RADIUS_DESIGN = 65;

export const SLABS_DESIGN = {
  topLeft: { x: -40, y: -210, w: 130, h: 509, orientation: "vertical" as const },
  topRight: { x: 1307, y: -40, w: 509, h: 130, orientation: "horizontal" as const },
  bottomLeft: { x: -164, y: 810, w: 509, h: 130, orientation: "horizontal" as const },
  bottomRightStar: { x: 1510, y: 646, w: 130, h: 509, orientation: "vertical" as const },
  bottomRightRegion: { x: 1483, y: 646, w: 130, h: 509, orientation: "vertical" as const },
};

/** Typography and layout metrics in design px */
export const LAYOUT_DESIGN = {
  // Title (Hatton Bold uppercase)
  title: {
    rightX: 1316,
    baselineY: 305,
    capTopY: 249,
    baseFontSize: 82, // S-glyph ~62px
    maxWidth: 613,
  },
  titleUnderline: {
    y: 328,
    thickness: 1.5,
    rightX: 1316,
    gapLeft: 8,
  },
  // Coordinates line (Hatton Bold white)
  coordinates: {
    rightX: 1306,
    centerY: 370,
    fontSize: 14,
  },
  // Facts lines (Inter Bold 700)
  facts: {
    rightX: 1303,
    fontSize: 19.5,
    lineCentersY: [431, 456, 481, 507],
    linePitch: 25,
    maxChars: 64,
  },
  // Logo H vector mark
  logoMark: {
    x: 1319,
    y: 165,
    w: 95,
    h: 95,
  },
  // QR code tile
  qrTile: {
    x: 729.7,
    y: 670.0,
    w: 140.6,
    h: 140.0,
    radius: 12,
    moduleBox: {
      x: 741.7,
      y: 679.8,
      w: 120.4,
      h: 120.4,
    },
  },
  // Dividing rules beside QR
  rules: {
    thickness: 1.5,
    left: { x1: 294.0, y1: 741.8, x2: 713.6, y2: 741.8 },
    right: { x1: 893.7, y1: 743.4, x2: 1313.3, y2: 743.4 },
  },
  // Footer label
  footer: {
    centerX: 800,
    centerY: 862,
    fontSize: 9,
  },
  // Hero bounds
  hero: {
    starCenter: { x: 347, y: 364 },
    regionBox: { x: 213, y: 151, w: 349, h: 351 },
  },
};

/** Palette tokens for share card canvas */
export const CARD_COLORS = {
  ground: "#111111",
  rules: "#B0B0AA",
  logo: "#CFCFCA",
  qrTileFill: "#151515",
  qrModulesInverted: "#DBDBDB",
  qrModulesNormal: "#111111",
  coordinatesWhite: "#FFFFFF",
  footerCream: "rgba(245, 243, 237, 0.45)",

  // Variant specific colors
  gold: {
    title: "#EAEAE7",
    facts: "#EBEBE7",
    texturePath: "/share/tex-star-gold.webp",
  },
  slate: {
    title: "#EAEAEA",
    facts: "#EBEBEB",
    texturePath: "/share/tex-dwarf-slate.webp",
  },
  graphite: {
    title: "#EAEAEA",
    facts: "#EBEBEB",
    texturePath: "/share/tex-region-graphite.webp",
  },
  galaxy: {
    title: "#F0EBF5",
    facts: "#EBE6F2",
    texturePath: "/share/tex-galaxy-violet.webp",
  },
  planet: {
    title: "#EAEAE5",
    facts: "#EBEBE5",
    texturePath: "/share/tex-planet-olive.webp",
  },
};

/** Scale a design pixel value to export (1920x1080) space */
export function toExportPx(val: number): number {
  return val * SCALE;
}
