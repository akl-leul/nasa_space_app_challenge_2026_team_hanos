// Web Worker for off-thread astronomical geometry processing
// Source of truth for coordinate conversion: src/lib/astro/coordinates.ts (inside-the-sphere convention)
function raDecToCartesian(raDeg, decDeg, radius) {
  const raRad = (raDeg * Math.PI) / 180.0;
  const decRad = (decDeg * Math.PI) / 180.0;

  const cosDec = Math.cos(decRad);
  // Inside the celestial sphere: +Y is NCP, -Z is RA 0, -X is RA 90 (East, screen-left)
  const x = -radius * cosDec * Math.sin(raRad);
  const y = radius * Math.sin(decRad);
  const z = -radius * cosDec * Math.cos(raRad);

  return [x, y, z];
}

self.onmessage = function (e) {
  const { type, boundariesBuffer, starsBuffer, radius = 100 } = e.data;

  if (type === "process_data") {
    // 1. Process boundaries
    const bView = new Float32Array(boundariesBuffer);
    const numSegments = Math.floor(bView.length / 4);
    const boundaryPositions = new Float32Array(numSegments * 6);

    for (let i = 0; i < numSegments; i++) {
      const ra1 = bView[i * 4];
      const dec1 = bView[i * 4 + 1];
      const ra2 = bView[i * 4 + 2];
      const dec2 = bView[i * 4 + 3];

      const [x1, y1, z1] = raDecToCartesian(ra1, dec1, radius * 0.994);
      const [x2, y2, z2] = raDecToCartesian(ra2, dec2, radius * 0.994);

      boundaryPositions[i * 6] = x1;
      boundaryPositions[i * 6 + 1] = y1;
      boundaryPositions[i * 6 + 2] = z1;
      boundaryPositions[i * 6 + 3] = x2;
      boundaryPositions[i * 6 + 4] = y2;
      boundaryPositions[i * 6 + 5] = z2;
    }

    // 2. Process stars
    // Each star: ra (float32), dec (float32), mag (float32), bv (float32), hip (uint32) = 20 bytes
    const starDataView = new DataView(starsBuffer);
    const numStars = Math.floor(starsBuffer.byteLength / 20);
    const starPositions = new Float32Array(numStars * 3);
    const starColors = new Float32Array(numStars * 3);

    // Cream base RGB: (0.96, 0.95, 0.93)
    const baseR = 0.96;
    const baseG = 0.95;
    const baseB = 0.93;

    for (let i = 0; i < numStars; i++) {
      const offset = i * 20;
      const ra = starDataView.getFloat32(offset, true);
      const dec = starDataView.getFloat32(offset + 4, true);
      const mag = starDataView.getFloat32(offset + 8, true);

      const [x, y, z] = raDecToCartesian(ra, dec, radius);
      starPositions[i * 3] = x;
      starPositions[i * 3 + 1] = y;
      starPositions[i * 3 + 2] = z;

      // Magnitude-based brightness (brighter stars get full cream, faint stars get dimmer)
      const brightness = Math.max(0.35, Math.min(1.0, 1.0 - 0.11 * Math.max(0, mag)));
      starColors[i * 3] = baseR * brightness;
      starColors[i * 3 + 1] = baseG * brightness;
      starColors[i * 3 + 2] = baseB * brightness;
    }

    // Transfer buffers back to main thread
    self.postMessage(
      {
        type: "data_ready",
        boundaryPositions,
        starPositions,
        starColors,
      },
      [boundaryPositions.buffer, starPositions.buffer, starColors.buffer]
    );
  }
};
