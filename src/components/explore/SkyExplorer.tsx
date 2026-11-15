"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  ConstellationInfo,
  StarRecord,
  SkySelection,
  SkySelectionCallback,
  PlayRegionParams,
} from "@/types/sky";
import { SkyDomeCanvas, SkyDomeCanvasHandle } from "./SkyDomeCanvas";
import { SelectionVisualizer } from "./SelectionVisualizer";
import { TimeLapseDock } from "./dock/TimeLapseDock";
import { resolveActiveTarget } from "@/lib/explore/resolveTarget";
import { TopToolbar } from "./toolbar/TopToolbar";
import { ExploreProvider, useExplore } from "./toolbar/ExploreContext";
import { StatusBar } from "./StatusBar";
import { raDecToCartesian } from "@/lib/astro/coordinates";
import { getStarDisplayName } from "@/lib/astro/starIndex";

// Lazy-load ShareCardDialog only when requested to avoid growing initial bundle
const ShareCardDialog = dynamic(() => import("./ShareCardDialog"), {
  ssr: false,
});

// Lazy-load the sound pop-up too: it brings the audio engine, which most visits never need
const SonificationDialog = dynamic(() => import("./SonificationDialog"), {
  ssr: false,
});

interface NamedStarRecord {
  name: string;
  mag: number;
  ra: number;
  dec: number;
}

interface SkyExplorerProps {
  onSelect?: SkySelectionCallback;
  onPlayRegion?: (params: PlayRegionParams) => void;
}

// Synchronous fallback processor in case Web Worker is unavailable or blocked
function processAstroDataSync(
  boundariesBuffer: ArrayBuffer,
  starsBuffer: ArrayBuffer,
  radius = 100
) {
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
  const starDataView = new DataView(starsBuffer);
  const numStars = Math.floor(starsBuffer.byteLength / 20);
  const starPositions = new Float32Array(numStars * 3);
  const starColors = new Float32Array(numStars * 3);

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

    const brightness = Math.max(0.35, Math.min(1.0, 1.0 - 0.11 * Math.max(0, mag)));
    starColors[i * 3] = baseR * brightness;
    starColors[i * 3 + 1] = baseG * brightness;
    starColors[i * 3 + 2] = baseB * brightness;
  }

  return { boundaryPositions, starPositions, starColors };
}

