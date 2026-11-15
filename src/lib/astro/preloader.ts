let hasPreloaded = false;

export function warmUpSkyDome() {
  if (hasPreloaded || typeof window === "undefined") return;

  // Check Save-Data and slow connection
  const nav = navigator as unknown as {
    connection?: {
      saveData?: boolean;
      effectiveType?: string;
    };
  };

  if (nav.connection) {
    if (nav.connection.saveData === true) return;
    if (nav.connection.effectiveType === "2g" || nav.connection.effectiveType === "slow-2g") {
      return;
    }
  }

  hasPreloaded = true;

  // Prefetch data files into browser HTTP cache
  const dataFiles = [
    "/data/constellations.json",
    "/data/boundaries.bin",
    "/data/stars.bin",
    "/data/constellation_lut.bin",
    "/data/named_stars.json",
    "/workers/sky-worker.js",
  ];

  dataFiles.forEach((url) => {
    fetch(url, { cache: "force-cache" }).catch(() => {});
  });
}

export function scheduleSkyDomePreload() {
  if (typeof window === "undefined") return;

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => warmUpSkyDome(), { timeout: 3000 });
  } else {
    setTimeout(warmUpSkyDome, 1500);
  }
}
