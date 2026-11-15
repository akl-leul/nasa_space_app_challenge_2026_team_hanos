"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

/** One real SPHEREx spectral image, as returned by /api/observations. */
export interface ObservationItem {
  obs_id: string;
  plane_id: string;
  collection: string;
  release: string;
  survey_part: "wide" | "deep";
  detector: number;
  access_url: string;
  mjd_start: number | null;
  mjd_avg?: number;
  date_utc?: string;
  month_label?: string;
  decimal_year?: number;
  exposure_s: number | null;
  band_range_um: [number, number] | null;
  resolving_power: number | null;
  footprint_covers_target: boolean | null;
  enriched: boolean;
  wavelength_um?: number;
  bandwidth_um?: number;
  on_detector?: boolean;
  distance_to_edge_px?: number;
  psf_fwhm_arcsec?: number | null;
  flag_counts?: Record<string, number>;
}

/** The object the time-lapse dock follows: a star, a constellation centre, a resolved name or typed coordinates. */
export interface ActiveTarget {
  name: string;
  kind: "star" | "region" | "object" | "coordinates";
  ra: number;          // position at `epoch`
  dec: number;
  pmra: number;        // mas/yr, includes cos(dec)
  pmdec: number;
  epoch: number;
  detail?: string;     // one plain line, for example "brown dwarf, 7.3 light years"
}

export type ActivePanelType =
  | "search"
  | "targets"
  | "observations"
  | "timelapse"
  | "compare"
  | "change"
  | "spectra"
  | "overlays"
  | "view"
  | null;

interface ExploreContextType {
  activePanel: ActivePanelType;
  setActivePanel: (panel: ActivePanelType) => void;
  viewCenter: { ra: number; dec: number };
  setViewCenter: React.Dispatch<React.SetStateAction<{ ra: number; dec: number }>>;
  fov: number;
  setFov: React.Dispatch<React.SetStateAction<number>>;
  flyTo: (ra: number, dec: number, targetFov?: number) => void;
  setFlyToHandler: (handler: (ra: number, dec: number, targetFov?: number) => void) => void;
  observations: ObservationItem[];
  setObservations: (obs: ObservationItem[]) => void;
  isLoadingObs: boolean;
  setIsLoadingObs: (loading: boolean) => void;
  currentFrameIdx: number;
  setCurrentFrameIdx: (idx: number | ((prev: number) => number)) => void;
  selectedPair: [number, number];
  setSelectedPair: (pair: [number, number]) => void;
  gaiaOverlay: boolean;
  setGaiaOverlay: (v: boolean) => void;
  wiseOverlay: boolean;
  setWiseOverlay: (v: boolean) => void;
  isExpanded: boolean;
  setIsExpanded: (v: boolean) => void;
  embedMode: boolean;
  // View options from old TopControls
  isHorizon: boolean;
  setIsHorizon: (v: boolean | ((p: boolean) => boolean)) => void;
  isGrid: boolean;
  setIsGrid: (v: boolean | ((p: boolean) => boolean)) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean | ((p: boolean) => boolean)) => void;
  resetView: () => void;
  setResetViewHandler: (handler: () => void) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoomHandlers: (handlers: { zoomIn: () => void; zoomOut: () => void }) => void;
  regionPlayNotice: string | null;
  setRegionPlayNotice: (notice: string | null) => void;
  activeTarget: ActiveTarget | null;
  setActiveTarget: (t: ActiveTarget | null) => void;
  trackDetector: number;
  setTrackDetector: (d: number) => void;
  dockOpen: boolean;
  setDockOpen: (v: boolean) => void;
}

const ExploreContext = createContext<ExploreContextType | null>(null);

