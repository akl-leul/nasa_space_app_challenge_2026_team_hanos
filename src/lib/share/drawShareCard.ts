/**
 * drawShareCard.ts - Pixel-matched 1920x1080 canvas renderer
 *
 * Implements Prompt 08: Exact reproduction of the "Hanos Cards" Canva artwork,
 * driven by the selected star or region.
 * No sparkles anywhere. Slabs are frosted glass pills with brightened texture and edge glow.
 */

import { SkySelection, ConstellationInfo, StarRecord } from "@/types/sky";
import { buildShareUrl } from "./shareUrl";
import { computeCardFacts, formatStraightCoordinatesSexagesimal } from "./facts";
import { generateQrMatrix } from "./qr";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  toExportPx,
  LAYOUT_DESIGN,
  CARD_COLORS,
} from "./layout";
import { drawLogoMark } from "./mark";
import { loadShareCardFonts } from "./fonts";
import { createBlurredBackground, drawCornerSlabs } from "./slabs";
import { drawStarFlare, drawRegionBoundaryMap, drawGalaxyHero, drawAsteroidHero } from "./hero";
import type { TargetCategory } from "@/types/sky";

/** Set to true by default to match the dark Canva QR tile with light modules */
export const QR_INVERTED = true;

export interface ShareCardData {
  selection: SkySelection;
  constellations: ConstellationInfo[];
  stars: StarRecord[];
  boundaryPositions?: Float32Array | null;
  constellationPolygons?: Record<string, number[][][]> | null;
  siteUrl?: string;
  isFixture?: boolean; // Development-only fixture mode for diff harness
}

// In-memory cache for loaded background texture images
const textureImageCache = new Map<string, HTMLImageElement>();

