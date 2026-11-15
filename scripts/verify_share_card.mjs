import test from "node:test";
import assert from "node:assert/strict";
import qrcode from "qrcode-generator";
import jsQR from "jsqr";

// 1. Stereographic projection formula (identical to src/lib/share/projection.ts)
function degToRad(deg) {
  return (deg * Math.PI) / 180.0;
}

function projectStereographic(raDeg, decDeg, ra0Deg, dec0Deg) {
  const ra = degToRad(raDeg);
  const dec = degToRad(decDeg);
  const ra0 = degToRad(ra0Deg);
  const dec0 = degToRad(dec0Deg);

  const dRa = ra - ra0;
  const cosC = Math.sin(dec0) * Math.sin(dec) + Math.cos(dec0) * Math.cos(dec) * Math.cos(dRa);

  if (cosC <= 0.0) {
    return { x: 0, y: 0, visible: false };
  }

  const k = 2.0 / (1.0 + cosC);
  const x = -k * Math.cos(dec) * Math.sin(dRa);
  const y = k * (Math.cos(dec0) * Math.sin(dec) - Math.sin(dec0) * Math.cos(dec) * Math.cos(dRa));

  return { x, y, visible: true };
}

// 2. Share URL builder & helpers (identical to src/lib/share/shareUrl.ts)
function getDefaultFovForSelection(selection) {
  if (selection.kind === "region") {
    const area = selection.areaSqDeg ?? 500;
    const angularRadius = Math.sqrt(area / Math.PI);
    const computed = 2.2 * angularRadius;
    return Math.round(Math.max(20.0, Math.min(100.0, computed)) * 10) / 10;
  }
  return 12.0;
}

function isLocalhostOrigin(originUrl) {
  try {
    const url = new URL(originUrl);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "0.0.0.0" ||
      url.hostname === "::1"
    );
  } catch {
    return originUrl.includes("localhost") || originUrl.includes("127.0.0.1");
  }
}

function buildShareUrl(selection, baseOrigin = "https://hanos.space") {
  const fov = getDefaultFovForSelection(selection);
  const raStr = selection.ra.toFixed(2);
  const decStr = selection.dec.toFixed(2);
  const fovStr = fov.toFixed(1);
  const selStr = selection.kind === "region" ? `region:${selection.abbr}` : `star:${selection.id}`;

  return `${baseOrigin}/explore?ra=${raStr}&dec=${decStr}&fov=${fovStr}&sel=${encodeURIComponent(selStr)}`;
}

function generateCardFilename(selection) {
  const rawName = selection.name || (selection.kind === "star" ? `hip-${selection.id}` : selection.abbr);
  const slug = rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const idSuffix = selection.kind === "region" ? selection.abbr.toLowerCase() : `hip${selection.id}`;
  return `hanos-${slug}-${idSuffix}.png`;
}

// 3. Facts formatting helper (identical to src/lib/share/facts.ts)
const TOTAL_SKY_SQ_DEG = 41252.96;

function formatCoordinatesSexagesimal(raDeg, decDeg) {
  const normRa = ((raDeg % 360) + 360) % 360;
  let totalRaSec = Math.round((normRa / 15.0) * 3600.0);
  if (totalRaSec >= 86400) totalRaSec -= 86400;
  const h = Math.floor(totalRaSec / 3600);
  const m = Math.floor((totalRaSec % 3600) / 60);
  const s = totalRaSec % 60;

  const sign = decDeg >= 0 ? "+" : "−";
  const totalDecSec = Math.round(Math.abs(decDeg) * 3600.0);
  const d = Math.floor(totalDecSec / 3600);
  const dm = Math.floor((totalDecSec % 3600) / 60);
  const ds = totalDecSec % 60;

  const raStr = `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  const decStr = `${sign}${String(d).padStart(2, "0")}° ${String(dm).padStart(2, "0")}′ ${String(ds).padStart(2, "0")}″`;

  return `RA ${raStr} · DEC ${decStr} · J2000`;
}

function formatStraightCoordinatesSexagesimal(raDeg, decDeg) {
  const normRa = ((raDeg % 360) + 360) % 360;
  const totalRaSec = (normRa / 15.0) * 3600.0;
  const h = Math.floor(totalRaSec / 3600);
  const m = Math.floor((totalRaSec % 3600) / 60);
  const s = (totalRaSec % 60).toFixed(1);

  const sign = decDeg >= 0 ? "+" : "-";
  const totalDecSec = Math.round(Math.abs(decDeg) * 3600.0);
  const d = Math.floor(totalDecSec / 3600);
  const dm = Math.floor((totalDecSec % 3600) / 60);
  const ds = totalDecSec % 60;

  const raStr = `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}'${String(s).padStart(4, "0")}"`;
  const decStr = `${sign}${String(d).padStart(2, "0")}°${String(dm).padStart(2, "0")}'${String(ds).padStart(2, "0")}"`;

  return `${raStr} ${decStr} J2000`;
}

