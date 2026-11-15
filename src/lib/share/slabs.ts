/**
 * Corner Slabs (Frosted Glass)
 *
 * Implements the 4 stadium-shaped pills with rounded ends, brightened texture
 * show-through, inner-edge glow, and portable blur without ctx.filter (Safari compatible).
 */

import {
  toExportPx,
  SLABS_DESIGN,
} from "./layout";

export function createBlurredBackground(
  sourceCanvas: HTMLCanvasElement | CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement {
  // 3-step downscale/upscale creates a smooth, portable low-pass blur without ctx.filter
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const octx = offscreen.getContext("2d");
  if (!octx) return offscreen;

  const small1 = document.createElement("canvas");
  small1.width = Math.round(width / 4);
  small1.height = Math.round(height / 4);
  const sctx1 = small1.getContext("2d");
  if (sctx1) {
    sctx1.imageSmoothingEnabled = true;
    sctx1.imageSmoothingQuality = "high";
    sctx1.drawImage(sourceCanvas, 0, 0, small1.width, small1.height);
  }

  const small2 = document.createElement("canvas");
  small2.width = Math.round(width / 8);
  small2.height = Math.round(height / 8);
  const sctx2 = small2.getContext("2d");
  if (sctx2) {
    sctx2.imageSmoothingEnabled = true;
    sctx2.imageSmoothingQuality = "high";
    sctx2.drawImage(small1, 0, 0, small2.width, small2.height);
  }

  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(small2, 0, 0, width, height);

  return offscreen;
}

function createPillPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  orientation: "vertical" | "horizontal"
): void {
  ctx.beginPath();
  if (orientation === "vertical") {
    const r = w / 2;
    ctx.moveTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 0, false);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + r, y + h - r, r, 0, Math.PI, false);
    ctx.closePath();
  } else {
    const r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2, false);
    ctx.closePath();
  }
}

export function drawCornerSlabs(
  ctx: CanvasRenderingContext2D,
  blurredBg: HTMLCanvasElement,
  isRegion: boolean
): void {
  const slabs = [
    SLABS_DESIGN.topLeft,
    SLABS_DESIGN.topRight,
    SLABS_DESIGN.bottomLeft,
    isRegion ? SLABS_DESIGN.bottomRightRegion : SLABS_DESIGN.bottomRightStar,
  ];

  for (const slab of slabs) {
    const x = toExportPx(slab.x);
    const y = toExportPx(slab.y);
    const w = toExportPx(slab.w);
    const h = toExportPx(slab.h);

    ctx.save();
    // 1. Clip to stadium pill geometry
    createPillPath(ctx, x, y, w, h, slab.orientation);
    ctx.clip();

    // 2. Render blurred background
    ctx.drawImage(blurredBg, 0, 0);

    // 3. Brighten texture (+24 of 255 ~ 9.5% white overlay)
    ctx.fillStyle = "rgba(255, 255, 255, 0.095)";
    ctx.fill();

    // 4. Inner-edge glow along the curved outline
    // Subtle gradient simulation over the last ~10.8 export px
    const glowSteps = 4;
    const maxStrokeWidth = toExportPx(9.0);
    for (let i = glowSteps; i >= 1; i--) {
      const stepWidth = (maxStrokeWidth * i) / glowSteps;
      const alpha = 0.08 * (1.0 - (i - 1) / glowSteps);
      ctx.lineWidth = stepWidth;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      createPillPath(ctx, x, y, w, h, slab.orientation);
      ctx.stroke();
    }

    // 5. Outer edge hairline highlight
    ctx.lineWidth = Math.max(1.0, toExportPx(1.0));
    ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
    createPillPath(ctx, x, y, w, h, slab.orientation);
    ctx.stroke();

    ctx.restore();
  }
}
