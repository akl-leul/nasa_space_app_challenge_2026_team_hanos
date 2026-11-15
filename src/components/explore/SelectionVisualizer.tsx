"use client";

import { useRef, useId } from "react";
import { SkySelection, PlayRegionParams } from "@/types/sky";

interface SelectionVisualizerProps {
  selection: SkySelection | null;
  onClearSelection: () => void;
  onOpenInfo: () => void;
  onOpenShareCard?: () => void;
  onPrefetchShareCard?: () => void;
  onPlayRegion?: (params: PlayRegionParams) => void;
  currentFov: number;
}

export interface CapsulePosition {
  x: number;
  y: number;
  flipped: boolean;
  visible: boolean;
}

export function SelectionVisualizer({
  selection,
  onClearSelection,
  onOpenInfo,
  onOpenShareCard,
  onPrefetchShareCard,
  onPlayRegion,
  currentFov,
}: SelectionVisualizerProps) {
  const capsuleRef = useRef<HTMLDivElement | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);

  const toolbarId = useId();

  const liveAnnouncement = !selection
    ? "No celestial target selected"
    : selection.kind === "star"
    ? `Selected star ${selection.name || `HIP ${selection.id}`}, magnitude ${selection.mag.toFixed(1)}. Info and Share available.`
    : `Selected region ${selection.name}. Play its sound, Info and Share available.`;

  // Handle Play click (region only)
  const handlePlayClick = () => {
    if (!selection || selection.kind !== "region") return;

    if (onPlayRegion) {
      onPlayRegion({
        kind: "region",
        abbr: selection.abbr,
        name: selection.name,
        ra: selection.ra,
        dec: selection.dec,
        fov: currentFov,
      });
    }
  };

  // Handle Share click -> open Share Card dialog
  const handleShareClick = () => {
    if (!selection) return;
    if (onOpenShareCard) {
      onOpenShareCard();
    }
  };

  // Keyboard navigation within the capsule toolbar
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isRegion = selection?.kind === "region";
    const buttons = isRegion
      ? [playButtonRef.current, infoButtonRef.current, shareButtonRef.current]
      : [infoButtonRef.current, shareButtonRef.current];

    const validButtons = buttons.filter(Boolean) as HTMLButtonElement[];
    const activeIndex = validButtons.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (activeIndex + 1) % validButtons.length;
      validButtons[nextIndex]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = (activeIndex - 1 + validButtons.length) % validButtons.length;
      validButtons[prevIndex]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClearSelection();
    }
  };

  const isRegion = selection?.kind === "region";
  const targetName = selection
    ? isRegion
      ? selection.name
      : selection.name || `HIP ${selection.id}`
    : "";

  return (
    <>
      {/* Screen reader live updates */}
      <div className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>

      {/* Floating Action Capsule (Dashed cream pill outline, transparent interior, round cream buttons) */}
      <div
        id="sky-action-capsule"
        ref={capsuleRef}
        role="toolbar"
        aria-label={targetName ? `Actions for ${targetName}` : "Target Actions"}
        aria-controls={toolbarId}
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 left-0 z-30 flex flex-col items-center gap-2 p-1.5 rounded-full border-2 border-dashed border-cream select-none transition-opacity duration-150 pointer-events-auto"
        style={{
          display: "none",
          willChange: "transform",
        }}
      >
        {/* 1. PLAY BUTTON (Region only) */}
        {isRegion && (
          <div className="relative group z-10">
            <button
              ref={playButtonRef}
              type="button"
              onClick={handlePlayClick}
              aria-label={`Play the sound of ${targetName}`}
              className="w-8 h-8 rounded-full bg-cream text-ink flex items-center justify-center cursor-pointer transition-transform duration-100 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
            >
              {/* Play triangle */}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="#111111" aria-hidden="true">
                <polygon points="4.5,3 13,8 4.5,13" />
              </svg>
            </button>
            {/* Tooltip */}
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block group-focus-within:block px-2 py-0.5 bg-ink border border-cream/30 text-cream rounded text-[9px] font-normal tracking-wider whitespace-nowrap pointer-events-none z-50">
              PLAY TIME-LAPSE
            </div>
          </div>
        )}

        {/* 2. INFO BUTTON (Star & Region) */}
        <div className="relative group z-10">
          <button
            ref={infoButtonRef}
            type="button"
            onClick={onOpenInfo}
            aria-label={`Info for ${targetName}`}
            className="w-8 h-8 rounded-full bg-cream text-ink flex items-center justify-center cursor-pointer transition-transform duration-100 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
          >
            {/* Elegant italic 'i' icon */}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="#111111" aria-hidden="true">
              <circle cx="8" cy="3.75" r="1.3" />
              <path d="M6.2 6.5h2.6v5.8H10v1H6v-1h1.4V7.5H6.2V6.5z" />
            </svg>
          </button>
          {/* Tooltip */}
          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block group-focus-within:block px-2 py-0.5 bg-ink border border-cream/30 text-cream rounded text-[9px] font-normal tracking-wider whitespace-nowrap pointer-events-none z-50">
            INFO
          </div>
        </div>

        {/* 3. SHARE BUTTON (Star & Region) */}
        <div className="relative group z-10">
          <button
            ref={shareButtonRef}
            type="button"
            onClick={handleShareClick}
            onPointerEnter={onPrefetchShareCard}
            onFocus={onPrefetchShareCard}
            onTouchStart={onPrefetchShareCard}
            aria-label={`Share ${targetName}`}
            className="w-8 h-8 rounded-full bg-cream text-ink flex items-center justify-center cursor-pointer transition-transform duration-100 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
          >
            {/* Curved share arrow icon */}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="#111111" aria-hidden="true">
              <path d="M9.5 2.5v2.3C5.5 5.3 3.5 8 2.5 13.5c1.5-2.2 3.5-3.3 7-3.3v2.3L14 7.4 9.5 2.5z" />
            </svg>
          </button>
          {/* Tooltip */}
          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block group-focus-within:block px-2 py-0.5 bg-ink border border-cream/30 text-cream rounded text-[9px] font-normal tracking-wider whitespace-nowrap pointer-events-none z-50">
            SHARE
          </div>
        </div>
      </div>
    </>
  );
}