// --- TESTS ---

test("Stereographic Projection: Center maps to (0, 0)", () => {
  const pt = projectStereographic(83.82, -5.39, 83.82, -5.39);
  assert.equal(pt.visible, true);
  assert.ok(Math.abs(pt.x) < 1e-12, `Expected x ~ 0, got ${pt.x}`);
  assert.ok(Math.abs(pt.y) < 1e-12, `Expected y ~ 0, got ${pt.y}`);
});

test("Stereographic Projection: Handedness & Orientation (North is UP, East is LEFT)", () => {
  const centerRa = 84.0;
  const centerDec = 0.0;

  // 1. Point due North (Dec > 0, same RA)
  const northPt = projectStereographic(84.0, 5.0, centerRa, centerDec);
  assert.equal(northPt.visible, true);
  assert.ok(northPt.y > 0, "North point must have positive y (UP)");
  assert.ok(Math.abs(northPt.x) < 1e-6, "North point must be vertically aligned");

  // 2. Point due South (Dec < 0, same RA)
  const southPt = projectStereographic(84.0, -5.0, centerRa, centerDec);
  assert.equal(southPt.visible, true);
  assert.ok(southPt.y < 0, "South point must have negative y (DOWN)");
  assert.ok(Math.abs(southPt.x) < 1e-6, "South point must be vertically aligned");

  // 3. Point due East (higher RA, same Dec) -> must be LEFT (negative x)
  const eastPt = projectStereographic(89.0, 0.0, centerRa, centerDec);
  assert.equal(eastPt.visible, true);
  assert.ok(eastPt.x < 0, "East point (higher RA) must have negative x (LEFT)");
  assert.ok(Math.abs(eastPt.y) < 1e-6, "Equatorial East point must be horizontally aligned");

  // 4. Point due West (lower RA, same Dec) -> must be RIGHT (positive x)
  const westPt = projectStereographic(79.0, 0.0, centerRa, centerDec);
  assert.equal(westPt.visible, true);
  assert.ok(westPt.x > 0, "West point (lower RA) must have positive x (RIGHT)");
  assert.ok(Math.abs(westPt.y) < 1e-6, "Equatorial West point must be horizontally aligned");
});

test("Share URL Generation: Parameters, default FOV, and localhost detection", () => {
  const regionSel = {
    kind: "region",
    abbr: "And",
    name: "Andromeda",
    ra: 10.7,
    dec: 41.3,
    areaSqDeg: 722.3,
  };

  const starSel = {
    kind: "star",
    id: 32349,
    name: "Sirius",
    ra: 101.287,
    dec: -16.716,
    mag: -1.44,
  };

  // Default FOV checks
  const regionFov = getDefaultFovForSelection(regionSel);
  assert.ok(regionFov >= 20.0 && regionFov <= 100.0, `FOV out of range: ${regionFov}`);
  // Andromeda area ~722 -> sqrt(722/pi) ~ 15.16 -> 2.2 * 15.16 ~ 33.3
  assert.equal(regionFov, 33.4);

  const starFov = getDefaultFovForSelection(starSel);
  assert.equal(starFov, 12.0);

  // URL formatting
  const urlRegion = buildShareUrl(regionSel, "https://hanos.space");
  assert.equal(
    urlRegion,
    "https://hanos.space/explore?ra=10.70&dec=41.30&fov=33.4&sel=region%3AAnd"
  );

  const urlStar = buildShareUrl(starSel, "https://hanos.space");
  assert.equal(
    urlStar,
    "https://hanos.space/explore?ra=101.29&dec=-16.72&fov=12.0&sel=star%3A32349"
  );

  // Localhost detection
  assert.equal(isLocalhostOrigin("http://localhost:3000"), true);
  assert.equal(isLocalhostOrigin("http://127.0.0.1:3000"), true);
  assert.equal(isLocalhostOrigin("https://hanos.space"), false);
  assert.equal(isLocalhostOrigin("https://nasa-apps.org"), false);

  // Filename generator
  assert.equal(generateCardFilename(regionSel), "hanos-andromeda-and.png");
  assert.equal(generateCardFilename(starSel), "hanos-sirius-hip32349.png");
  assert.equal(
    generateCardFilename({ kind: "region", abbr: "PsA", name: "Piscis Austrinus", ra: 332, dec: -30 }),
    "hanos-piscis-austrinus-psa.png"
  );
});

