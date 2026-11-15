"use client";

import React from "react";
import { useExplore } from "../ExploreContext";

export function ViewPanel() {
  const {
    isHorizon,
    setIsHorizon,
    isGrid,
    setIsGrid,
    showLabels,
    setShowLabels,
    resetView,
    zoomIn,
    zoomOut,
    fov
  } = useExplore();

  return (
    <div className="space-y-4">
      {/* Toggles */}
      <div className="space-y-2">
        <div className="text-cream/50 uppercase tracking-wider text-[8px]">Display Layers</div>
        <div className="grid grid-cols-3 gap-1.5 text-[8px]">
          <button
            type="button"
            onClick={() => setIsHorizon((p) => !p)}
            className={`py-1.5 px-2 rounded border uppercase tracking-wider transition-colors text-center ${
              isHorizon
                ? "bg-blue text-cream border-blue"
                : "border-cream/20 text-cream/70 hover:border-cream/40 hover:text-cream"
            }`}
          >
            Horizon {isHorizon ? "ON" : "OFF"}
          </button>

          <button
            type="button"
            onClick={() => setIsGrid((p) => !p)}
            className={`py-1.5 px-2 rounded border uppercase tracking-wider transition-colors text-center ${
              isGrid
                ? "bg-blue text-cream border-blue"
                : "border-cream/20 text-cream/70 hover:border-cream/40 hover:text-cream"
            }`}
          >
            Grid {isGrid ? "ON" : "OFF"}
          </button>

          <button
            type="button"
            onClick={() => setShowLabels((p) => !p)}
            className={`py-1.5 px-2 rounded border uppercase tracking-wider transition-colors text-center ${
              showLabels
                ? "bg-blue text-cream border-blue"
                : "border-cream/20 text-cream/70 hover:border-cream/40 hover:text-cream"
            }`}
          >
            Labels {showLabels ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Zoom and Reset Controls */}
      <div className="pt-2 border-t border-cream/10 space-y-2">
        <div className="text-cream/50 uppercase tracking-wider text-[8px]">Camera Navigation</div>
        <div className="grid grid-cols-3 gap-1.5 text-[8px]">
          <button
            type="button"
            onClick={zoomIn}
            disabled={fov <= 5.0}
            className="py-1.5 px-2 border border-cream/20 hover:border-cream/50 text-cream/80 hover:text-cream rounded uppercase tracking-wider text-center transition-colors disabled:opacity-30"
          >
            Zoom In (+)
          </button>

          <button
            type="button"
            onClick={zoomOut}
            disabled={fov >= 100.0}
            className="py-1.5 px-2 border border-cream/20 hover:border-cream/50 text-cream/80 hover:text-cream rounded uppercase tracking-wider text-center transition-colors disabled:opacity-30"
          >
            Zoom Out (−)
          </button>

          <button
            type="button"
            onClick={resetView}
            className="py-1.5 px-2 border border-cream/20 hover:border-cream/50 text-cream/80 hover:text-cream rounded uppercase tracking-wider text-center transition-colors"
          >
            Reset (0)
          </button>
        </div>
      </div>

      {/* Embed Mode Note */}
      <div className="pt-2 border-t border-cream/10 p-2 bg-cream/5 border border-cream/15 rounded text-[8px] font-mono text-cream/70 leading-relaxed">
        <div className="text-cream uppercase tracking-wider font-normal mb-0.5">Embed Mode (`?embed=1`)</div>
        When embedding this explorer into an external iframe, adding <span className="text-blue">?embed=1</span> automatically hides all chrome headers, toolbar icons, and bottom bars, leaving only the interactive 3D sky dome.
      </div>
    </div>
  );
}