export async function loadTextureImage(path: string): Promise<HTMLImageElement> {
  const cached = textureImageCache.get(path);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      textureImageCache.set(path, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load texture at ${path}`));
    img.src = path;
  });
}

/**
 * Draws the 1920x1080 share card on the provided canvas.
 */
export async function drawShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData
): Promise<void> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const category: TargetCategory =
    data.selection.kind === "region"
      ? "region"
      : data.selection.kind === "object"
      ? data.selection.category || "object"
      : "star";

  const isRegion = category === "region";
  const isGalaxy = category === "galaxy";
  const isAsteroid = category === "asteroid";
  const isDwarf = category === "dwarf";

  const starBv = !isRegion && "bv" in data.selection ? (data.selection.bv ?? null) : null;
  const starMag = !isRegion && "mag" in data.selection ? (data.selection.mag ?? null) : null;
  const isSlateStar = !isRegion && (isDwarf || (starBv !== null && starBv < 0.3));

  // Variant selection: region -> graphite, galaxy -> galaxy, asteroid -> planet, blue-white/dwarf -> slate, gold star -> gold
  let variant: "graphite" | "slate" | "gold" | "galaxy" | "planet";
  if (isRegion) {
    variant = "graphite";
  } else if (isGalaxy) {
    variant = "galaxy";
  } else if (isAsteroid) {
    variant = "planet";
  } else if (isSlateStar) {
    variant = "slate";
  } else {
    variant = "gold";
  }

  const variantColors = CARD_COLORS[variant];

  const heroPath = isGalaxy
    ? "/share/hero/hero-galaxy.png"
    : isAsteroid
    ? "/share/hero/hero-asteroid.png"
    : isDwarf
    ? "/share/hero/hero-dwarf.png"
    : !isRegion
    ? "/share/hero/hero-star.png"
    : null;

  // 1. Load fonts, background texture image and hero image concurrently
  const [fontStatus, textureImage, heroImage] = await Promise.all([
    loadShareCardFonts(),
    loadTextureImage(variantColors.texturePath).catch(() => null),
    heroPath ? loadTextureImage(heroPath).catch(() => null) : Promise.resolve(null),
  ]);

  // 2. Base solid ground (#111111)
  ctx.fillStyle = CARD_COLORS.ground;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 3. Draw texture image if loaded
  if (textureImage && textureImage.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(textureImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  }

  // 4. Pre-blurred copy of the background for frosted slabs
  const blurredBg = createBlurredBackground(canvas, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 5. Draw 4 corner slabs (frosted glass pills)
  drawCornerSlabs(ctx, blurredBg, isRegion);

  // 6. Dividing rules beside QR
  ctx.save();
  ctx.strokeStyle = CARD_COLORS.rules;
  ctx.lineWidth = toExportPx(LAYOUT_DESIGN.rules.thickness);
  ctx.beginPath();
  // Left rule
  ctx.moveTo(
    toExportPx(LAYOUT_DESIGN.rules.left.x1),
    toExportPx(LAYOUT_DESIGN.rules.left.y1)
  );
  ctx.lineTo(
    toExportPx(LAYOUT_DESIGN.rules.left.x2),
    toExportPx(LAYOUT_DESIGN.rules.left.y2)
  );
  // Right rule
  ctx.moveTo(
    toExportPx(LAYOUT_DESIGN.rules.right.x1),
    toExportPx(LAYOUT_DESIGN.rules.right.y1)
  );
  ctx.lineTo(
    toExportPx(LAYOUT_DESIGN.rules.right.x2),
    toExportPx(LAYOUT_DESIGN.rules.right.y2)
  );
  ctx.stroke();
  ctx.restore();

  // 7. QR Code tile & modules
  const qrTileX = toExportPx(LAYOUT_DESIGN.qrTile.x);
  const qrTileY = toExportPx(LAYOUT_DESIGN.qrTile.y);
  const qrTileW = toExportPx(LAYOUT_DESIGN.qrTile.w);
  const qrTileH = toExportPx(LAYOUT_DESIGN.qrTile.h);
  const qrTileR = toExportPx(LAYOUT_DESIGN.qrTile.radius);

  ctx.save();
  ctx.fillStyle = CARD_COLORS.qrTileFill;
  ctx.beginPath();
  ctx.roundRect(qrTileX, qrTileY, qrTileW, qrTileH, qrTileR);
  ctx.fill();
  ctx.restore();

  // Generate & render QR Code inside tile
  try {
    const shareUrl = buildShareUrl(data.selection, data.siteUrl);
    const qrMatrix = await generateQrMatrix(shareUrl, "M");
    const modCount = qrMatrix.moduleCount;

    const modBoxX = toExportPx(LAYOUT_DESIGN.qrTile.moduleBox.x);
    const modBoxY = toExportPx(LAYOUT_DESIGN.qrTile.moduleBox.y);
    const modBoxW = toExportPx(LAYOUT_DESIGN.qrTile.moduleBox.w);

    const cellSize = modBoxW / modCount;

    ctx.save();
    ctx.fillStyle = QR_INVERTED
      ? CARD_COLORS.qrModulesInverted
      : CARD_COLORS.qrModulesNormal;

    for (let r = 0; r < modCount; r++) {
      for (let c = 0; c < modCount; c++) {
        if (qrMatrix.isDark(r, c)) {
          ctx.fillRect(
            modBoxX + c * cellSize,
            modBoxY + r * cellSize,
            Math.ceil(cellSize),
            Math.ceil(cellSize)
          );
        }
      }
    }
    ctx.restore();
  } catch (err) {
    console.error("Failed to render QR Code on share card:", err);
  }

  // 8. Vector H Logo Mark
  drawLogoMark(ctx);

  // 9. Compute Content: Title, Coordinates, Facts
  let titleText = "";
  let coordsText = "";
  let factLines: string[] = [];

  if (data.isFixture) {
    // -------------------------------------------------------------
    // FIXTURE MODE FOR PIXEL-MATCH HARNESS
    // Reproduces exact reference text from Canva PDF
    // -------------------------------------------------------------
    titleText = isRegion ? "BOUNDARIES" : "STAR";
    coordsText = `9°00'37.4"N 38°45'40.3"E`;
    factLines = [
      "11,400-Year Orbit: One year lasts over 11 millennia.",
      "Mars-Red: One of the solar system's reddest objects.",
      "Extreme Cold: Drops to -240°C (-400°F).",
      "Mystery Gravity: Its path hints at Planet Nine or a passing star.",
    ];
  } else {
    // Real catalogue content
    const cardFacts = computeCardFacts(
      data.selection,
      data.constellations,
      data.stars
    );
    titleText = cardFacts.title;
    coordsText = formatStraightCoordinatesSexagesimal(
      data.selection.ra,
      data.selection.dec
    );
    factLines = cardFacts.facts.map((f) => `${f.label}: ${f.value}`);
  }

  // 10. Title (Hatton Bold uppercase, right-aligned to x = 1316 design px)
  const titleRightX = toExportPx(LAYOUT_DESIGN.title.rightX);
  const titleBaselineY = toExportPx(LAYOUT_DESIGN.title.baselineY);
  const maxTitleW = toExportPx(LAYOUT_DESIGN.title.maxWidth);

  ctx.save();
  ctx.fillStyle = variantColors.title;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  let titleFontSize = toExportPx(LAYOUT_DESIGN.title.baseFontSize);
  ctx.font = `700 ${titleFontSize}px ${fontStatus.fontFamilyTitle}`;
  let titleW = ctx.measureText(titleText).width;

  // Auto-scale title down to 55% if wider than maxTitleW
  const minTitleFontSize = toExportPx(LAYOUT_DESIGN.title.baseFontSize) * 0.55;
  if (titleW > maxTitleW) {
    const scaleFactor = Math.max(0.55, maxTitleW / titleW);
    titleFontSize = Math.max(minTitleFontSize, titleFontSize * scaleFactor);
    ctx.font = `700 ${titleFontSize}px ${fontStatus.fontFamilyTitle}`;
    titleW = ctx.measureText(titleText).width;
  }

  ctx.fillText(titleText, titleRightX, titleBaselineY);

  // Title underline (y = 328 design px, 1.5 design px thick, from title left - 8px to right edge)
  const underlineLeftX = Math.max(
    toExportPx(LAYOUT_DESIGN.hero.regionBox.x + LAYOUT_DESIGN.hero.regionBox.w),
    titleRightX - titleW - toExportPx(LAYOUT_DESIGN.titleUnderline.gapLeft)
  );
  const underlineY = toExportPx(LAYOUT_DESIGN.titleUnderline.y);
  ctx.strokeStyle = CARD_COLORS.rules;
  ctx.lineWidth = toExportPx(LAYOUT_DESIGN.titleUnderline.thickness);
  ctx.beginPath();
  ctx.moveTo(underlineLeftX, underlineY);
  ctx.lineTo(titleRightX, underlineY);
  ctx.stroke();

  // 11. Coordinates Line (Hatton Bold white, right-aligned to x = 1306 design px, center y = 370)
  const coordsRightX = toExportPx(LAYOUT_DESIGN.coordinates.rightX);
  const coordsCenterY = toExportPx(LAYOUT_DESIGN.coordinates.centerY);
  const coordsFontSize = toExportPx(LAYOUT_DESIGN.coordinates.fontSize);

  ctx.font = `700 ${coordsFontSize}px ${fontStatus.fontFamilyTitle}`;
  ctx.fillStyle = CARD_COLORS.coordinatesWhite;
  ctx.textBaseline = "middle";
  ctx.fillText(coordsText, coordsRightX, coordsCenterY);

  // 12. Facts Block (Inter Bold 700, right-aligned to x = 1303 design px, pitch = 25 design px)
  const factsRightX = toExportPx(LAYOUT_DESIGN.facts.rightX);
  const factsFontSize = toExportPx(LAYOUT_DESIGN.facts.fontSize);
  ctx.font = `700 ${factsFontSize}px ${fontStatus.fontFamilyFacts}`;
  ctx.fillStyle = variantColors.facts;
  ctx.textBaseline = "middle";

  for (let i = 0; i < Math.min(4, factLines.length); i++) {
    const lineCenterY = toExportPx(LAYOUT_DESIGN.facts.lineCentersY[i]);
    const lineText = factLines[i].slice(0, LAYOUT_DESIGN.facts.maxChars);
    ctx.fillText(lineText, factsRightX, lineCenterY);
  }

  // 13. Footer Label: "Catalogue data. Not SPHEREx data."
  const footerX = toExportPx(LAYOUT_DESIGN.footer.centerX);
  const footerY = toExportPx(LAYOUT_DESIGN.footer.centerY);
  const footerFontSize = toExportPx(LAYOUT_DESIGN.footer.fontSize);

  ctx.font = `400 ${footerFontSize}px ${fontStatus.fontFamilyFacts}`;
  ctx.fillStyle = CARD_COLORS.footerCream;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Catalogue data. Not SPHEREx data.", footerX, footerY);

  ctx.restore();

  // 14. Hero Artwork (Left side, only if not fixture mode)
  if (!data.isFixture) {
    if (isRegion && data.selection.kind === "region") {
      // Find polygons for this region
      const abbr = data.selection.abbr;
      const targetRings = data.constellationPolygons?.[abbr] ?? [];
      const allBoundariesList: [number, number][][] = [];

      // If full boundaries exist, convert them for surrounding context lines
      if (data.boundaryPositions && data.boundaryPositions.length > 0) {
        const bp = data.boundaryPositions;
        for (let i = 0; i < bp.length; i += 4) {
          allBoundariesList.push([
            [bp[i], bp[i + 1]],
            [bp[i + 2], bp[i + 3]],
          ]);
        }
      }

      drawRegionBoundaryMap(ctx, {
        centerRa: data.selection.ra,
        centerDec: data.selection.dec,
        targetPolygons: targetRings as [number, number][][],
        allBoundaries: allBoundariesList,
      });
    } else if (isGalaxy) {
      drawGalaxyHero(ctx, heroImage);
    } else if (isAsteroid) {
      drawAsteroidHero(ctx, heroImage);
    } else {
      drawStarFlare(ctx, {
        bv: starBv,
        magnitude: starMag,
        isSlate: isSlateStar,
      });
    }
  }
}
