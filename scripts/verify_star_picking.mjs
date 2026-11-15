import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import * as THREE from "three";

// Load star catalogue & LUT data
const stars = JSON.parse(fs.readFileSync("public/data/stars.json", "utf8"));
const lutBuffer = fs.readFileSync("public/data/constellation_lut.bin");
const constellations = JSON.parse(fs.readFileSync("public/data/constellations.json", "utf8"));

function degToRad(deg) {
  return (deg * Math.PI) / 180.0;
}

function raDecToCartesian(raDeg, decDeg, radius = 100) {
  const raRad = degToRad(raDeg);
  const decRad = degToRad(decDeg);
  const cosDec = Math.cos(decRad);
  const x = -radius * cosDec * Math.sin(raRad);
  const y = radius * Math.sin(decRad);
  const z = -radius * cosDec * Math.cos(raRad);
  return [x, y, z];
}

function cartesianToRaDec(x, y, z) {
  const r = Math.sqrt(x * x + y * y + z * z);
  if (r < 1e-6) return [0, 0];
  const decRad = Math.asin(Math.max(-1.0, Math.min(1.0, y / r)));
  const decDeg = radToDeg(decRad);
  let raRad = Math.atan2(-x, -z);
  if (raRad < 0) raRad += 2 * Math.PI;
  const raDeg = radToDeg(raRad);
  return [raDeg, decDeg];
}

function radToDeg(rad) {
  return (rad * 180.0) / Math.PI;
}

function buildStarSpatialIndex(starsList) {
  const binSizeDeg = 5;
  const numRaBins = 72;
  const numDecBins = 36;
  const grid = Array.from({ length: numRaBins * numDecBins }, () => []);

  for (let i = 0; i < starsList.length; i++) {
    const s = starsList[i];
    const normRa = ((s.ra % 360.0) + 360.0) % 360.0;
    const clampedDec = Math.max(-90.0, Math.min(90.0, s.dec));

    const raBin = Math.floor(normRa / binSizeDeg) % numRaBins;
    const decBin = Math.max(0, Math.min(numDecBins - 1, Math.floor((clampedDec + 90.0) / binSizeDeg)));

    grid[decBin * numRaBins + raBin].push(i);
  }

  return { grid, numRaBins, numDecBins, binSizeDeg };
}