export function ExploreProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<ActivePanelType>(null);
  const [viewCenter, setViewCenter] = useState<{ ra: number; dec: number }>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qRa = parseFloat(params.get("ra") || "");
      const qDec = parseFloat(params.get("dec") || "");
      if (!isNaN(qRa) && qRa >= 0 && qRa <= 360 && !isNaN(qDec) && qDec >= -90 && qDec <= 90) {
        return { ra: qRa, dec: qDec };
      }
    }
    return { ra: 10.7, dec: 41.3 };
  });
  const [fov, setFov] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qFov = parseFloat(params.get("fov") || "");
      if (!isNaN(qFov) && qFov >= 5 && qFov <= 100) {
        return qFov;
      }
    }
    return 60.0;
  });
  const [observations, setObservations] = useState<ObservationItem[]>([]);
  const [isLoadingObs, setIsLoadingObs] = useState<boolean>(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number>(0);
  const [selectedPair, setSelectedPair] = useState<[number, number]>([0, 1]);
  const [gaiaOverlay, setGaiaOverlay] = useState<boolean>(false);
  const [wiseOverlay, setWiseOverlay] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [embedMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("embed") === "1";
    }
    return false;
  });
  const [regionPlayNotice, setRegionPlayNotice] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState<ActiveTarget | null>(null);
  const [trackDetector, setTrackDetector] = useState<number>(4);
  const [dockOpen, setDockOpen] = useState<boolean>(true);

  // View state
  const [isHorizon, setIsHorizon] = useState<boolean>(false);
  const [isGrid, setIsGrid] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(true);

  const [flyToFn, setFlyToFn] = useState<((ra: number, dec: number, fov?: number) => void) | null>(null);
  const [resetViewFn, setResetViewFn] = useState<(() => void) | null>(null);
  const [zoomFns, setZoomFns] = useState<{ zoomIn: () => void; zoomOut: () => void } | null>(null);

  const flyTo = useCallback((ra: number, dec: number, targetFov?: number) => {
    if (flyToFn) {
      flyToFn(ra, dec, targetFov);
    }
  }, [flyToFn]);

  const resetView = useCallback(() => {
    if (resetViewFn) {
      resetViewFn();
    }
  }, [resetViewFn]);

  const zoomIn = useCallback(() => {
    if (zoomFns) zoomFns.zoomIn();
  }, [zoomFns]);

  const zoomOut = useCallback(() => {
    if (zoomFns) zoomFns.zoomOut();
  }, [zoomFns]);

  const setFlyToHandler = useCallback((handler: (ra: number, dec: number, targetFov?: number) => void) => {
    setFlyToFn(() => handler);
  }, []);

  const setResetViewHandler = useCallback((handler: () => void) => {
    setResetViewFn(() => handler);
  }, []);

  const setZoomHandlers = useCallback((handlers: { zoomIn: () => void; zoomOut: () => void }) => {
    setZoomFns(handlers);
  }, []);

  return (
    <ExploreContext.Provider
      value={{
        activePanel,
        setActivePanel,
        viewCenter,
        setViewCenter,
        fov,
        setFov,
        flyTo,
        setFlyToHandler,
        observations,
        setObservations,
        isLoadingObs,
        setIsLoadingObs,
        currentFrameIdx,
        setCurrentFrameIdx,
        selectedPair,
        setSelectedPair,
        gaiaOverlay,
        setGaiaOverlay,
        wiseOverlay,
        setWiseOverlay,
        isExpanded,
        setIsExpanded,
        embedMode,
        isHorizon,
        setIsHorizon,
        isGrid,
        setIsGrid,
        showLabels,
        setShowLabels,
        resetView,
        setResetViewHandler,
        zoomIn,
        zoomOut,
        setZoomHandlers,
        regionPlayNotice,
        setRegionPlayNotice,
        activeTarget,
        setActiveTarget,
        trackDetector,
        setTrackDetector,
        dockOpen,
        setDockOpen
      }}
    >
      {children}
    </ExploreContext.Provider>
  );
}

export function useExplore(): ExploreContextType {
  const ctx = useContext(ExploreContext);
  if (!ctx) {
    throw new Error("useExplore must be used within an ExploreProvider");
  }
  return ctx;
}
