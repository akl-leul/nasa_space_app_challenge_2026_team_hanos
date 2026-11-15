"use client";

import { useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { ConstellationInfo, StarRecord, SkySelection, SkySelectionCallback } from "@/types/sky";
import {
  degToRad,
  raDecToCartesian,
  cartesianToRaDec,
  computeSiderealTime,
  ADDIS_ABABA_LAT,
  ADDIS_ABABA_LON,
} from "@/lib/astro/coordinates";
import { buildStarSpatialIndex, pickNearestStar, getStarDisplayName, StarSpatialIndex } from "@/lib/astro/starIndex";
import { updateStatusBarDirect } from "./StatusBar";
import { cleanObjectName } from "@/lib/explore/detectCategory";

// Polyfill WebGL precision query if missing or returning null in software/headless contexts
if (typeof window !== "undefined") {
  const patchContext = (proto: WebGLRenderingContext | WebGL2RenderingContext | null) => {
    if (!proto || !proto.getShaderPrecisionFormat) return;
    const orig = proto.getShaderPrecisionFormat;
    proto.getShaderPrecisionFormat = function (
      shaderType: GLenum,
      precisionType: GLenum
    ): WebGLShaderPrecisionFormat {
      try {
        const res = orig.call(this, shaderType, precisionType);
        if (res && typeof res.precision === "number") return res;
      } catch { }
      return { rangeMin: 1, rangeMax: 1, precision: 16 };
    };
  };

  if (typeof WebGLRenderingContext !== "undefined") {
    patchContext(WebGLRenderingContext.prototype);
  }
  if (typeof WebGL2RenderingContext !== "undefined") {
    patchContext(WebGL2RenderingContext.prototype);
  }
}

export interface SkyDomeCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  flyTo: (ra: number, dec: number, targetFov?: number) => void;
}

interface SkyDomeCanvasProps {
  constellations: ConstellationInfo[];
  stars: StarRecord[];
  boundaryPositions: Float32Array | null;
  starPositions: Float32Array | null;
  starColors: Float32Array | null;
  namedStars: Array<{ idx?: number; name: string; mag: number; ra: number; dec: number }>;
  constellationPolygons: Record<string, number[][][]> | null;
  lutBuffer: Uint8Array | null;
  selection: SkySelection | null;
  onSelectSelection: (selection: SkySelection | null) => void;
  onPinPoint: (ra: number, dec: number) => void;
  pinnedPoint: { ra: number; dec: number } | null;
  isHorizon: boolean;
  isGrid: boolean;
  showLabels: boolean;
  initialRa?: number;
  initialDec?: number;
  initialFov?: number;
  onFovChange: (fov: number) => void;
  onViewCenterChange: (ra: number, dec: number) => void;
  onSelect?: SkySelectionCallback;
  children?: React.ReactNode;
  isPaused?: boolean;
}