function pickNearestStar(spatialIndex, starsList, rayRa, rayDec, clientX, clientY, camera, width, height, radiusPx) {
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  const fovDeg = camera.fov || 60;
  const angularRadiusDeg = Math.max(1.5, (radiusPx / Math.max(1, height)) * fovDeg * 1.8);

  const minDec = Math.max(-90, rayDec - angularRadiusDeg);
  const maxDec = Math.min(90, rayDec + angularRadiusDeg);

  const cosDec = Math.max(0.15, Math.cos(degToRad(Math.abs(rayDec))));
  const raDelta = angularRadiusDeg / cosDec;

  const minRa = rayRa - raDelta;
  const maxRa = rayRa + raDelta;

  const minDecBin = Math.max(0, Math.min(35, Math.floor((minDec + 90.0) / spatialIndex.binSizeDeg)));
  const maxDecBin = Math.max(0, Math.min(35, Math.floor((maxDec + 90.0) / spatialIndex.binSizeDeg)));

  let bestStar = null;
  let bestMag = 999.0;
  let bestDist = radiusPx;

  const testedStarIndices = new Set();
  const starPosVec = new THREE.Vector3();

  for (let decBin = minDecBin; decBin <= maxDecBin; decBin++) {
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

          const star = starsList[starIdx];
          const [cx, cy, cz] = raDecToCartesian(star.ra, star.dec, 100);
          starPosVec.set(cx, cy, cz);

          const dot = starPosVec.clone().normalize().dot(camDir);
          if (dot <= 0.15) continue;

          starPosVec.project(camera);
          if (starPosVec.z >= 1.0) continue;

          const sx = (starPosVec.x * 0.5 + 0.5) * width;
          const sy = (-starPosVec.y * 0.5 + 0.5) * height;

          const dist = Math.hypot(sx - clientX, sy - clientY);
          if (dist <= radiusPx) {
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

function lookupRegionAtCoords(ra, dec) {
  const normRa = ((ra % 360.0) + 360.0) % 360.0;
  const clampedDec = Math.max(-90.0, Math.min(90.0, dec));
  const i = Math.floor(normRa / 0.5) % 720;
  const j = Math.max(0, Math.min(359, Math.floor((clampedDec + 90.0) / 0.5)));
  const conIdx = lutBuffer[j * 720 + i];
  return conIdx < constellations.length ? constellations[conIdx] : null;
}

const spatialIndex = buildStarSpatialIndex(stars);

test("Star Picking: Picking Sirius at its projected screen position succeeds", () => {
  const sirius = stars.find((s) => s.label === "Sirius");
  assert.ok(sirius, "Sirius must exist in the catalogue");

  const width = 1440;
  const height = 810;
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);

  // Point camera directly at Sirius
  const [tx, ty, tz] = raDecToCartesian(sirius.ra, sirius.dec, 100);
  camera.lookAt(tx, ty, tz);

  // Sirius should project exactly to screen center
  const screenX = width / 2;
  const screenY = height / 2;

  const picked = pickNearestStar(
    spatialIndex,
    stars,
    sirius.ra,
    sirius.dec,
    screenX,
    screenY,
    camera,
    width,
    height,
    12
  );

  assert.ok(picked, "Should pick a star");
  assert.strictEqual(picked.label, "Sirius");
  assert.strictEqual(picked.hip, sirius.hip);
});

test("Star Picking: Picking Vega within 10 CSS pixels succeeds", () => {
  const vega = stars.find((s) => s.label === "Vega");
  assert.ok(vega, "Vega must exist in the catalogue");

  const width = 1440;
  const height = 810;
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);

  const [tx, ty, tz] = raDecToCartesian(vega.ra, vega.dec, 100);
  camera.lookAt(tx, ty, tz);

  // Click 8 pixels offset from screen center
  const screenX = width / 2 + 6;
  const screenY = height / 2 - 5;

  const picked = pickNearestStar(
    spatialIndex,
    stars,
    vega.ra,
    vega.dec,
    screenX,
    screenY,
    camera,
    width,
    height,
    12
  );

  assert.ok(picked, "Should pick Vega within tolerance");
  assert.strictEqual(picked.label, "Vega");
});

test("Star Picking vs Region: Star near a boundary wins over the region", () => {
  // Alpheratz is on the boundary between Andromeda and Pegasus
  const alpheratz = stars.find((s) => s.label === "Alpheratz");
  assert.ok(alpheratz);

  const width = 1440;
  const height = 810;
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  const [tx, ty, tz] = raDecToCartesian(alpheratz.ra, alpheratz.dec, 100);
  camera.lookAt(tx, ty, tz);

  const pickedStar = pickNearestStar(
    spatialIndex,
    stars,
    alpheratz.ra,
    alpheratz.dec,
    width / 2,
    height / 2,
    camera,
    width,
    height,
    12
  );

  assert.ok(pickedStar, "Star must win over region");
  assert.strictEqual(pickedStar.label, "Alpheratz");
});

test("Star Picking vs Region: Click on empty sky picks region, not a star", () => {
  const width = 1440;
  const height = 810;
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);

  // Center of Ursa Major bowl region with no 6th mag stars at this exact coordinate
  const emptyRa = 175.0;
  const emptyDec = 58.0;

  const [tx, ty, tz] = raDecToCartesian(emptyRa, emptyDec, 100);
  camera.lookAt(tx, ty, tz);

  const pickedStar = pickNearestStar(
    spatialIndex,
    stars,
    emptyRa,
    emptyDec,
    width / 2,
    height / 2,
    camera,
    width,
    height,
    8 // strict radius
  );

  assert.strictEqual(pickedStar, null, "Empty sky should not pick any star");

  // Region lookup at this position should yield Ursa Major (UMa)
  const region = lookupRegionAtCoords(emptyRa, emptyDec);
  assert.ok(region, "Region should be identified");
  assert.strictEqual(region.id, "UMa");
});

