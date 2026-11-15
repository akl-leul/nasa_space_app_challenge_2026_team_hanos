/**
 * Hero Artwork (Star Flare & Region Boundary Map)
 *
 * Drawn purely in canvas code from real catalogue measurements (B-V, magnitude,
 * stereographic projection of real boundary coordinates). No raster assets.
 */

import { toExportPx, LAYOUT_DESIGN } from "./layout";
import { projectStereographic } from "./projection";

export interface StarFlareOptions {
  bv: number | null;
  magnitude: number | null;
  isSlate: boolean;
}

export function drawStarFlare(
  ctx: CanvasRenderingContext2D,
  options: StarFlareOptions
): void {
  const cx = toExportPx(LAYOUT_DESIGN.hero.starCenter.x);
  const cy = toExportPx(LAYOUT_DESIGN.hero.starCenter.y);

  // Magnitude scaling (mild +/- 25% scale based on apparent magnitude V)
  const mag = options.magnitude ?? 3.0;
  const magFactor = Math.min(
    1.25,
    Math.max(0.75, 1.0 + (3.0 - Math.min(10.0, Math.max(-2.0, mag))) * 0.05)
  );

  const bv = options.bv ?? (options.isSlate ? 0.0 : 0.6);

  ctx.save();

  if (options.isSlate || bv < 0.3) {
    // -------------------------------------------------------------
    // SLATE / WHITE VARIANT (Dwarf Reference Style)
    // 4 sharp cross rays, faint diagonal streak, two bubble ghosts
    // -------------------------------------------------------------
    const rayLength = toExportPx(220) * magFactor;
    const coreRadius = toExportPx(16) * magFactor;

    // Soft white-blue aura
    const auraGrad = ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      toExportPx(130) * magFactor
    );
    auraGrad.addColorStop(0, "rgba(220, 235, 255, 0.45)");
    auraGrad.addColorStop(0.3, "rgba(180, 210, 255, 0.2)");
    auraGrad.addColorStop(1, "rgba(160, 190, 255, 0.0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, toExportPx(130) * magFactor, 0, Math.PI * 2);
    ctx.fill();

    // 4 sharp cross rays (vertical & horizontal)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = Math.max(1.0, toExportPx(1.2));
    ctx.beginPath();
    ctx.moveTo(cx - rayLength, cy);
    ctx.lineTo(cx + rayLength, cy);
    ctx.moveTo(cx, cy - rayLength);
    ctx.lineTo(cx, cy + rayLength);
    ctx.stroke();

    // Faint diagonal streak
    ctx.strokeStyle = "rgba(200, 225, 255, 0.25)";
    ctx.lineWidth = Math.max(1.0, toExportPx(1.0));
    ctx.beginPath();
    ctx.moveTo(cx - rayLength * 0.55, cy - rayLength * 0.45);
    ctx.lineTo(cx + rayLength * 0.55, cy + rayLength * 0.45);
    ctx.stroke();

    // Faint circular ring
    ctx.strokeStyle = "rgba(210, 230, 255, 0.22)";
    ctx.lineWidth = Math.max(1.0, toExportPx(1.0));
    ctx.beginPath();
    ctx.arc(cx, cy, toExportPx(85) * magFactor, 0, Math.PI * 2);
    ctx.stroke();

    // White-hot core
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
    coreGrad.addColorStop(0, "#FFFFFF");
    coreGrad.addColorStop(0.6, "rgba(255, 255, 255, 0.9)");
    coreGrad.addColorStop(1, "rgba(220, 240, 255, 0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // Two bubble ghosts to the upper right
    const ghost1X = cx + toExportPx(75) * magFactor;
    const ghost1Y = cy - toExportPx(60) * magFactor;
    ctx.strokeStyle = "rgba(200, 225, 255, 0.28)";
    ctx.lineWidth = Math.max(1.0, toExportPx(1.0));
    ctx.beginPath();
    ctx.arc(ghost1X, ghost1Y, toExportPx(18) * magFactor, 0, Math.PI * 2);
    ctx.stroke();

    const ghost2X = cx + toExportPx(125) * magFactor;
    const ghost2Y = cy - toExportPx(105) * magFactor;
    ctx.strokeStyle = "rgba(180, 210, 255, 0.20)";
    ctx.beginPath();
    ctx.arc(ghost2X, ghost2Y, toExportPx(28) * magFactor, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // -------------------------------------------------------------
    // GOLD / WARM VARIANT (Star Reference Style)
    // 6-8 thin rays with twist, white-hot core, faint ring, ghosts
    // -------------------------------------------------------------
    const rayLength = toExportPx(210) * magFactor;
    const coreRadius = toExportPx(22) * magFactor;

    // Warm radial glow
    const glowGrad = ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      toExportPx(150) * magFactor
    );
    glowGrad.addColorStop(0, "rgba(255, 240, 190, 0.55)");
    glowGrad.addColorStop(0.35, "rgba(255, 210, 130, 0.24)");
    glowGrad.addColorStop(0.7, "rgba(230, 180, 90, 0.08)");
    glowGrad.addColorStop(1, "rgba(200, 150, 60, 0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, toExportPx(150) * magFactor, 0, Math.PI * 2);
    ctx.fill();

    // 8 thin twisted rays
    const rayCount = 8;
    const twistAngle = 0.12; // slight twist
    ctx.strokeStyle = "rgba(255, 235, 180, 0.75)";
    ctx.lineWidth = Math.max(1.0, toExportPx(1.2));

    for (let i = 0; i < rayCount; i++) {
      const angle = (i * Math.PI) / (rayCount / 2) + twistAngle;
      const len = rayLength * (i % 2 === 0 ? 1.0 : 0.65);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.stroke();
    }

    // Faint circular ring (radius ~90 design px = 108 export px)
    ctx.strokeStyle = "rgba(255, 220, 140, 0.26)";
    ctx.lineWidth = Math.max(1.0, toExportPx(1.2));
    ctx.beginPath();
    ctx.arc(cx, cy, toExportPx(92) * magFactor, 0, Math.PI * 2);
    ctx.stroke();

    // White-hot core
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
    coreGrad.addColorStop(0, "#FFFFFF");
    coreGrad.addColorStop(0.5, "rgba(255, 255, 240, 0.92)");
    coreGrad.addColorStop(0.85, "rgba(255, 230, 170, 0.35)");
    coreGrad.addColorStop(1, "rgba(255, 210, 120, 0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2 to 3 small ghost circles to the upper right
    const ghosts = [
      { dx: 72, dy: -58, r: 16, a: 0.28 },
      { dx: 118, dy: -96, r: 26, a: 0.19 },
      { dx: 165, dy: -134, r: 12, a: 0.14 },
    ];
    for (const g of ghosts) {
      ctx.strokeStyle = `rgba(255, 225, 150, ${g.a})`;
      ctx.lineWidth = Math.max(1.0, toExportPx(1.0));
      ctx.beginPath();
      ctx.arc(
        cx + toExportPx(g.dx) * magFactor,
        cy + toExportPx(g.dy) * magFactor,
        toExportPx(g.r) * magFactor,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

export interface RegionHeroOptions {
  centerRa: number;
  centerDec: number;
  targetPolygons: [number, number][][];
  allBoundaries?: [number, number][][];
}

export function drawRegionBoundaryMap(
  ctx: CanvasRenderingContext2D,
  options: RegionHeroOptions
): void {
  const boxX = toExportPx(LAYOUT_DESIGN.hero.regionBox.x);
  const boxY = toExportPx(LAYOUT_DESIGN.hero.regionBox.y);
  const boxW = toExportPx(LAYOUT_DESIGN.hero.regionBox.w);
  const boxH = toExportPx(LAYOUT_DESIGN.hero.regionBox.h);

  ctx.save();
  // Hard clipping at box edges matching the boundaries reference
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.clip();

  // Stereographic projection centered on the region center
  const centerRa = options.centerRa;
  const centerDec = options.centerDec;

  // Project all points of the selected region to determine bounds
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const ring of options.targetPolygons) {
    for (const [ra, dec] of ring) {
      const p = projectStereographic(ra, dec, centerRa, centerDec);
      if (p.visible) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }

  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Fit into box with 14% padding
  const pad = 0.86;
  const scaleX = (boxW * pad) / spanX;
  const scaleY = (boxH * pad) / spanY;
  const projScale = Math.min(scaleX, scaleY);

  const boxCenterX = boxX + boxW / 2;
  const boxCenterY = boxY + boxH / 2;

  // In projection.ts, x is already negative for East (LEFT), and y is positive for North (UP)
  // On canvas, screen-x increases to the right (+x), screen-y increases down (-y)
  const toCanvasX = (px: number) => boxCenterX + (px - midX) * projScale;
  const toCanvasY = (py: number) => boxCenterY - (py - midY) * projScale;

  // 1. Draw neighboring boundaries if provided (thin solid grey lines ~1.5 design px = 1.8 export px)
  if (options.allBoundaries) {
    ctx.strokeStyle = "rgba(110, 110, 102, 0.85)";
    ctx.lineWidth = Math.max(1.0, toExportPx(1.5));
    ctx.setLineDash([]);

    for (const seg of options.allBoundaries) {
      let drawing = false;
      ctx.beginPath();
      for (const [ra, dec] of seg) {
        const p = projectStereographic(ra, dec, centerRa, centerDec);
        if (p.visible) {
          const cx = toCanvasX(p.x);
          const cy = toCanvasY(p.y);
          if (!drawing) {
            ctx.moveTo(cx, cy);
            drawing = true;
          } else {
            ctx.lineTo(cx, cy);
          }
        } else {
          drawing = false;
        }
      }
      ctx.stroke();
    }
  }

  // 2. Draw selected region's boundaries (thick dashed white line ~2.2 design px = 2.64 export px)
  ctx.strokeStyle = "#F2F2F2";
  ctx.lineWidth = Math.max(1.5, toExportPx(2.2));
  ctx.setLineDash([toExportPx(6.0), toExportPx(3.5)]);
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";

  for (const ring of options.targetPolygons) {
    let drawing = false;
    ctx.beginPath();
    for (const [ra, dec] of ring) {
      const p = projectStereographic(ra, dec, centerRa, centerDec);
      if (p.visible) {
        const cx = toCanvasX(p.x);
        const cy = toCanvasY(p.y);
        if (!drawing) {
          ctx.moveTo(cx, cy);
          drawing = true;
        } else {
          ctx.lineTo(cx, cy);
        }
      } else {
        drawing = false;
      }
    }
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}