// Generate circular star dot texture for standard PointsMaterial
function createStarDotTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, "rgba(245, 243, 237, 1)");
  grad.addColorStop(0.35, "rgba(245, 243, 237, 0.85)");
  grad.addColorStop(1, "rgba(245, 243, 237, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 16);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// Reusable scratch vectors to avoid garbage collection in animation frame
const _tempV3 = new THREE.Vector3();
const _scratchVec = new THREE.Vector3();
const _camDirVec = new THREE.Vector3();
const _labelPosVec = new THREE.Vector3();
const _labelCamDir = new THREE.Vector3();
const _unprojectVec = new THREE.Vector3();
const _lookTargetVec = new THREE.Vector3();
const _celestialInvQuat = new THREE.Quaternion();

// 8 cardinal compass azimuths on the horizon (N=0°, E=90°, S=180°, W=270°)
const CARDINAL_POINTS = [
  { label: "N", az: 0 },
  { label: "NE", az: 45 },
  { label: "E", az: 90 },
  { label: "SE", az: 135 },
  { label: "S", az: 180 },
  { label: "SW", az: 225 },
  { label: "W", az: 270 },
  { label: "NW", az: 315 },
];

export const SkyDomeCanvas = forwardRef<SkyDomeCanvasHandle, SkyDomeCanvasProps>(
  function SkyDomeCanvas(
    {
      constellations,
      stars,
      boundaryPositions,
      starPositions,
      starColors,
      namedStars,
      constellationPolygons,
      lutBuffer,
      selection,
      onSelectSelection,
      onPinPoint,
      pinnedPoint,
      isHorizon,
      isGrid,
      showLabels,
      initialRa = 0,
      initialDec = 0,
      initialFov = 60,
      onFovChange,
      onViewCenterChange,
      onSelect,
      children,
      isPaused = false,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const labelContainerRef = useRef<HTMLDivElement | null>(null);
    const starLabelContainerRef = useRef<HTMLDivElement | null>(null);
    const cardinalContainerRef = useRef<HTMLDivElement | null>(null);

    // SVG visualizer overlay refs (cached to avoid getElementById in animation loops)
    const svgRootRef = useRef<SVGSVGElement | null>(null);
    const svgRegionOutlineRef = useRef<SVGPathElement | null>(null);
    const svgRegionConnectorRef = useRef<SVGPathElement | null>(null);
    const svgStarRingRef = useRef<SVGCircleElement | null>(null);
    const svgStarLeaderRef = useRef<SVGPathElement | null>(null);
    const svgHoverStarRingRef = useRef<SVGCircleElement | null>(null);
    const svgTargetReticleRef = useRef<SVGGElement | null>(null);
    const capsuleElRef = useRef<HTMLElement | null>(null);

    // References to keep Three.js scene objects
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const celestialGroupRef = useRef<THREE.Group | null>(null);
    const gridGroupRef = useRef<THREE.Object3D | null>(null);
    const horizonGroupRef = useRef<THREE.Object3D | null>(null);

    // Render on-demand control
    const renderRequestedRef = useRef<boolean>(false);
    const isTabVisibleRef = useRef<boolean>(true);

    // Dynamic resolution scaling
    const currentRenderScaleRef = useRef<number>(1.0);
    const maxDprRef = useRef<number>(2.0);

    // Camera orientation state
    const yawRef = useRef<number>(-initialRa);
    const pitchRef = useRef<number>(initialDec);
    const fovRef = useRef<number>(initialFov);
    const targetFovRef = useRef<number | null>(null);

    // Debounced FOV change to prevent React re-renders during active wheel/pinch gestures
    const debouncedFovTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const onFovChangeRef = useRef(onFovChange);
    useEffect(() => {
      onFovChangeRef.current = onFovChange;
    });

    useEffect(() => {
      return () => {
        if (debouncedFovTimeoutRef.current) {
          clearTimeout(debouncedFovTimeoutRef.current);
        }
      };
    }, []);

    const scheduleDebouncedFovChange = useCallback((nextFov: number) => {
      if (debouncedFovTimeoutRef.current) {
        clearTimeout(debouncedFovTimeoutRef.current);
      }
      debouncedFovTimeoutRef.current = setTimeout(() => {
        onFovChangeRef.current(Number(nextFov.toFixed(1)));
      }, 150);
    }, []);

    // Selection & Hover refs
    const selectionRef = useRef<SkySelection | null>(selection);
    const hoveredStarRef = useRef<StarRecord | null>(null);
    const lastHoverTestTimeRef = useRef<number>(0);

    // Star spatial index for cheap picking
    const spatialIndex = useMemo<StarSpatialIndex>(() => {
      return buildStarSpatialIndex(stars);
    }, [stars]);

    const isGridRef = useRef(isGrid);
    const isHorizonRef = useRef(isHorizon);
    useEffect(() => {
      isGridRef.current = isGrid;
      isHorizonRef.current = isHorizon;
    });
    // Pointer & inertia tracking
    const isDraggingRef = useRef<boolean>(false);
    const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const mouseVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const clickStartPosRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
    const targetCamRef = useRef<{ yaw: number; pitch: number } | null>(null);

    // Check prefers-reduced-motion
    const prefersReducedMotion = useRef<boolean>(false);
    useEffect(() => {
      prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }, []);

    const isPausedRef = useRef<boolean>(isPaused);
    const renderFrameRef = useRef<(() => void) | null>(null);

    // Request Render on-demand
    const requestRender = useCallback(() => {
      if (renderRequestedRef.current || !isTabVisibleRef.current || isPausedRef.current) return;
      renderRequestedRef.current = true;
      requestAnimationFrame(() => {
        renderFrameRef.current?.();
      });
    }, []);

    useEffect(() => {
      isPausedRef.current = isPaused;
      if (!isPaused) {
        requestRender();
      }
    }, [isPaused, requestRender]);

    const onViewCenterChangeRef = useRef(onViewCenterChange);
    useEffect(() => {
      onViewCenterChangeRef.current = onViewCenterChange;
    });

    const lastReportedCenterRef = useRef<{ ra: number; dec: number }>({ ra: -999, dec: -999 });

    // Update camera orientation
    const updateCameraDirection = useCallback(() => {
      if (!cameraRef.current) return;
      const yawRad = degToRad(yawRef.current);
      const pitchRad = degToRad(pitchRef.current);

      _lookTargetVec.set(
        Math.sin(yawRad) * Math.cos(pitchRad),
        Math.sin(pitchRad),
        -Math.cos(yawRad) * Math.cos(pitchRad)
      );
      cameraRef.current.lookAt(_lookTargetVec);

      // Compute view center coordinates and notify with threshold to avoid render loops
      const [viewRa, viewDec] = cartesianToRaDec(_lookTargetVec.x, _lookTargetVec.y, _lookTargetVec.z);
      if (
        Math.abs(lastReportedCenterRef.current.ra - viewRa) > 0.05 ||
        Math.abs(lastReportedCenterRef.current.dec - viewDec) > 0.05
      ) {
        lastReportedCenterRef.current = { ra: viewRa, dec: viewDec };
        onViewCenterChangeRef.current?.(viewRa, viewDec);
      }
    }, []);

    // Update HTML labels directly via DOM (translate3d)
    const updateLabels = useCallback(() => {
      if (!showLabels || !cameraRef.current || !containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;

      cameraRef.current.getWorldDirection(_labelCamDir);

      const currentFov = fovRef.current;
      const maxVisibleLabels = currentFov > 70 ? 25 : currentFov > 45 ? 45 : 88;

      // Update constellation labels
      if (labelContainerRef.current) {
        const labelEls = labelContainerRef.current.children;
        let visibleCount = 0;

        for (let i = 0; i < constellations.length; i++) {
          const con = constellations[i];
          const el = labelEls[i] as HTMLElement | undefined;
          if (!el) continue;

          const [cx, cy, cz] = raDecToCartesian(con.center[0], con.center[1], 100);
          _labelPosVec.set(cx, cy, cz);

          if (isHorizon && celestialGroupRef.current) {
            _labelPosVec.applyQuaternion(celestialGroupRef.current.quaternion);
          }

          const dot = _scratchVec.copy(_labelPosVec).normalize().dot(_labelCamDir);
          const isPriority = selection?.kind === "region" && con.id === selection.abbr;

          if (dot > 0.25 && (isPriority || visibleCount < maxVisibleLabels)) {
            _labelPosVec.project(cameraRef.current);
            if (_labelPosVec.z < 1.0) {
              const screenX = (_labelPosVec.x * 0.5 + 0.5) * w;
              const screenY = (-_labelPosVec.y * 0.5 + 0.5) * h;
              el.style.transform = `translate3d(${Math.round(screenX)}px, ${Math.round(screenY)}px, 0) translate(-50%, -50%)`;
              el.style.display = "block";
              visibleCount++;
              continue;
            }
          }
          el.style.display = "none";
        }
      }

      // Update bright star labels
      if (starLabelContainerRef.current) {
        const starEls = starLabelContainerRef.current.children;
        const showStars = currentFov <= 50;

        for (let i = 0; i < namedStars.length; i++) {
          const star = namedStars[i];
          const el = starEls[i] as HTMLElement | undefined;
          if (!el) continue;

          if (!showStars) {
            el.style.display = "none";
            continue;
          }

          const [scx, scy, scz] = raDecToCartesian(star.ra, star.dec, 100);
          _labelPosVec.set(scx, scy, scz);
          if (isHorizon && celestialGroupRef.current) {
            _labelPosVec.applyQuaternion(celestialGroupRef.current.quaternion);
          }

          const sDot = _scratchVec.copy(_labelPosVec).normalize().dot(_labelCamDir);
          if (sDot > 0.4) {
            _labelPosVec.project(cameraRef.current);
            if (_labelPosVec.z < 1.0) {
              const sx = (_labelPosVec.x * 0.5 + 0.5) * w;
              const sy = (-_labelPosVec.y * 0.5 + 0.5) * h;
              el.style.transform = `translate3d(${Math.round(sx + 6)}px, ${Math.round(sy - 6)}px, 0)`;
              el.style.display = "block";
              continue;
            }
          }
          el.style.display = "none";
        }
      }

      // Update cardinal direction labels (only visible in Horizon mode)
      if (cardinalContainerRef.current) {
        const cardEls = cardinalContainerRef.current.children;
        if (!isHorizon) {
          for (let i = 0; i < cardEls.length; i++) {
            (cardEls[i] as HTMLElement).style.display = "none";
          }
        } else {
          for (let i = 0; i < CARDINAL_POINTS.length; i++) {
            const cp = CARDINAL_POINTS[i];
            const el = cardEls[i] as HTMLElement | undefined;
            if (!el) continue;

            const azRad = degToRad(cp.az);
            // N: az=0 -> x=0, z=99 (behind when looking South)
            // E: az=90 -> x=-99, z=0 (screen left when looking South)
            // S: az=180 -> x=0, z=-99 (front when looking South)
            // W: az=270 -> x=99, z=0 (screen right when looking South)
            const cx = -99.0 * Math.sin(azRad);
            const cy = 0;
            const cz = 99.0 * Math.cos(azRad);
            _labelPosVec.set(cx, cy, cz);

            const dot = _scratchVec.copy(_labelPosVec).normalize().dot(_labelCamDir);
            if (dot > 0.1) {
              _labelPosVec.project(cameraRef.current);
              if (_labelPosVec.z < 1.0) {
                const sx = (_labelPosVec.x * 0.5 + 0.5) * w;
                const sy = (-_labelPosVec.y * 0.5 + 0.5) * h;
                el.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -50%)`;
                el.style.display = "block";
                continue;
              }
            }
            el.style.display = "none";
          }
        }
      }
    }, [showLabels, constellations, namedStars, selection, isHorizon]);

    // Update SVG selection overlay and action capsule position
    const updateSelectionVisuals = useCallback(() => {
      const camera = cameraRef.current;
      const container = containerRef.current;
      if (!camera || !container) return;

      const w = container.clientWidth;
      const h = container.clientHeight;

      const regionOutlineEl = svgRegionOutlineRef.current;
      const regionConnectorEl = svgRegionConnectorRef.current;
      const starRingEl = svgStarRingRef.current;
      const starLeaderEl = svgStarLeaderRef.current;
      const hoverStarRingEl = svgHoverStarRingRef.current;
      const targetReticleEl = svgTargetReticleRef.current;

      const getCapsuleEl = (): HTMLElement | null => {
        if (capsuleElRef.current && capsuleElRef.current.isConnected) {
          return capsuleElRef.current;
        }
        const el = document.getElementById("sky-action-capsule");
        capsuleElRef.current = el;
        return el;
      };
      const capsuleEl = getCapsuleEl();

      camera.getWorldDirection(_camDirVec);
      const curSelection = selectionRef.current;
      const curHorizonQuat = isHorizon && celestialGroupRef.current ? celestialGroupRef.current.quaternion : undefined;

      // 1. STAR & TARGET OBJECT SELECTION VISUALIZER
      if (curSelection && (curSelection.kind === "star" || curSelection.kind === "object")) {
        const capsuleW = 48;
        const capsuleH = 88;
        const margin = 16;

        const [cx, cy, cz] = raDecToCartesian(curSelection.ra, curSelection.dec, 100);
        _tempV3.set(cx, cy, cz);
        if (curHorizonQuat) {
          _tempV3.applyQuaternion(curHorizonQuat);
        }

        const dot = _scratchVec.copy(_tempV3).normalize().dot(_camDirVec);
        let capX = w - capsuleW - margin;
        let capY = Math.round(h / 2 - capsuleH / 2);
        let showLeader = false;

        if (dot > 0.15) {
          _tempV3.project(camera);
          if (_tempV3.z < 1.0) {
            const sx = (_tempV3.x * 0.5 + 0.5) * w;
            const sy = (-_tempV3.y * 0.5 + 0.5) * h;

            // Dotted circle ring: diameter ~52px (radius ~26px), scaled slightly with magnitude (min 18px radius)
            const brightnessFactor =
              curSelection.kind === "star"
                ? Math.max(0.85, Math.min(1.25, 1.2 - 0.05 * curSelection.mag))
                : 1.0;
            const ringRadius = Math.round(25 * brightnessFactor);

            if (sx >= -ringRadius && sx <= w + ringRadius && sy >= -ringRadius && sy <= h + ringRadius) {
              if (starRingEl) {
                starRingEl.setAttribute("cx", sx.toFixed(1));
                starRingEl.setAttribute("cy", sy.toFixed(1));
                starRingEl.setAttribute("r", ringRadius.toString());
                starRingEl.style.display = "block";
              }

              if (targetReticleEl) {
                const chTop = document.getElementById("reticle-ch-top");
                const chBottom = document.getElementById("reticle-ch-bottom");
                const chLeft = document.getElementById("reticle-ch-left");
                const chRight = document.getElementById("reticle-ch-right");
                const chCenter = document.getElementById("reticle-center");
                const badgeBg = document.getElementById("reticle-badge-bg");
                const badgeText = document.getElementById("reticle-badge-text");

                chTop?.setAttribute("x1", sx.toFixed(1));
                chTop?.setAttribute("y1", (sy - ringRadius - 6).toFixed(1));
                chTop?.setAttribute("x2", sx.toFixed(1));
                chTop?.setAttribute("y2", (sy - ringRadius).toFixed(1));

                chBottom?.setAttribute("x1", sx.toFixed(1));
                chBottom?.setAttribute("y1", (sy + ringRadius).toFixed(1));
                chBottom?.setAttribute("x2", sx.toFixed(1));
                chBottom?.setAttribute("y2", (sy + ringRadius + 6).toFixed(1));

                chLeft?.setAttribute("x1", (sx - ringRadius - 6).toFixed(1));
                chLeft?.setAttribute("y1", sy.toFixed(1));
                chLeft?.setAttribute("x2", (sx - ringRadius).toFixed(1));
                chLeft?.setAttribute("y2", sy.toFixed(1));

                chRight?.setAttribute("x1", (sx + ringRadius).toFixed(1));
                chRight?.setAttribute("y1", sy.toFixed(1));
                chRight?.setAttribute("x2", (sx + ringRadius + 6).toFixed(1));
                chRight?.setAttribute("y2", sy.toFixed(1));

                chCenter?.setAttribute("cx", sx.toFixed(1));
                chCenter?.setAttribute("cy", sy.toFixed(1));

                const cat = (curSelection.category || (curSelection.kind === "star" ? "star" : "target")).toUpperCase();
                const nameStr = cleanObjectName(curSelection.name).toUpperCase();
                const label = nameStr ? `${nameStr} · ${cat}` : cat;

                if (badgeText) {
                  badgeText.textContent = label;
                  badgeText.setAttribute("x", sx.toFixed(1));
                  badgeText.setAttribute("y", (sy - ringRadius - 12).toFixed(1));
                }
                if (badgeBg && badgeText) {
                  const textW = Math.max(50, label.length * 5.6 + 14);
                  badgeBg.setAttribute("x", (sx - textW / 2).toFixed(1));
                  badgeBg.setAttribute("y", (sy - ringRadius - 20).toFixed(1));
                  badgeBg.setAttribute("width", textW.toFixed(1));
                  badgeBg.setAttribute("height", "15");
                }
                targetReticleEl.style.display = "block";
              }

              // Dashed elbow leader line: horizontal run -> diagonal rise -> horizontal into capsule
              const fitsRight = sx + ringRadius + 14 + 16 + 20 + capsuleW < w - margin;
              let p0x: number, p1x: number, p2x: number, p3x: number;

              const p0y = sy;
              const p1y = sy;
              const p2y = sy - 18;
              const p3y = p2y;

              if (fitsRight) {
                p0x = sx + ringRadius;
                p1x = p0x + 14;
                p2x = p1x + 16;
                p3x = p2x + 20;

                capX = Math.round(p3x);
                capY = Math.max(margin, Math.min(h - capsuleH - margin, Math.round(p3y - capsuleH / 2)));
              } else {
                // Flip to left side near right edge
                p0x = sx - ringRadius;
                p1x = p0x - 14;
                p2x = p1x - 16;
                p3x = p2x - 20;

                capX = Math.round(p3x - capsuleW);
                capY = Math.max(margin, Math.min(h - capsuleH - margin, Math.round(p3y - capsuleH / 2)));
              }

              if (starLeaderEl) {
                const leaderD = `M ${p0x.toFixed(1)} ${p0y.toFixed(1)} L ${p1x.toFixed(1)} ${p1y.toFixed(1)} L ${p2x.toFixed(1)} ${p2y.toFixed(1)} L ${p3x.toFixed(1)} ${p3y.toFixed(1)}`;
                starLeaderEl.setAttribute("d", leaderD);
                starLeaderEl.style.display = "block";
                showLeader = true;
              }
            } else {
              if (starRingEl) starRingEl.style.display = "none";
              if (targetReticleEl) targetReticleEl.style.display = "none";
              capX = Math.max(margin, Math.min(w - capsuleW - margin, Math.round(sx)));
              capY = Math.max(margin, Math.min(h - capsuleH - margin, Math.round(sy)));
            }
          } else {
            if (starRingEl) starRingEl.style.display = "none";
            if (targetReticleEl) targetReticleEl.style.display = "none";
          }
        } else {
          // Behind camera
          if (starRingEl) starRingEl.style.display = "none";
          if (targetReticleEl) targetReticleEl.style.display = "none";
          capX = w - capsuleW - margin;
          capY = Math.round(h / 2 - capsuleH / 2);
        }

        if (!showLeader && starLeaderEl) {
          starLeaderEl.style.display = "none";
        }

        if (capsuleEl) {
          capsuleEl.style.transform = `translate3d(${capX}px, ${capY}px, 0)`;
          capsuleEl.style.display = "flex";
        }

        if (regionOutlineEl) regionOutlineEl.style.display = "none";
        if (regionConnectorEl) regionConnectorEl.style.display = "none";
      }
      // 2. REGION SELECTION VISUALIZER (selection-region.png)
      else if (curSelection && curSelection.kind === "region" && constellationPolygons) {
        if (targetReticleEl) targetReticleEl.style.display = "none";
        const capsuleW = 48;
        const capsuleH = 128;
        const margin = 16;

        const rings = constellationPolygons[curSelection.abbr];
        let fullPathD = "";
        let maxScreenX = -9999;
        let minScreenX = 9999;
        let edgeVertexRight: { x: number; y: number } | null = null;
        let edgeVertexLeft: { x: number; y: number } | null = null;
        let visibleVertexCount = 0;
        let sumY = 0;

        if (rings && rings.length > 0) {
          for (let r = 0; r < rings.length; r++) {
            const ring = rings[r];
            let wasVisible = false;
            let ringDrawn = false;
            let lastSx = 0;
            let lastSy = 0;

            for (let i = 0; i < ring.length; i++) {
              const pt = ring[i];
              const [cx, cy, cz] = raDecToCartesian(pt[0], pt[1], 100);
              _tempV3.set(cx, cy, cz);
              if (curHorizonQuat) {
                _tempV3.applyQuaternion(curHorizonQuat);
              }

              const dot = _scratchVec.copy(_tempV3).normalize().dot(_camDirVec);
              if (dot > 0.12) {
                _tempV3.project(camera);
                if (_tempV3.z < 1.0) {
                  const sx = (_tempV3.x * 0.5 + 0.5) * w;
                  const sy = (-_tempV3.y * 0.5 + 0.5) * h;

                  visibleVertexCount++;
                  sumY += sy;

                  if (sx > maxScreenX) {
                    maxScreenX = sx;
                    edgeVertexRight = { x: sx, y: sy };
                  }
                  if (sx < minScreenX) {
                    minScreenX = sx;
                    edgeVertexLeft = { x: sx, y: sy };
                  }

                  if (wasVisible) {
                    if (Math.hypot(sx - lastSx, sy - lastSy) < w * 0.65) {
                      fullPathD += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
                    } else {
                      fullPathD += ` M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
                    }
                  } else {
                    fullPathD += ` M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
                  }

                  wasVisible = true;
                  ringDrawn = true;
                  lastSx = sx;
                  lastSy = sy;
                  continue;
                }
              }
              wasVisible = false;
            }

            if (ringDrawn) {
              fullPathD += " Z ";
            }
          }
        }

        if (regionOutlineEl && fullPathD) {
          regionOutlineEl.setAttribute("d", fullPathD);
          regionOutlineEl.style.display = "block";
        } else if (regionOutlineEl) {
          regionOutlineEl.style.display = "none";
        }

        let capX = w - capsuleW - margin;
        let capY = Math.round(h / 2 - capsuleH / 2);
        let showConnector = false;

        if (visibleVertexCount > 0 && edgeVertexRight) {
          const avgY = sumY / visibleVertexCount;
          const fitsRight = maxScreenX + 28 + capsuleW < w - margin;

          let connStartX: number, connStartY: number;
          let connEndX: number, connEndY: number;

          if (fitsRight) {
            connStartX = edgeVertexRight.x;
            connStartY = Math.max(margin, Math.min(h - margin, avgY));
            connEndX = connStartX + 28;
            connEndY = connStartY;

            capX = Math.round(connEndX);
            capY = Math.max(margin, Math.min(h - capsuleH - margin, Math.round(connEndY - capsuleH / 2)));
          } else if (edgeVertexLeft) {
            connStartX = edgeVertexLeft.x;
            connStartY = Math.max(margin, Math.min(h - margin, avgY));
            connEndX = connStartX - 28;
            connEndY = connStartY;

            capX = Math.round(connEndX - capsuleW);
            capY = Math.max(margin, Math.min(h - capsuleH - margin, Math.round(connEndY - capsuleH / 2)));
          } else {
            connStartX = 0; connStartY = 0; connEndX = 0; connEndY = 0;
            capX = Math.max(margin, Math.min(w - capsuleW - margin, Math.round(maxScreenX + 28)));
            capY = Math.max(margin, Math.min(h - capsuleH - margin, Math.round(avgY - capsuleH / 2)));
          }

          if (connStartX !== connEndX && regionConnectorEl) {
            regionConnectorEl.setAttribute(
              "d",
              `M ${connStartX.toFixed(1)} ${connStartY.toFixed(1)} L ${connEndX.toFixed(1)} ${connEndY.toFixed(1)}`
            );
            regionConnectorEl.style.display = "block";
            showConnector = true;
          }
        } else {
          // No vertices visible on screen (e.g. region is zoomed in or behind camera)
          const [cx, cy, cz] = raDecToCartesian(curSelection.ra, curSelection.dec, 100);
          _tempV3.set(cx, cy, cz);
          if (curHorizonQuat) {
            _tempV3.applyQuaternion(curHorizonQuat);
          }
          const dot = _scratchVec.copy(_tempV3).normalize().dot(_camDirVec);
          if (dot > 0.1) {
            _tempV3.project(camera);
            const sx = (_tempV3.x * 0.5 + 0.5) * w;
            const sy = (-_tempV3.y * 0.5 + 0.5) * h;
            capX = Math.max(margin, Math.min(w - capsuleW - margin, Math.round(sx)));
            capY = Math.max(margin, Math.min(h - capsuleH - margin, Math.round(sy)));
          } else {
            capX = w - capsuleW - margin;
            capY = Math.round(h / 2 - capsuleH / 2);
          }
        }

        if (!showConnector && regionConnectorEl) {
          regionConnectorEl.style.display = "none";
        }

        if (capsuleEl) {
          capsuleEl.style.transform = `translate3d(${capX}px, ${capY}px, 0)`;
          capsuleEl.style.display = "flex";
        }

        if (starRingEl) starRingEl.style.display = "none";
        if (starLeaderEl) starLeaderEl.style.display = "none";
        if (targetReticleEl) targetReticleEl.style.display = "none";
      }
      else {
        // No selection active -> hide all selection visualizer elements
        if (regionOutlineEl) regionOutlineEl.style.display = "none";
        if (regionConnectorEl) regionConnectorEl.style.display = "none";
        if (starRingEl) starRingEl.style.display = "none";
        if (starLeaderEl) starLeaderEl.style.display = "none";
        if (targetReticleEl) targetReticleEl.style.display = "none";
        if (capsuleEl) capsuleEl.style.display = "none";
      }

      // 3. HOVER CUE (faint ring if hovering a star when nothing is selected)
      const curHoveredStar = hoveredStarRef.current;
      if (!curSelection && curHoveredStar) {
        const [cx, cy, cz] = raDecToCartesian(curHoveredStar.ra, curHoveredStar.dec, 100);
        _tempV3.set(cx, cy, cz);
        if (curHorizonQuat) {
          _tempV3.applyQuaternion(curHorizonQuat);
        }
        const dot = _scratchVec.copy(_tempV3).normalize().dot(_camDirVec);
        if (dot > 0.15) {
          _tempV3.project(camera);
          if (_tempV3.z < 1.0) {
            const sx = (_tempV3.x * 0.5 + 0.5) * w;
            const sy = (-_tempV3.y * 0.5 + 0.5) * h;
            if (hoverStarRingEl) {
              hoverStarRingEl.setAttribute("cx", sx.toFixed(1));
              hoverStarRingEl.setAttribute("cy", sy.toFixed(1));
              hoverStarRingEl.setAttribute("r", "16");
              hoverStarRingEl.style.display = "block";
            }
          }
        }
      } else {
        if (hoverStarRingEl) hoverStarRingEl.style.display = "none";
      }
    }, [isHorizon, constellationPolygons]);

    // Main Render Frame
    const renderFrame = useCallback(() => {
      renderRequestedRef.current = false;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) return;

      // Measure frame time for dynamic resolution scaling
      const startTime = performance.now();
      renderer.render(scene, camera);
      const frameDuration = performance.now() - startTime;

      // Adaptive quality adjustment while moving
      if (isDraggingRef.current) {
        if (frameDuration > 20 && currentRenderScaleRef.current > 0.65) {
          currentRenderScaleRef.current = Math.max(0.65, currentRenderScaleRef.current - 0.15);
          renderer.setPixelRatio(maxDprRef.current * currentRenderScaleRef.current);
        } else if (frameDuration < 12 && currentRenderScaleRef.current < 1.0) {
          currentRenderScaleRef.current = Math.min(1.0, currentRenderScaleRef.current + 0.1);
          renderer.setPixelRatio(maxDprRef.current * currentRenderScaleRef.current);
        }
      } else if (currentRenderScaleRef.current < 1.0) {
        currentRenderScaleRef.current = 1.0;
        renderer.setPixelRatio(maxDprRef.current);
        renderer.render(scene, camera);
      }

      // Check if motion continues (smooth fly-to, FOV zoom ease, or inertia)
      let needsMoreFrames = false;

      // Smooth FOV easing toward target (approx 120ms ease-out)
      if (targetFovRef.current !== null) {
        const dFov = targetFovRef.current - fovRef.current;
        if (Math.abs(dFov) < 0.08) {
          fovRef.current = targetFovRef.current;
          targetFovRef.current = null;
        } else {
          fovRef.current += dFov * 0.28;
          needsMoreFrames = true;
        }
        camera.fov = fovRef.current;
        camera.updateProjectionMatrix();

        const fovEl = document.getElementById("status-fov");
        if (fovEl) {
          fovEl.textContent = `FOV ${fovRef.current.toFixed(1)}°`;
        }
      }

      updateLabels();
      updateSelectionVisuals();

      if (targetCamRef.current) {
        const dy = targetCamRef.current.yaw - yawRef.current;
        const dp = targetCamRef.current.pitch - pitchRef.current;

        yawRef.current += dy * 0.14;
        pitchRef.current += dp * 0.14;

        if (Math.abs(dy) < 0.04 && Math.abs(dp) < 0.04) {
          yawRef.current = targetCamRef.current.yaw;
          pitchRef.current = targetCamRef.current.pitch;
          targetCamRef.current = null;
        }
        updateCameraDirection();
        needsMoreFrames = true;
      } else if (!isDraggingRef.current && !prefersReducedMotion.current) {
        if (Math.abs(mouseVelocityRef.current.x) > 0.001 || Math.abs(mouseVelocityRef.current.y) > 0.001) {
          yawRef.current += mouseVelocityRef.current.x;
          pitchRef.current = Math.max(-89.5, Math.min(89.5, pitchRef.current + mouseVelocityRef.current.y));
          mouseVelocityRef.current.x *= 0.91;
          mouseVelocityRef.current.y *= 0.91;
          updateCameraDirection();
          needsMoreFrames = true;
        }
      }

      if (needsMoreFrames) {
        requestRender();
      }
    }, [updateCameraDirection, updateLabels, updateSelectionVisuals, requestRender]);

    useEffect(() => {
      renderFrameRef.current = renderFrame;
    });

    // Smooth rotate-to-center flyTo
    const flyTo = useCallback(
      (ra: number, dec: number, targetFov?: number) => {
        const targetYaw = -ra;
        const targetPitch = Math.max(-89.0, Math.min(89.0, dec));

        if (targetFov !== undefined) {
          const clampedFov = Math.max(5.0, Math.min(100.0, targetFov));
          if (prefersReducedMotion.current) {
            fovRef.current = clampedFov;
            targetFovRef.current = null;
            if (cameraRef.current) {
              cameraRef.current.fov = clampedFov;
              cameraRef.current.updateProjectionMatrix();
            }
          } else {
            targetFovRef.current = clampedFov;
          }
          scheduleDebouncedFovChange(clampedFov);
        }

        if (prefersReducedMotion.current) {
          yawRef.current = targetYaw;
          pitchRef.current = targetPitch;
          updateCameraDirection();
          requestRender();
        } else {
          const diff = (((targetYaw - yawRef.current) % 360) + 540) % 360 - 180;

          targetCamRef.current = {
            yaw: yawRef.current + diff,
            pitch: targetPitch,
          };
          requestRender();
        }
      },
      [updateCameraDirection, requestRender, scheduleDebouncedFovChange]
    );

    // Zoom helpers
    const zoomBy = useCallback(
      (factor: number) => {
        const currentTarget = targetFovRef.current ?? fovRef.current;
        const nextFov = Math.max(5.0, Math.min(100.0, currentTarget * factor));

        if (prefersReducedMotion.current) {
          fovRef.current = nextFov;
          targetFovRef.current = null;
          if (cameraRef.current) {
            cameraRef.current.fov = nextFov;
            cameraRef.current.updateProjectionMatrix();
          }
          const fovEl = document.getElementById("status-fov");
          if (fovEl) fovEl.textContent = `FOV ${nextFov.toFixed(1)}°`;
          requestRender();
        } else {
          targetFovRef.current = nextFov;
          requestRender();
        }

        scheduleDebouncedFovChange(nextFov);
      },
      [requestRender, scheduleDebouncedFovChange]
    );

    const zoomIn = useCallback(() => zoomBy(0.8), [zoomBy]);
    const zoomOut = useCallback(() => zoomBy(1.25), [zoomBy]);

    const resetView = useCallback(() => {
      yawRef.current = 0.0;
      pitchRef.current = 0.0;
      targetCamRef.current = null;
      targetFovRef.current = null;
      fovRef.current = 60.0;
      if (cameraRef.current) {
        cameraRef.current.fov = 60.0;
        cameraRef.current.updateProjectionMatrix();
      }
      const fovEl = document.getElementById("status-fov");
      if (fovEl) fovEl.textContent = `FOV 60.0°`;
      updateCameraDirection();
      requestRender();
      scheduleDebouncedFovChange(60.0);
    }, [updateCameraDirection, requestRender, scheduleDebouncedFovChange]);

    useImperativeHandle(
      ref,
      () => ({
        zoomIn,
        zoomOut,
        resetView,
        flyTo,
      }),
      [zoomIn, zoomOut, resetView, flyTo]
    );

    // Sync selection change with view
    useEffect(() => {
      selectionRef.current = selection;
      if (selection) {
        flyTo(selection.ra, selection.dec);
      }
      requestRender();
    }, [selection, flyTo, requestRender]);

    // Initialize Three.js WebGL Scene
    useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const isMobile = window.innerWidth < 768;
      maxDprRef.current = isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2.0);

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: false,
          alpha: false,
          powerPreference: isMobile ? "default" : "high-performance",
          failIfMajorPerformanceCaveat: false,
        });
        renderer.setPixelRatio(maxDprRef.current);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x111111, 1.0);
        rendererRef.current = renderer;
      } catch (e) {
        console.error("WebGL initialization failed:", e);
        return;
      }

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        fovRef.current,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      );
      camera.position.set(0, 0, 0);
      cameraRef.current = camera;

      const celestialGroup = new THREE.Group();
      scene.add(celestialGroup);
      celestialGroupRef.current = celestialGroup;

      // 1. STARS LAYER (THREE.Points with built-in PointsMaterial)
      if (starPositions && starColors) {
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
        starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

        const starTex = createStarDotTexture();
        const starMat = new THREE.PointsMaterial({
          size: 2.5,
          vertexColors: true,
          map: starTex || undefined,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          sizeAttenuation: false,
        });

        const starPoints = new THREE.Points(starGeo, starMat);
        celestialGroup.add(starPoints);
      }

      // 2. CONSTELLATION BOUNDARIES LAYER (1 Draw Call - Red --color-region)
      if (boundaryPositions) {
        const bGeo = new THREE.BufferGeometry();
        bGeo.setAttribute("position", new THREE.BufferAttribute(boundaryPositions, 3));

        const bMat = new THREE.LineBasicMaterial({
          color: 0x1F48FF, // Token --color-region
          transparent: true,
          opacity: 0.5,
        });
        const lines = new THREE.LineSegments(bGeo, bMat);
        celestialGroup.add(lines);
      }

      // 3. MERGED RA/DEC CELESTIAL GRID (1 Draw Call)
      const gridPoints: number[] = [];
      for (let r = 0; r < 360; r += 15) {
        for (let d = -80; d < 80; d += 4) {
          const p1 = raDecToCartesian(r, d, 99.2);
          const p2 = raDecToCartesian(r, d + 4, 99.2);
          gridPoints.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
        }
      }
      for (let d = -75; d <= 75; d += 15) {
        for (let r = 0; r < 360; r += 4) {
          const p1 = raDecToCartesian(r, d, 99.2);
          const p2 = raDecToCartesian(r + 4, d, 99.2);
          gridPoints.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
        }
      }

      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPoints, 3));
      const gridMat = new THREE.LineBasicMaterial({
        color: 0xf5f3ed,
        transparent: true,
        opacity: 0.12,
      });
      const gridLines = new THREE.LineSegments(gridGeo, gridMat);
      gridLines.visible = isGridRef.current;
      celestialGroup.add(gridLines);
      gridGroupRef.current = gridLines;

      // 4. HORIZON / GROUND LAYER
      const horizonGroup = new THREE.Group();
      const horizonPts: number[] = [];
      for (let a = 0; a < 360; a += 2) {
        const rad1 = degToRad(a);
        const rad2 = degToRad(a + 2);
        horizonPts.push(
          99.0 * Math.sin(rad1), 0, 99.0 * Math.cos(rad1),
          99.0 * Math.sin(rad2), 0, 99.0 * Math.cos(rad2)
        );
      }
      const hGeo = new THREE.BufferGeometry();
      hGeo.setAttribute("position", new THREE.Float32BufferAttribute(horizonPts, 3));
      const hMat = new THREE.LineBasicMaterial({
        color: 0x1F48FF,
        transparent: true,
        opacity: 0.85,
      });
      const hLines = new THREE.LineSegments(hGeo, hMat);
      horizonGroup.add(hLines);
      horizonGroup.visible = isHorizonRef.current;
      scene.add(horizonGroup);
      horizonGroupRef.current = horizonGroup;

      updateCameraDirection();
      requestRender();

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        console.warn("WebGL context lost");
      };
      const handleContextRestored = () => {
        console.info("WebGL context restored");
        requestRender();
      };

      canvas.addEventListener("webglcontextlost", handleContextLost);
      canvas.addEventListener("webglcontextrestored", handleContextRestored);

      const handleVisibilityChange = () => {
        isTabVisibleRef.current = document.visibilityState === "visible";
        if (isTabVisibleRef.current) {
          requestRender();
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      const handleResize = () => {
        if (!container || !rendererRef.current || !cameraRef.current) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
        requestRender();
      };

      window.addEventListener("resize", handleResize);

      return () => {
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("resize", handleResize);
        rendererRef.current?.dispose();
      };
    }, [
      boundaryPositions,
      starPositions,
      starColors,
      updateCameraDirection,
      requestRender,
    ]);

    // Handle Horizon alignment
    useEffect(() => {
      if (horizonGroupRef.current && celestialGroupRef.current) {
        horizonGroupRef.current.visible = isHorizon;
        if (isHorizon) {
          const now = new Date();
          const { lstDeg } = computeSiderealTime(now, ADDIS_ABABA_LON);
          celestialGroupRef.current.rotation.set(0, 0, 0);
          celestialGroupRef.current.rotation.y = -degToRad(lstDeg);
          celestialGroupRef.current.rotation.x = degToRad(90.0 - ADDIS_ABABA_LAT);
        } else {
          celestialGroupRef.current.rotation.set(0, 0, 0);
        }
        requestRender();
      }
    }, [isHorizon, requestRender]);

    // Handle Grid visibility
    useEffect(() => {
      if (gridGroupRef.current) {
        gridGroupRef.current.visible = isGrid;
        requestRender();
      }
    }, [isGrid, requestRender]);

    // Handle Labels visibility
    useEffect(() => {
      if (labelContainerRef.current) {
        labelContainerRef.current.style.display = showLabels ? "block" : "none";
      }
      if (starLabelContainerRef.current) {
        starLabelContainerRef.current.style.display = showLabels ? "block" : "none";
      }
      requestRender();
    }, [showLabels, requestRender]);

    // Coordinate lookup under pointer via LUT
    const lookupAtPointer = useCallback(
      (clientX: number, clientY: number): { ra: number; dec: number; con: ConstellationInfo | null } | null => {
        const container = containerRef.current;
        const camera = cameraRef.current;
        if (!container || !camera) return null;

        const rect = container.getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);

        const dir = _unprojectVec.set(ndcX, ndcY, 0.5).unproject(camera).normalize();

        if (isHorizon && celestialGroupRef.current) {
          _celestialInvQuat.copy(celestialGroupRef.current.quaternion).invert();
          dir.applyQuaternion(_celestialInvQuat);
        }

        const [ra, dec] = cartesianToRaDec(dir.x, dir.y, dir.z);

        let foundCon: ConstellationInfo | null = null;
        if (lutBuffer) {
          const normRa = ((ra % 360.0) + 360.0) % 360.0;
          const clampedDec = Math.max(-90.0, Math.min(90.0, dec));
          const i = Math.floor(normRa / 0.5) % 720;
          const j = Math.max(0, Math.min(359, Math.floor((clampedDec + 90.0) / 0.5)));
          const conIdx = lutBuffer[j * 720 + i];
          if (conIdx < constellations.length) {
            foundCon = constellations[conIdx];
          }
        }

        return { ra, dec, con: foundCon };
      },
      [isHorizon, lutBuffer, constellations]
    );

    // Pointer & Pinch state
    const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
    const lastPinchDistanceRef = useRef<number>(0);
    const isPinchingRef = useRef<boolean>(false);
    const hadPinchRef = useRef<boolean>(false);

    // Pointer Event Handlers
    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size === 2) {
        const pts = Array.from(activePointersRef.current.values());
        lastPinchDistanceRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        isPinchingRef.current = true;
        hadPinchRef.current = true;
        isDraggingRef.current = false;
        return;
      }

      if (activePointersRef.current.size === 1) {
        isDraggingRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        clickStartPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
        mouseVelocityRef.current = { x: 0, y: 0 };
        targetCamRef.current = null;
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Handle 2-finger touch pinch zoom
      if (isPinchingRef.current && activePointersRef.current.size >= 2) {
        const pts = Array.from(activePointersRef.current.values());
        const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const oldDist = lastPinchDistanceRef.current;

        if (oldDist > 0 && newDist > 0) {
          const ratio = oldDist / newDist;
          lastPinchDistanceRef.current = newDist;

          const nextFov = Math.max(5.0, Math.min(100.0, fovRef.current * ratio));
          fovRef.current = nextFov;
          targetFovRef.current = null;
          if (cameraRef.current) {
            cameraRef.current.fov = nextFov;
            cameraRef.current.updateProjectionMatrix();
          }
          const fovEl = document.getElementById("status-fov");
          if (fovEl) fovEl.textContent = `FOV ${nextFov.toFixed(1)}°`;

          requestRender();
          scheduleDebouncedFovChange(nextFov);
        }
        return;
      }

      const lookup = lookupAtPointer(e.clientX, e.clientY);
      if (lookup) {
        updateStatusBarDirect(lookup.ra, lookup.dec, fovRef.current, lookup.con ? lookup.con.name : null);
      }

      if (!isDraggingRef.current) {
        // Throttled star hover check (every 50ms)
        const now = performance.now();
        if (now - lastHoverTestTimeRef.current > 50 && cameraRef.current && containerRef.current && lookup) {
          lastHoverTestTimeRef.current = now;
          const hoveredStar = pickNearestStar(
            spatialIndex,
            stars,
            lookup.ra,
            lookup.dec,
            e.clientX,
            e.clientY,
            cameraRef.current,
            containerRef.current.clientWidth,
            containerRef.current.clientHeight,
            10,
            isHorizon,
            celestialGroupRef.current ? celestialGroupRef.current.rotation : undefined
          );
          if (hoveredStar !== hoveredStarRef.current) {
            hoveredStarRef.current = hoveredStar;
            requestRender();
          }
        }
        return;
      }

      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      const sensitivity = (fovRef.current / 60.0) * 0.15;
      const dYaw = -dx * sensitivity;
      const dPitch = dy * sensitivity;

      yawRef.current += dYaw;
      pitchRef.current = Math.max(-89.5, Math.min(89.5, pitchRef.current + dPitch));

      mouseVelocityRef.current = { x: dYaw * 0.5, y: dPitch * 0.5 };
      updateCameraDirection();
      requestRender();
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.delete(e.pointerId);

      if (activePointersRef.current.size < 2) {
        isPinchingRef.current = false;
        lastPinchDistanceRef.current = 0;
      }

      if (activePointersRef.current.size === 0) {
        isDraggingRef.current = false;
        const wasPinch = hadPinchRef.current;
        hadPinchRef.current = false;

        // Ignore click/tap selection on pointerup after a pinch gesture
        if (wasPinch) {
          requestRender();
          return;
        }

        const moveDist = Math.hypot(
          e.clientX - clickStartPosRef.current.x,
          e.clientY - clickStartPosRef.current.y
        );
        const duration = Date.now() - clickStartPosRef.current.time;

        // Click / tap detection (under 6px travel)
        if (moveDist < 6 && cameraRef.current && containerRef.current) {
          const lookup = lookupAtPointer(e.clientX, e.clientY);
          if (lookup) {
            if (e.shiftKey || duration > 350) {
              onPinPoint(lookup.ra, lookup.dec);
            } else {
              // 1. STAR PICKING TEST (star always wins over region)
              const isTouch = e.pointerType === "touch";
              const pickRadius = isTouch ? 16 : 12;

              const pickedStar = pickNearestStar(
                spatialIndex,
                stars,
                lookup.ra,
                lookup.dec,
                e.clientX,
                e.clientY,
                cameraRef.current,
                containerRef.current.clientWidth,
                containerRef.current.clientHeight,
                pickRadius,
                isHorizon,
                celestialGroupRef.current ? celestialGroupRef.current.rotation : undefined
              );

              if (pickedStar) {
                const currentSel = selectionRef.current;
                // Clicking the same star clears selection
                if (currentSel?.kind === "star" && currentSel.id === pickedStar.hip) {
                  onSelectSelection(null);
                } else {
                  const conMatch = constellations.find((c) => c.id === pickedStar.con) || lookup.con || null;
                  const newSel: SkySelection = {
                    kind: "star",
                    id: pickedStar.hip,
                    name: getStarDisplayName(pickedStar),
                    ra: pickedStar.ra,
                    dec: pickedStar.dec,
                    mag: pickedStar.mag,
                    bv: pickedStar.bv,
                    constellation: conMatch,
                  };
                  onSelectSelection(newSel);
                  onPinPoint(pickedStar.ra, pickedStar.dec);
                  flyTo(pickedStar.ra, pickedStar.dec);

                  if (onSelect) {
                    onSelect({
                      ra: pickedStar.ra,
                      dec: pickedStar.dec,
                      fov: fovRef.current,
                      selection: newSel,
                      constellation: conMatch,
                    });
                  }
                }
              }
              // 2. REGION PICKING TEST (if no star hit)
              else if (lookup.con) {
                const currentSel = selectionRef.current;
                // Clicking empty sky inside the same region clears selection
                if (currentSel?.kind === "region" && currentSel.abbr === lookup.con.id) {
                  onSelectSelection(null);
                } else {
                  const newSel: SkySelection = {
                    kind: "region",
                    abbr: lookup.con.id,
                    name: lookup.con.name,
                    ra: lookup.con.center[0],
                    dec: lookup.con.center[1],
                    areaSqDeg: lookup.con.area,
                    constellation: lookup.con,
                  };
                  onSelectSelection(newSel);
                  onPinPoint(lookup.con.center[0], lookup.con.center[1]);
                  flyTo(lookup.con.center[0], lookup.con.center[1]);

                  if (onSelect) {
                    onSelect({
                      ra: lookup.con.center[0],
                      dec: lookup.con.center[1],
                      fov: fovRef.current,
                      selection: newSel,
                      constellation: lookup.con,
                    });
                  }
                }
              } else {
                // Clicked empty sky outside any constellation -> clear selection
                onSelectSelection(null);
              }
            }
          }
        }
      }
      requestRender();
    };

    const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) {
        isPinchingRef.current = false;
      }
      if (activePointersRef.current.size === 0) {
        isDraggingRef.current = false;
        hadPinchRef.current = false;
      }
    };

    // Native non-passive Wheel listener (allows e.preventDefault() & deltaMode normalization)
    const wheelDeltaRef = useRef<number>(0);
    const wheelRafRef = useRef<number | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleNativeWheel = (e: WheelEvent) => {
        e.preventDefault();

        let normalizedDelta = e.deltaY;
        if (e.deltaMode === 1) {
          normalizedDelta *= 16;
        } else if (e.deltaMode === 2) {
          normalizedDelta *= (container.clientHeight || 600);
        }

        // Larger sensitivity for trackpad pinch gestures (ctrlKey)
        const k = e.ctrlKey ? 0.005 : 0.001;
        wheelDeltaRef.current += normalizedDelta * k;

        if (!wheelRafRef.current) {
          wheelRafRef.current = requestAnimationFrame(() => {
            wheelRafRef.current = null;
            if (wheelDeltaRef.current === 0) return;

            const factor = Math.exp(wheelDeltaRef.current);
            wheelDeltaRef.current = 0;

            const currentTarget = targetFovRef.current ?? fovRef.current;
            const nextFov = Math.max(5.0, Math.min(100.0, currentTarget * factor));

            if (prefersReducedMotion.current) {
              fovRef.current = nextFov;
              targetFovRef.current = null;
              if (cameraRef.current) {
                cameraRef.current.fov = nextFov;
                cameraRef.current.updateProjectionMatrix();
              }
              const fovEl = document.getElementById("status-fov");
              if (fovEl) fovEl.textContent = `FOV ${nextFov.toFixed(1)}°`;
              requestRender();
            } else {
              targetFovRef.current = nextFov;
              requestRender();
            }

            scheduleDebouncedFovChange(nextFov);
          });
        }
      };

      container.addEventListener("wheel", handleNativeWheel, { passive: false });
      return () => {
        container.removeEventListener("wheel", handleNativeWheel);
        if (wheelRafRef.current) {
          cancelAnimationFrame(wheelRafRef.current);
          wheelRafRef.current = null;
        }
      };
    }, [scheduleDebouncedFovChange, requestRender]);

    // Safari gesture listeners (gesturestart, gesturechange, gestureend)
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let lastScale = 1.0;

      const handleGestureStart = (e: Event) => {
        e.preventDefault();
        lastScale = 1.0;
        isPinchingRef.current = true;
        hadPinchRef.current = true;
        isDraggingRef.current = false;
      };

      const handleGestureChange = (e: Event) => {
        e.preventDefault();
        const ge = e as Event & { scale?: number };
        if (ge.scale && ge.scale > 0 && lastScale > 0) {
          const scaleDelta = ge.scale / lastScale;
          lastScale = ge.scale;

          const nextFov = Math.max(5.0, Math.min(100.0, fovRef.current / scaleDelta));
          fovRef.current = nextFov;
          targetFovRef.current = null;
          if (cameraRef.current) {
            cameraRef.current.fov = nextFov;
            cameraRef.current.updateProjectionMatrix();
          }
          const fovEl = document.getElementById("status-fov");
          if (fovEl) fovEl.textContent = `FOV ${nextFov.toFixed(1)}°`;

          requestRender();
          scheduleDebouncedFovChange(nextFov);
        }
      };

      const handleGestureEnd = (e: Event) => {
        e.preventDefault();
        lastScale = 1.0;
        isPinchingRef.current = false;
      };

      container.addEventListener("gesturestart", handleGestureStart, { passive: false });
      container.addEventListener("gesturechange", handleGestureChange, { passive: false });
      container.addEventListener("gestureend", handleGestureEnd, { passive: false });

      return () => {
        container.removeEventListener("gesturestart", handleGestureStart);
        container.removeEventListener("gesturechange", handleGestureChange);
        container.removeEventListener("gestureend", handleGestureEnd);
      };
    }, [requestRender, scheduleDebouncedFovChange]);

    // Keyboard Navigation
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          document.activeElement?.tagName === "INPUT" ||
          document.activeElement?.tagName === "TEXTAREA"
        ) {
          return;
        }

        const step = (fovRef.current / 60.0) * 3.5;
        let handled = true;

        switch (e.key) {
          case "Escape":
            onSelectSelection(null);
            break;
          case "ArrowLeft":
            yawRef.current -= step;
            updateCameraDirection();
            requestRender();
            break;
          case "ArrowRight":
            yawRef.current += step;
            updateCameraDirection();
            requestRender();
            break;
          case "ArrowUp":
            pitchRef.current = Math.min(89.5, pitchRef.current + step);
            updateCameraDirection();
            requestRender();
            break;
          case "ArrowDown":
            pitchRef.current = Math.max(-89.5, pitchRef.current - step);
            updateCameraDirection();
            requestRender();
            break;
          case "+":
          case "=":
          case "NumpadAdd":
            zoomIn();
            break;
          case "-":
          case "_":
          case "NumpadSubtract":
            zoomOut();
            break;
          case "0":
            resetView();
            break;
          default:
            handled = false;
        }

        if (handled) {
          e.preventDefault();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [zoomIn, zoomOut, resetView, updateCameraDirection, onSelectSelection, requestRender]);

    return (
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="relative w-full h-full overflow-hidden cursor-crosshair select-none touch-none bg-ink"
        role="application"
        aria-label="Interactive 3D Sky Dome View"
      >
        {/* 3D WebGL Canvas */}
        <canvas ref={canvasRef} className="w-full h-full block bg-ink" />

        {/* SVG SELECTION VISUALIZER OVERLAY (selection-star.png & selection-region.png) */}
        <svg
          ref={svgRootRef}
          id="sky-selection-svg"
          className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-20"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          {/* Region Outline (thick dashed cream line, 3px, dash 10px, gap 7px, butt caps) */}
          <path
            ref={svgRegionOutlineRef}
            id="svg-region-outline"
            fill="none"
            stroke="#F5F3ED"
            strokeWidth="3"
            strokeDasharray="10 7"
            strokeLinecap="butt"
            strokeLinejoin="round"
            style={{ display: "none" }}
          />
          {/* Region Connector to capsule */}
          <path
            ref={svgRegionConnectorRef}
            id="svg-region-connector"
            fill="none"
            stroke="#F5F3ED"
            strokeWidth="2.5"
            strokeDasharray="10 7"
            strokeLinecap="butt"
            style={{ display: "none" }}
          />
          {/* Star Dotted Circle Ring (1.5px, round dots, cream, ~52px diameter) */}
          <circle
            ref={svgStarRingRef}
            id="svg-star-ring"
            fill="none"
            stroke="#F5F3ED"
            strokeWidth="1.5"
            strokeDasharray="1 5"
            strokeLinecap="round"
            style={{ display: "none" }}
          />
          {/* Star Dashed Elbow Leader Line */}
          <path
            ref={svgStarLeaderRef}
            id="svg-star-leader"
            fill="none"
            stroke="#F5F3ED"
            strokeWidth="2.5"
            strokeDasharray="10 7"
            strokeLinecap="butt"
            style={{ display: "none" }}
          />
          {/* Hover star faint ring cue */}
          <circle
            ref={svgHoverStarRingRef}
            id="svg-hover-star-ring"
            fill="none"
            stroke="#F5F3ED"
            strokeWidth="1"
            strokeDasharray="2 3"
            strokeOpacity="0.45"
            strokeLinecap="round"
            style={{ display: "none" }}
          />
          {/* Astronomical Target Reticle & Badge */}
          <g ref={svgTargetReticleRef} id="svg-target-reticle" style={{ display: "none" }}>
            <line id="reticle-ch-top" stroke="#1F48FF" strokeWidth="1.5" />
            <line id="reticle-ch-bottom" stroke="#1F48FF" strokeWidth="1.5" />
            <line id="reticle-ch-left" stroke="#1F48FF" strokeWidth="1.5" />
            <line id="reticle-ch-right" stroke="#1F48FF" strokeWidth="1.5" />
            <circle id="reticle-center" r="3" fill="none" stroke="#1F48FF" strokeWidth="1.5" />
            <rect id="reticle-badge-bg" rx="2" ry="2" fill="#111111" stroke="#F5F3ED" strokeOpacity="0.4" strokeWidth="1" />
            <text
              id="reticle-badge-text"
              fill="#F5F3ED"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
              alignmentBaseline="middle"
              letterSpacing="0.06em"
            />
          </g>
        </svg>

        {/* HTML Overlays (Pre-rendered DOM nodes positioned via translate3d) */}
        <div ref={labelContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {constellations.map((con) => {
            const isSelected = selection?.kind === "region" && con.id === selection.abbr;
            return (
              <div
                key={con.id}
                className={`absolute font-sans text-[9px] uppercase tracking-wider px-1 py-0.5 rounded ${isSelected
                    ? "bg-blue/30 text-cream border border-blue"
                    : "text-cream/70"
                  }`}
                style={{ display: "none", willChange: "transform" }}
              >
                {con.name}
              </div>
            );
          })}
        </div>

        {/* Bright Star Names */}
        <div ref={starLabelContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {namedStars.map((star, idx) => (
            <div
              key={star.idx ?? `${star.name}-${star.ra}-${star.dec}-${idx}`}
              className="absolute font-sans text-[8px] text-cream/80 tracking-wide select-none"
              style={{ display: "none", willChange: "transform" }}
            >
              {star.name}
            </div>
          ))}
        </div>

        {/* Cardinal Direction Markers (Horizon mode) */}
        <div ref={cardinalContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {CARDINAL_POINTS.map((cp) => (
            <div
              key={cp.label}
              className={`absolute font-mono text-[9px] font-normal tracking-widest select-none rounded ${
                cp.label.length === 1
                  ? "text-cream border border-blue/50 bg-ink/80 px-1 py-0.5"
                  : "text-cream/60 bg-ink/50 px-1 py-0.5"
              }`}
              style={{ display: "none", willChange: "transform" }}
            >
              {cp.label}
            </div>
          ))}
        </div>

        {/* Crosshair indicator for pinned point */}
        {pinnedPoint && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10" aria-hidden="true">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute w-full h-[1px] bg-blue" />
              <div className="absolute h-full w-[1px] bg-blue" />
              <div className="w-3 h-3 rounded-full border border-blue" />
            </div>
          </div>
        )}

        {/* Children (e.g. SelectionVisualizer action capsule) */}
        {children}
      </div>
    );
  }
);