test("Total Celestial Sphere Area Calculation", () => {
  const calculated = 4 * Math.PI * Math.pow(180 / Math.PI, 2);
  assert.ok(Math.abs(TOTAL_SKY_SQ_DEG - calculated) < 0.1);
});

test("Sexagesimal Coordinates Formatting", () => {
  // Andromeda center (RA 10.7° = 00h 42m 48s, Dec +41.3° = +41° 18′ 00″)
  const andCoords = formatCoordinatesSexagesimal(10.7, 41.3);
  assert.equal(andCoords, "RA 00h 42m 48s · DEC +41° 18′ 00″ · J2000");

  // Sirius (RA 101.287° = 06h 45m 08.88s, Dec -16.716° = −16° 42′ 57.6″)
  const siriusCoords = formatCoordinatesSexagesimal(101.287, -16.716);
  assert.equal(siriusCoords, "RA 06h 45m 09s · DEC −16° 42′ 58″ · J2000");
});

test("QR Code Round-trip: Encode with qrcode-generator and decode with jsQR", () => {
  const testUrls = [
    "https://hanos.space/explore?ra=10.70&dec=41.30&fov=33.4&sel=region%3AAnd",
    "https://hanos.space/explore?ra=101.29&dec=-16.72&fov=12.0&sel=star%3A32349",
  ];

  for (const expectedUrl of testUrls) {
    const qr = qrcode(0, "M");
    qr.addData(expectedUrl);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const quietZone = 4;
    const totalModules = moduleCount + quietZone * 2;
    const modulePx = 6;
    const imgSize = totalModules * modulePx;

    // Build raw RGBA buffer
    const rgba = new Uint8ClampedArray(imgSize * imgSize * 4);

    // Initialize with cream/white background
    rgba.fill(255);

    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) {
          const startX = (c + quietZone) * modulePx;
          const startY = (r + quietZone) * modulePx;

          for (let dy = 0; dy < modulePx; dy++) {
            for (let dx = 0; dx < modulePx; dx++) {
              const pixelIdx = ((startY + dy) * imgSize + (startX + dx)) * 4;
              rgba[pixelIdx] = 0;     // R
              rgba[pixelIdx + 1] = 0; // G
              rgba[pixelIdx + 2] = 0; // B
              rgba[pixelIdx + 3] = 255; // A
            }
          }
        }
      }
    }

    const decoded = jsQR(rgba, imgSize, imgSize);
    assert.ok(decoded, `QR code decoding failed for ${expectedUrl}`);
    assert.equal(decoded.data, expectedUrl, `Decoded payload mismatch`);
  }
});

test("Straight Quote Sexagesimal Coordinates (Prompt 08)", () => {
  // Test formatting with straight quotes and J2000
  const coords = formatStraightCoordinatesSexagesimal(10.684, 41.269);
  assert.equal(coords, `00h42'44.2" +41°16'08" J2000`);
});

test("QR Code Inverted Polarity: Decode with attemptBoth", () => {
  const url = "https://hanos.space/explore?ra=10.70&dec=41.30&fov=33.4&sel=region%3AAnd";
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();

  const count = qr.getModuleCount();
  const quiet = 4;
  const scale = 4;
  const size = (count + quiet * 2) * scale;
  const rgba = new Uint8ClampedArray(size * size * 4);

  // Inverted background: dark tile #151515
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4 + 0] = 0x15;
    rgba[i * 4 + 1] = 0x15;
    rgba[i * 4 + 2] = 0x15;
    rgba[i * 4 + 3] = 0xff;
  }

  // Inverted foreground: light modules #DBDBDB
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = (c + quiet) * scale + dx;
            const py = (r + quiet) * scale + dy;
            const idx = (py * size + px) * 4;
            rgba[idx + 0] = 0xdb;
            rgba[idx + 1] = 0xdb;
            rgba[idx + 2] = 0xdb;
            rgba[idx + 3] = 0xff;
          }
        }
      }
    }
  }

  const decoded = jsQR(rgba, size, size, { inversionAttempts: "attemptBoth" });
  assert.ok(decoded, "Inverted QR decoding failed");
  assert.equal(decoded.data, url);
});