test("Handedness & Projection: Camera at origin looking along -Z, +Y up", () => {
  const width = 1280;
  const height = 720;
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1); // looking along -Z
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  // RA 10 deg, Dec 0 must project to the LEFT of screen centre (screenX < width/2)
  const [x10, y10, z10] = raDecToCartesian(10, 0, 100);
  const p10 = new THREE.Vector3(x10, y10, z10).project(camera);
  const s10x = (p10.x * 0.5 + 0.5) * width;
  const s10y = (-p10.y * 0.5 + 0.5) * height;
  assert.ok(s10x < width / 2, `RA 10° must project LEFT of screen centre: got screenX=${s10x}, center=${width/2}`);
  assert.ok(Math.abs(s10y - height / 2) < 1.0, `Dec 0° must project at vertical screen centre: got screenY=${s10y}`);

  // RA 350 deg, Dec 0 must project to the RIGHT of screen centre (screenX > width/2)
  const [x350, y350, z350] = raDecToCartesian(350, 0, 100);
  const p350 = new THREE.Vector3(x350, y350, z350).project(camera);
  const s350x = (p350.x * 0.5 + 0.5) * width;
  assert.ok(s350x > width / 2, `RA 350° must project RIGHT of screen centre: got screenX=${s350x}, center=${width/2}`);

  // Dec +10 deg, RA 0 must project ABOVE screen centre (screenY < height/2 in screen pixel coords)
  const [xDec, yDec, zDec] = raDecToCartesian(0, 10, 100);
  const pDec = new THREE.Vector3(xDec, yDec, zDec).project(camera);
  const sDecY = (-pDec.y * 0.5 + 0.5) * height;
  assert.ok(sDecY < height / 2, `Dec +10° must project ABOVE screen centre: got screenY=${sDecY}, center=${height/2}`);
});

test("Coordinates: Full Grid Round-Trip including poles and RA wrap", () => {
  let maxError = 0;
  for (let ra = 0; ra <= 360; ra += 15) {
    for (let dec = -89; dec <= 89; dec += 10) {
      const [x, y, z] = raDecToCartesian(ra, dec, 100);
      const [raOut, decOut] = cartesianToRaDec(x, y, z);
      const dRa = Math.abs(((raOut - ra) % 360 + 540) % 360 - 180);
      const dDec = Math.abs(decOut - dec);
      if (dRa > maxError) maxError = dRa;
      if (dDec > maxError) maxError = dDec;
    }
  }
  assert.ok(maxError < 1e-6, `Round-trip error must be negligible: maxError=${maxError}`);

  // Test exact North and South poles
  const [, decNorth] = cartesianToRaDec(...raDecToCartesian(0, 90, 100));
  assert.ok(Math.abs(decNorth - 90) < 1e-6, "North pole Dec should be +90");
  const [, decSouth] = cartesianToRaDec(...raDecToCartesian(0, -90, 100));
  assert.ok(Math.abs(decSouth - (-90)) < 1e-6, "South pole Dec should be -90");
});

test("Astronomical Shapes: Orion and Andromeda relative positions", () => {
  // Facing sky from inside: North is UP, East is LEFT (increasing RA = screen LEFT)
  const betelgeuse = stars.find((s) => s.label === "Betelgeuse");
  const rigel = stars.find((s) => s.label === "Rigel");
  assert.ok(betelgeuse && rigel, "Betelgeuse and Rigel must exist in catalogue");

  // Betelgeuse (higher Dec, higher RA) is UPPER-LEFT of Rigel
  assert.ok(betelgeuse.dec > rigel.dec, `Betelgeuse Dec (${betelgeuse.dec}) > Rigel Dec (${rigel.dec})`);
  assert.ok(betelgeuse.ra > rigel.ra, `Betelgeuse RA (${betelgeuse.ra}) > Rigel RA (${rigel.ra})`);

  // Project Betelgeuse and Rigel with camera centered on Orion center (~RA 83, Dec 0)
  const width = 1280;
  const height = 720;
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 0, 0);
  const [ox, oy, oz] = raDecToCartesian(83.5, 0, 100);
  camera.lookAt(ox, oy, oz);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const [bx, by, bz] = raDecToCartesian(betelgeuse.ra, betelgeuse.dec, 100);
  const [rx, ry, rz] = raDecToCartesian(rigel.ra, rigel.dec, 100);

  const pb = new THREE.Vector3(bx, by, bz).project(camera);
  const pr = new THREE.Vector3(rx, ry, rz).project(camera);

  const sbX = (pb.x * 0.5 + 0.5) * width;
  const sbY = (-pb.y * 0.5 + 0.5) * height;
  const srX = (pr.x * 0.5 + 0.5) * width;
  const srY = (-pr.y * 0.5 + 0.5) * height;

  // In screen coordinates: screenX of Betelgeuse < screenX of Rigel (LEFT), screenY of Betelgeuse < screenY of Rigel (UPPER)
  assert.ok(sbX < srX, `Betelgeuse (screenX=${sbX}) must be LEFT of Rigel (screenX=${srX})`);
  assert.ok(sbY < srY, `Betelgeuse (screenY=${sbY}) must be UPPER (smaller Y) than Rigel (screenY=${srY})`);
});
