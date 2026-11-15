import * as THREE from "three";
import { StarRecord } from "@/types/sky";
import { raDecToCartesian, degToRad } from "./coordinates";

export interface StarSpatialIndex {
  grid: number[][]; // 72 RA bins x 36 Dec bins (each 5 degrees)
  numRaBins: number;
  numDecBins: number;
  binSizeDeg: number;
}

/**
 * Builds an O(1) spatial grid index of star catalogue indices for fast pointer hit-testing.
 * Dividing the sphere into 5° x 5° cells (72 x 36 = 2,592 cells).
 * Each cell contains indices of stars located in that patch.
 */
export function buildStarSpatialIndex(stars: StarRecord[]): StarSpatialIndex {
  const binSizeDeg = 5;
  const numRaBins = 72; // 360 / 5
  const numDecBins = 36; // 180 / 5
  const grid: number[][] = Array.from({ length: numRaBins * numDecBins }, () => []);

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const normRa = ((s.ra % 360.0) + 360.0) % 360.0;
    const clampedDec = Math.max(-90.0, Math.min(90.0, s.dec));

    const raBin = Math.floor(normRa / binSizeDeg) % numRaBins;
    const decBin = Math.max(0, Math.min(numDecBins - 1, Math.floor((clampedDec + 90.0) / binSizeDeg)));

    grid[decBin * numRaBins + raBin].push(i);
  }

  return { grid, numRaBins, numDecBins, binSizeDeg };
}

const _starPosVec = new THREE.Vector3();
const _scratchVec = new THREE.Vector3();
const _camDirVec = new THREE.Vector3();

/**
 * Rapidly picks the closest and brightest star within `radiusPx` CSS pixels of the pointer.
 * Evaluates only candidate stars in neighboring spatial index cells instead of iterating all 5,044 stars.
 */
export function pickNearestStar(
  spatialIndex: StarSpatialIndex,
  stars: StarRecord[],
  rayRa: number,
  rayDec: number,
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  width: number,
  height: number,
  radiusPx: number,
  isHorizon = false,
  horizonEuler?: THREE.Euler | THREE.Quaternion
): StarRecord | null {
  if (!stars || stars.length === 0 || !spatialIndex) return null;

  camera.getWorldDirection(_camDirVec);

  // Angular search radius approximation with safety margin
  const fovDeg = (camera as THREE.PerspectiveCamera).fov || 60;
  const angularRadiusDeg = Math.max(1.5, (radiusPx / Math.max(1, height)) * fovDeg * 1.8);

  const minDec = Math.max(-90, rayDec - angularRadiusDeg);
  const maxDec = Math.min(90, rayDec + angularRadiusDeg);

  const cosDec = Math.max(0.15, Math.cos(degToRad(Math.abs(rayDec))));
  const raDelta = angularRadiusDeg / cosDec;

  const minRa = rayRa - raDelta;
  const maxRa = rayRa + raDelta;

  const minDecBin = Math.max(0, Math.min(35, Math.floor((minDec + 90.0) / spatialIndex.binSizeDeg)));
  const maxDecBin = Math.max(0, Math.min(35, Math.floor((maxDec + 90.0) / spatialIndex.binSizeDeg)));

  let bestStar: StarRecord | null = null;
  let bestMag = 999.0;
  let bestDist = radiusPx;

  // Set to avoid duplicate testing if cell indices wrap
  const testedStarIndices = new Set<number>();

  for (let decBin = minDecBin; decBin <= maxDecBin; decBin++) {
    // Check RA bins covering the range
    const startRaBin = Math.floor((((minRa % 360) + 360) % 360) / spatialIndex.binSizeDeg);
    const endRaBin = Math.floor((((maxRa % 360) + 360) % 360) / spatialIndex.binSizeDeg);

    let curRaBin = startRaBin;
    while (true) {
      const cellIdx = decBin * spatialIndex.numRaBins + curRaBin;
      const cellStarIndices = spatialIndex.grid[cellIdx];

      if (cellStarIndices) {
        for (let k = 0; k < cellStarIndices.length; k++) {
          const starIdx = cellStarIndices[k];
          if (testedStarIndices.has(starIdx)) continue;
          testedStarIndices.add(starIdx);

          const star = stars[starIdx];
          const [cx, cy, cz] = raDecToCartesian(star.ra, star.dec, 100);
          _starPosVec.set(cx, cy, cz);

          if (isHorizon && horizonEuler) {
            if ("isQuaternion" in horizonEuler) {
              _starPosVec.applyQuaternion(horizonEuler as THREE.Quaternion);
            } else {
              _starPosVec.applyEuler(horizonEuler as THREE.Euler);
            }
          }

          // Check if star is in front of camera
          const dot = _scratchVec.copy(_starPosVec).normalize().dot(_camDirVec);
          if (dot <= 0.15) continue;

          // Project to normalized device coordinates
          _starPosVec.project(camera);
          if (_starPosVec.z >= 1.0) continue;

          // Convert to viewport pixel coordinates
          const sx = (_starPosVec.x * 0.5 + 0.5) * width;
          const sy = (-_starPosVec.y * 0.5 + 0.5) * height;

          const dist = Math.hypot(sx - clientX, sy - clientY);
          if (dist <= radiusPx) {
            // Prefer brightest star; break ties by proximity
            if (star.mag < bestMag || (Math.abs(star.mag - bestMag) < 0.2 && dist < bestDist)) {
              bestStar = star;
              bestMag = star.mag;
              bestDist = dist;
            }
          }
        }
      }

      if (curRaBin === endRaBin) break;
      curRaBin = (curRaBin + 1) % spatialIndex.numRaBins;
    }
  }

  return bestStar;
}

/**
 * Returns a human-friendly catalogue label for a star
 */
export function getStarDisplayName(star: StarRecord): string {
  if (star.label && star.label.trim()) {
    return star.label.trim();
  }
  return `HIP ${star.hip}`;
}
