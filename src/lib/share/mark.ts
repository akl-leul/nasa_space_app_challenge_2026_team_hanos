/**
 * Vector Logo Mark (H-Mark)
 *
 * Drawn algorithmically in canvas vector paths to avoid using public/logo.png
 * (which contains a baked-in checkerboard artifact without alpha channel).
 */

import { toExportPx, LAYOUT_DESIGN, CARD_COLORS } from "./layout";

export function drawLogoMark(ctx: CanvasRenderingContext2D): void {
  const x = toExportPx(LAYOUT_DESIGN.logoMark.x);
  const y = toExportPx(LAYOUT_DESIGN.logoMark.y);
  const w = toExportPx(LAYOUT_DESIGN.logoMark.w);
  const h = toExportPx(LAYOUT_DESIGN.logoMark.h);

  ctx.save();
  ctx.fillStyle = CARD_COLORS.logo;
  ctx.strokeStyle = CARD_COLORS.logo;
  ctx.lineWidth = Math.max(1.2, toExportPx(1.2));

  // 1. Four vertical bars
  // Left outer bar: [0, 0.117], full height
  ctx.fillRect(x + 0.0 * w, y, 0.117 * w, h);

  // Right outer bar: [0.883, 1.0], full height
  ctx.fillRect(x + 0.883 * w, y, 0.117 * w, h);

  // Left inner bar: [0.204, 0.318], split by y gap [0.457, 0.530]
  ctx.fillRect(x + 0.204 * w, y, (0.318 - 0.204) * w, 0.457 * h);
  ctx.fillRect(
    x + 0.204 * w,
    y + 0.53 * h,
    (0.318 - 0.204) * w,
    (1.0 - 0.53) * h
  );

  // Right inner bar: [0.682, 0.797], split by y gap [0.457, 0.530]
  ctx.fillRect(x + 0.682 * w, y, (0.797 - 0.682) * w, 0.457 * h);
  ctx.fillRect(
    x + 0.682 * w,
    y + 0.53 * h,
    (0.797 - 0.682) * w,
    (1.0 - 0.53) * h
  );

  // 2. 4-point star outline passing through the central gap
  // Center at (0.50, 0.49), spanning x: 0.285..0.715, y: 0.266..0.726
  const cx = x + 0.5 * w;
  const cy = y + 0.49 * h;
  const rx = (0.715 - 0.285) * 0.5 * w;
  const ry = (0.726 - 0.266) * 0.5 * h;
  const innerR = Math.min(rx, ry) * 0.22;

  ctx.beginPath();
  // Top tip
  ctx.moveTo(cx, cy - ry);
  // Top-right inner corner
  ctx.quadraticCurveTo(cx, cy, cx + innerR, cy - innerR);
  // Right tip
  ctx.quadraticCurveTo(cx, cy, cx + rx, cy);
  // Bottom-right inner corner
  ctx.quadraticCurveTo(cx, cy, cx + innerR, cy + innerR);
  // Bottom tip
  ctx.quadraticCurveTo(cx, cy, cx, cy + ry);
  // Bottom-left inner corner
  ctx.quadraticCurveTo(cx, cy, cx - innerR, cy + innerR);
  // Left tip
  ctx.quadraticCurveTo(cx, cy, cx - rx, cy);
  // Top-left inner corner
  ctx.quadraticCurveTo(cx, cy, cx - innerR, cy - innerR);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}