function SkyExplorerInner({ onSelect, onPlayRegion }: SkyExplorerProps) {
  const {
    viewCenter,
    setViewCenter,
    fov,
    setFov,
    isHorizon,
    isGrid,
    showLabels,
    setFlyToHandler,
    setResetViewHandler,
    setZoomHandlers,
    setRegionPlayNotice,
    setActiveTarget,
    setDockOpen,
    embedMode,
  } = useExplore();

  const [constellations, setConstellations] = useState<ConstellationInfo[]>([]);
  const [stars, setStars] = useState<StarRecord[]>([]);
  const [namedStars, setNamedStars] = useState<NamedStarRecord[]>([]);
  const [constellationPolygons, setConstellationPolygons] = useState<Record<string, number[][][]> | null>(null);
  const [boundaryPositions, setBoundaryPositions] = useState<Float32Array | null>(null);
  const [starPositions, setStarPositions] = useState<Float32Array | null>(null);
  const [starColors, setStarColors] = useState<Float32Array | null>(null);
  const [lutBuffer, setLutBuffer] = useState<Uint8Array | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // URL state initialization via lazy state initializer
  const [initialParams] = useState<{ ra: number; dec: number; fov: number; sel: string | null }>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qRa = parseFloat(params.get("ra") || "");
      const qDec = parseFloat(params.get("dec") || "");
      const qFov = parseFloat(params.get("fov") || "");
      const qSel = params.get("sel") || null;
      return {
        ra: !isNaN(qRa) && qRa >= 0 && qRa <= 360 ? qRa : 0,
        dec: !isNaN(qDec) && qDec >= -90 && qDec <= 90 ? qDec : 0,
        fov: !isNaN(qFov) && qFov >= 5 && qFov <= 100 ? qFov : 60.0,
        sel: qSel,
      };
    }
    return { ra: 0, dec: 0, fov: 60.0, sel: null };
  });

  const [selection, setSelection] = useState<SkySelection | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<{ ra: number; dec: number } | null>(null);
  const [isShareCardOpen, setIsShareCardOpen] = useState(false);
  const [soundRegion, setSoundRegion] = useState<PlayRegionParams | null>(null);

  const prefetchShareCard = useCallback(() => {
    import("./ShareCardDialog");
  }, []);

  // Fetch celestial catalogue, boundary polygons and binary buffers on mount
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);

        const [cRes, sRes, nsRes, polyRes, bRes, sBinRes, lutRes] = await Promise.all([
          fetch("/data/constellations.json"),
          fetch("/data/stars.json"),
          fetch("/data/named_stars.json"),
          fetch("/data/constellation_polygons.json"),
          fetch("/data/boundaries.bin"),
          fetch("/data/stars.bin"),
          fetch("/data/constellation_lut.bin"),
        ]);

        if (
          !cRes.ok ||
          !sRes.ok ||
          !nsRes.ok ||
          !polyRes.ok ||
          !bRes.ok ||
          !sBinRes.ok ||
          !lutRes.ok
        ) {
          throw new Error("Failed to load astronomical reference data.");
        }

        const [cData, sData, nsData, polyData, bBuf, sBuf, lutBuf] = await Promise.all([
          cRes.json(),
          sRes.json(),
          nsRes.json(),
          polyRes.json(),
          bRes.arrayBuffer(),
          sBinRes.arrayBuffer(),
          lutRes.arrayBuffer(),
        ]);

        if (cancelled) return;

        setConstellations(cData);
        setStars(sData);
        setNamedStars(nsData);
        setConstellationPolygons(polyData);
        setLutBuffer(new Uint8Array(lutBuf));

        // Restore initial selection if ?sel= was in URL
        if (initialParams.sel) {
          const selStr = initialParams.sel;
          if (selStr.startsWith("region:")) {
            const abbr = selStr.replace("region:", "").trim();
            const con = cData.find(
              (c: ConstellationInfo) => c.id.toLowerCase() === abbr.toLowerCase()
            );
            if (con) {
              setSelection({
                kind: "region",
                abbr: con.id,
                name: con.name,
                ra: con.center[0],
                dec: con.center[1],
                areaSqDeg: con.area,
                constellation: con,
              });
              setPinnedPoint({ ra: con.center[0], dec: con.center[1] });
            }
          } else if (selStr.startsWith("star:")) {
            const starTarget = selStr.replace("star:", "").trim();
            const star = sData.find(
              (s: StarRecord) =>
                s.hip.toString() === starTarget ||
                s.label?.toLowerCase() === starTarget.toLowerCase()
            );
            if (star) {
              const con = cData.find((c: ConstellationInfo) => c.id === star.con) || null;
              setSelection({
                kind: "star",
                id: star.hip,
                name: getStarDisplayName(star),
                ra: star.ra,
                dec: star.dec,
                mag: star.mag,
                bv: star.bv,
                constellation: con,
              });
              setPinnedPoint({ ra: star.ra, dec: star.dec });
            }
          }
        }

        // Off-thread geometry processing via Web Worker with instant fallback
        let workerFinished = false;
        if (typeof window !== "undefined" && window.Worker) {
          try {
            const worker = new Worker("/workers/sky-worker.js");
            worker.onmessage = (e) => {
              if (cancelled) {
                worker.terminate();
                return;
              }
              const { type, boundaryPositions: bp, starPositions: sp, starColors: sc } = e.data;
              if (type === "data_ready") {
                workerFinished = true;
                setBoundaryPositions(bp);
                setStarPositions(sp);
                setStarColors(sc);
                setLoading(false);
                worker.terminate();
              }
            };
            worker.onerror = () => {
              if (!workerFinished && !cancelled) {
                const res = processAstroDataSync(bBuf, sBuf);
                setBoundaryPositions(res.boundaryPositions);
                setStarPositions(res.starPositions);
                setStarColors(res.starColors);
                setLoading(false);
                worker.terminate();
              }
            };

            worker.postMessage(
              {
                type: "process_data",
                boundariesBuffer: bBuf,
                starsBuffer: sBuf,
                radius: 100,
              },
              [bBuf, sBuf]
            );
            return;
          } catch {
            // Worker instantiation failed -> proceed to fallback
          }
        }

        // Direct main thread fallback
        const res = processAstroDataSync(bBuf, sBuf);
        if (!cancelled) {
          setBoundaryPositions(res.boundaryPositions);
          setStarPositions(res.starPositions);
          setStarColors(res.starColors);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error loading sky data");
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [initialParams.sel]);

  // Debounced URL state update (?ra=&dec=&fov=&sel=...)
  const urlDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (loading) return;

    if (urlDebounceTimer.current) {
      clearTimeout(urlDebounceTimer.current);
    }

    urlDebounceTimer.current = setTimeout(() => {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams();
        params.set("ra", viewCenter.ra.toFixed(2));
        params.set("dec", viewCenter.dec.toFixed(2));
        params.set("fov", fov.toFixed(1));

        if (selection) {
          if (selection.kind === "region") {
            params.set("sel", `region:${selection.abbr}`);
          } else {
            params.set("sel", `star:${selection.id}`);
          }
        }

        // keep a shared ?target=Name while nothing else has been selected, so the link stays valid
        const sharedTarget = new URLSearchParams(window.location.search).get("target");
        if (sharedTarget && !selection) params.set("target", sharedTarget);

        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState(null, "", newUrl);
      }
    }, 450);

    return () => {
      if (urlDebounceTimer.current) {
        clearTimeout(urlDebounceTimer.current);
      }
    };
  }, [viewCenter, fov, selection, loading]);

  // Handlers
  const handleSelectSelection = useCallback(
    (newSel: SkySelection | null) => {
      setSelection(newSel);
      if (newSel) {
        setPinnedPoint({ ra: newSel.ra, dec: newSel.dec });
        if (onSelect) {
          onSelect({
            ra: newSel.ra,
            dec: newSel.dec,
            fov,
            selection: newSel,
            constellation: newSel.kind === "region" ? newSel.constellation : newSel.constellation || null,
          });
        }
      } else {
        setPinnedPoint(null);
        if (onSelect) {
          onSelect({
            ra: viewCenter.ra,
            dec: viewCenter.dec,
            fov,
            selection: null,
            constellation: null,
          });
        }
      }
    },
    [fov, viewCenter, onSelect]
  );

  const handleViewCenterChange = useCallback((ra: number, dec: number) => {
    setViewCenter((prev) => {
      if (Math.abs(prev.ra - ra) < 0.05 && Math.abs(prev.dec - dec) < 0.05) {
        return prev;
      }
      return { ra, dec };
    });
  }, [setViewCenter]);

  const skyDomeRef = useRef<SkyDomeCanvasHandle | null>(null);

  const handleClearSelection = useCallback(() => {
    handleSelectSelection(null);
  }, [handleSelectSelection]);

  const handleZoomIn = useCallback(() => {
    skyDomeRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    skyDomeRef.current?.zoomOut();
  }, []);

  const handleResetView = useCallback(() => {
    skyDomeRef.current?.resetView();
    setViewCenter({ ra: 0, dec: 0 });
    setFov(60.0);
    setSelection(null);
    setPinnedPoint(null);
  }, [setViewCenter, setFov]);

  const handlePinPoint = useCallback((ra: number, dec: number) => {
    setPinnedPoint({ ra, dec });
  }, []);

  useEffect(() => {
    setFlyToHandler((ra: number, dec: number, targetFov?: number) => {
      skyDomeRef.current?.flyTo(ra, dec, targetFov);
      setViewCenter({ ra, dec });
    });
    setResetViewHandler(() => {
      handleResetView();
    });
    setZoomHandlers({
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
    });
  }, [setFlyToHandler, setResetViewHandler, setZoomHandlers, setViewCenter, handleResetView, handleZoomIn, handleZoomOut]);

  // The dock follows the selected star or region. Stars are resolved through SIMBAD (real proper motion).
  useEffect(() => {
    if (!selection) return;
    const epoch = 2026.0;
    if (selection.kind === "region") {
      setActiveTarget({
        name: selection.name, kind: "region", ra: selection.ra, dec: selection.dec, pmra: 0, pmdec: 0, epoch,
        detail: "field at the centre of the constellation (a cutout, not the whole constellation)",
      });
      return;
    }
    let cancelled = false;
    const label = selection.name || `HIP ${selection.id}`;
    (async () => {
      try {
        const r = await fetch(`/api/resolve?name=${encodeURIComponent(`HIP ${selection.id}`)}&epoch=${epoch}`);
        if (!r.ok) throw new Error("not resolved");
        const d = await r.json();
        if (cancelled) return;
        setActiveTarget({
          name: selection.name ? `${selection.name} (${d.name})` : d.name, kind: "star", ra: d.ra, dec: d.dec,
          pmra: d.pmra_cosdec ?? 0, pmdec: d.pmdec ?? 0, epoch,
          detail: d.parallax ? `${(3261.56 / d.parallax).toFixed(1)} light years away` : undefined,
        });
      } catch {
        if (cancelled) return;
        // SIMBAD could not be reached: use the catalogue position at J2000 with no proper motion, and say so
        setActiveTarget({
          name: label, kind: "star", ra: selection.ra, dec: selection.dec, pmra: 0, pmdec: 0, epoch: 2000.0,
          detail: "catalogue position (proper motion unavailable right now)",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection, setActiveTarget]);

  // ?target=Name opens the dock for that object (SIMBAD at run time), so a view can be shared or embedded
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get("target");
    if (!name) return;
    resolveActiveTarget(name)
      .then((t) => {
        setActiveTarget(t);
        skyDomeRef.current?.flyTo(t.ra, t.dec, 5.0);
      })
      .catch(() => undefined);
  }, [setActiveTarget]);

  // Play on a region opens the sound pop-up. The time-lapse for the region centre is one click away inside it.
  const handlePlayRegion = useCallback(
    (params: PlayRegionParams) => {
      setSoundRegion(params);
      if (onPlayRegion) {
        onPlayRegion(params);
      }
    },
    [onPlayRegion]
  );

  const openTimelapseForRegion = useCallback(() => {
    if (!soundRegion) return;
    skyDomeRef.current?.flyTo(soundRegion.ra, soundRegion.dec, 5.0);
    setDockOpen(true);
    setRegionPlayNotice(`Showing a cutout at the centre of ${soundRegion.name}, not the whole constellation.`);
    setSoundRegion(null);
  }, [soundRegion, setDockOpen, setRegionPlayNotice]);

  if (loading) {
    return (
      <div className="w-full h-full min-h-screen bg-ink text-cream flex flex-col items-center justify-center p-6 select-none font-mono tracking-widest text-[9px]">
        <div className="w-6 h-6 border border-cream/20 border-t-blue rounded-full animate-spin mb-4" />
        <span>INITIALIZING 3D CELESTIAL SPHERE...</span>
        <span className="text-cream/50 mt-1">LOADING REAL CATALOGUE STARS & IAU BOUNDARIES</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full min-h-screen bg-ink text-cream flex flex-col items-center justify-center p-6 select-none tracking-widest text-[9px]">
        <span className="text-red-400 mb-2">ERROR LOADING CELESTIAL DATA</span>
        <p className="text-cream/70 max-w-md text-center">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 px-3 py-1 border border-cream/30 text-cream rounded hover:bg-cream hover:text-ink transition-colors cursor-pointer"
        >
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-ink text-cream select-none">
      {/* 3D WebGL Canvas Layer with SVG Overlay */}
      <SkyDomeCanvas
        ref={skyDomeRef}
        constellations={constellations}
        stars={stars}
        boundaryPositions={boundaryPositions}
        starPositions={starPositions}
        starColors={starColors}
        namedStars={namedStars}
        constellationPolygons={constellationPolygons}
        lutBuffer={lutBuffer}
        selection={selection}
        onSelectSelection={handleSelectSelection}
        onPinPoint={handlePinPoint}
        pinnedPoint={pinnedPoint}
        isHorizon={isHorizon}
        isGrid={isGrid}
        showLabels={showLabels}
        initialRa={initialParams.ra}
        initialDec={initialParams.dec}
        initialFov={initialParams.fov}
        onFovChange={setFov}
        onViewCenterChange={handleViewCenterChange}
        onSelect={onSelect}
        isPaused={isShareCardOpen}
      >
        {/* Floating Action Capsule (Play, Info, Share) rendered inside dome container */}
        <SelectionVisualizer
          selection={selection}
          onClearSelection={handleClearSelection}
          onOpenInfo={() => setDockOpen(true)}
          onOpenShareCard={() => setIsShareCardOpen(true)}
          onPrefetchShareCard={prefetchShareCard}
          onPlayRegion={handlePlayRegion}
          currentFov={fov}
        />
      </SkyDomeCanvas>

      {/* Top-Right Scientific Toolbar & Panels */}
      <TopToolbar />

      {/* Bottom-left dock: the selected object over time (replaces the old constellation list) */}
      <TimeLapseDock
        selection={selection}
        pinnedPoint={pinnedPoint}
        onClearPinnedPoint={() => setPinnedPoint(null)}
      />

      {/* Bottom Status Bar: Location, Time, FOV, Coordinates */}
      {!embedMode && (
        <StatusBar
          initialFov={fov}
          initialRa={viewCenter.ra}
          initialDec={viewCenter.dec}
        />
      )}

      {/* Cosmic Sound pop-up (region Play) */}
      {soundRegion && (
        <SonificationDialog
          isOpen
          onClose={() => setSoundRegion(null)}
          region={{ abbr: soundRegion.abbr, name: soundRegion.name }}
          constellations={constellations}
          stars={stars}
          constellationPolygons={constellationPolygons}
          onOpenTimelapse={openTimelapseForRegion}
        />
      )}

      {/* Share Target Card Modal Dialog */}
      {isShareCardOpen && selection && (
        <ShareCardDialog
          isOpen={isShareCardOpen}
          onClose={() => setIsShareCardOpen(false)}
          selection={selection}
          constellations={constellations}
          stars={stars}
          boundaryPositions={boundaryPositions}
          constellationPolygons={constellationPolygons}
        />
      )}
    </div>
  );
}

export function SkyExplorer(props: SkyExplorerProps) {
  return (
    <ExploreProvider>
      <SkyExplorerInner {...props} />
    </ExploreProvider>
  );
}
