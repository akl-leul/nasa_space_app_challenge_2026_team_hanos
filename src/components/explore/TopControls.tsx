"use client";

interface TopControlsProps {
  isHorizon: boolean;
  onToggleHorizon: () => void;
  isGrid: boolean;
  onToggleGrid: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  onResetView: () => void;
  fov?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export function TopControls({
  isHorizon,
  onToggleHorizon,
  isGrid,
  onToggleGrid,
  showLabels,
  onToggleLabels,
  onResetView,
  fov,
  onZoomIn,
  onZoomOut,
}: TopControlsProps) {
  return (
    <div
      className="absolute top-2.5 right-2.5 z-30 flex flex-wrap justify-end items-center gap-1 sm:gap-2 max-w-[calc(100vw-140px)] sm:max-w-none select-none text-[8px] sm:text-[9px]"
      role="toolbar"
      aria-label="Sky Dome View Controls"
    >
      <button
        type="button"
        onClick={onToggleHorizon}
        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border transition-colors focus-visible:outline-2 focus-visible:outline-blue ${
          isHorizon
            ? "border-blue bg-blue/20 text-cream"
            : "border-cream/25 bg-ink/85 text-cream/70 hover:text-cream hover:border-cream/50"
        }`}
        aria-pressed={isHorizon}
        title="Toggle between Equatorial (RA/Dec) and Horizon (Alt/Az) coordinates"
      >
        HORIZON {isHorizon ? "ON" : "OFF"}
      </button>

      <button
        type="button"
        onClick={onToggleGrid}
        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border transition-colors focus-visible:outline-2 focus-visible:outline-blue ${
          isGrid
            ? "border-blue bg-blue/20 text-cream"
            : "border-cream/25 bg-ink/85 text-cream/70 hover:text-cream hover:border-cream/50"
        }`}
        aria-pressed={isGrid}
        title="Toggle celestial RA/Dec coordinate grid"
      >
        GRID {isGrid ? "ON" : "OFF"}
      </button>

      <button
        type="button"
        onClick={onToggleLabels}
        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border transition-colors focus-visible:outline-2 focus-visible:outline-blue ${
          showLabels
            ? "border-blue bg-blue/20 text-cream"
            : "border-cream/25 bg-ink/85 text-cream/70 hover:text-cream hover:border-cream/50"
        }`}
        aria-pressed={showLabels}
        title="Toggle constellation and star names"
      >
        LABELS {showLabels ? "ON" : "OFF"}
      </button>

      <button
        type="button"
        onClick={onResetView}
        className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border border-cream/25 bg-ink/85 text-cream/70 hover:text-cream hover:border-cream/50 transition-colors focus-visible:outline-2 focus-visible:outline-blue min-h-[24px]"
        title="Reset view to default FOV 60° (0 key)"
      >
        RESET VIEW
      </button>

      {/* Zoom In & Zoom Out Buttons (>= 24x24px, 9px regular weight, visible focus) */}
      <div className="flex items-center gap-1" role="group" aria-label="Zoom controls">
        <button
          type="button"
          onClick={onZoomIn}
          disabled={fov !== undefined && fov <= 5.0}
          aria-label="Zoom in"
          title="Zoom in (+ or =)"
          className="min-w-[24px] min-h-[24px] h-6 px-1.5 rounded border border-cream/25 bg-ink/85 text-cream/70 hover:text-cream hover:border-cream/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-blue flex items-center justify-center font-normal text-[9px]"
        >
          +
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          disabled={fov !== undefined && fov >= 100.0}
          aria-label="Zoom out"
          title="Zoom out (-)"
          className="min-w-[24px] min-h-[24px] h-6 px-1.5 rounded border border-cream/25 bg-ink/85 text-cream/70 hover:text-cream hover:border-cream/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-blue flex items-center justify-center font-normal text-[9px]"
        >
          −
        </button>
      </div>
    </div>
  );
}
