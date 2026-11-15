"use client";

import React, { useEffect, useRef } from "react";
import { useExplore, ActivePanelType } from "./ExploreContext";
import { SearchPanel } from "./panels/SearchPanel";
import { TargetsPanel } from "./panels/TargetsPanel";
import { ObservationsPanel } from "./panels/ObservationsPanel";
import { ComparePanel } from "./panels/ComparePanel";
import { ChangePanel } from "./panels/ChangePanel";
import { SpectraPanel } from "./panels/SpectraPanel";
import { OverlaysPanel } from "./panels/OverlaysPanel";
import { ViewPanel } from "./panels/ViewPanel";

interface ToolbarItem {
  id: ActivePanelType;
  label: string;
  icon: React.ReactNode;
  canExpand?: boolean;
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  {
    id: "search",
    label: "Search",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
    )
  },
  {
    id: "targets",
    label: "Targets",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    )
  },
  {
    id: "observations",
    label: "Observations",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    )
  },
  {
    id: "timelapse",
    label: "Time-lapse",
    canExpand: true,
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <polygon points="10 8 15 12 10 16 10 8" fill="currentColor" stroke="none" />
      </svg>
    )
  },
  {
    id: "compare",
    label: "Compare",
    canExpand: true,
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="12" y1="3" x2="12" y2="21" />
        <path d="M8 8l-2 4 2 4" />
        <path d="M16 8l2 4-2 4" />
      </svg>
    )
  },
  {
    id: "change",
    label: "Change",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    )
  },
  {
    id: "spectra",
    label: "Spectra",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M2 12c3-4 5-4 8 0s5 4 8 0 4-4 4-4" />
        <line x1="3" y1="20" x2="21" y2="20" />
        <line x1="3" y1="4" x2="3" y2="20" />
      </svg>
    )
  },
  {
    id: "overlays",
    label: "Overlays",
    canExpand: true,
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8" cy="8" r="2" />
        <circle cx="16" cy="14" r="2" />
        <circle cx="12" cy="16" r="1.5" />
      </svg>
    )
  }
];

const VIEW_ITEM: ToolbarItem = {
  id: "view",
  label: "View",
  icon: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    </svg>
  )
};

export function TopToolbar() {
  const { activePanel, setActivePanel, isExpanded, setIsExpanded, embedMode, dockOpen, setDockOpen } = useExplore();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc closes open panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activePanel !== null) {
        setActivePanel(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePanel, setActivePanel]);

  if (embedMode) return null;

  const currentItem = [...TOOLBAR_ITEMS, VIEW_ITEM].find((item) => item.id === activePanel);

  return (
    <>
      {/* Top-Right Toolbar Icon Row */}
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Scientific Explorer Tools"
        className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5 p-1 bg-ink/90 border border-cream/20 rounded-full select-none"
      >
        {TOOLBAR_ITEMS.map((item) => {
          const isActive = item.id === "timelapse" ? dockOpen : activePanel === item.id;
          return (
            <div key={item.id} className="relative group">
              <button
                type="button"
                onClick={() => (item.id === "timelapse" ? setDockOpen(!dockOpen) : setActivePanel(isActive ? null : item.id))}
                aria-label={item.label}
                aria-expanded={isActive}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-blue ${
                  isActive
                    ? "bg-blue text-cream border border-blue"
                    : "bg-ink border border-cream/20 text-cream/70 hover:text-cream hover:border-cream/50"
                }`}
              >
                {item.icon}
              </button>

              {/* Tooltip on hover/focus */}
              <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-40 bg-ink border border-cream/25 rounded px-2 py-0.5 text-cream text-[9px] uppercase tracking-wider whitespace-nowrap shadow-none">
                {item.label}
              </div>
            </div>
          );
        })}

        {/* Divider */}
        <div className="w-[1px] h-5 bg-cream/20 mx-0.5" />

        {/* View Icon */}
        <div className="relative group">
          <button
            type="button"
            onClick={() => setActivePanel(activePanel === "view" ? null : "view")}
            aria-label={VIEW_ITEM.label}
            aria-expanded={activePanel === "view"}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-blue ${
              activePanel === "view"
                ? "bg-blue text-cream border border-blue"
                : "bg-ink border border-cream/20 text-cream/70 hover:text-cream hover:border-cream/50"
            }`}
          >
            {VIEW_ITEM.icon}
          </button>
          <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-40 bg-ink border border-cream/25 rounded px-2 py-0.5 text-cream text-[9px] uppercase tracking-wider whitespace-nowrap">
            {VIEW_ITEM.label}
          </div>
        </div>
      </div>

      {/* Docked Panel Container */}
      {activePanel && (
        <div
          ref={panelRef}
          role="region"
          aria-label={`${currentItem?.label || "Tool"} Panel`}
          className={`absolute top-14 right-2.5 z-30 bg-ink/95 border border-cream/20 rounded p-3 text-[9px] font-sans text-cream/90 transition-all ${
            isExpanded
              ? "w-[90vw] md:w-[60vw] max-h-[85vh] overflow-y-auto"
              : "w-[92vw] sm:w-[350px] max-h-[75vh] overflow-y-auto"
          }`}
        >
          {/* Panel Header */}
          <div className="flex justify-between items-center pb-2.5 mb-3 border-b border-cream/15">
            <div className="uppercase tracking-widest text-cream font-normal flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue inline-block" />
              {currentItem?.label}
            </div>

            <div className="flex items-center gap-1.5">
              {currentItem?.canExpand && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="px-2 py-0.5 border border-cream/20 hover:border-cream/50 text-cream/70 hover:text-cream rounded uppercase text-[8px] transition-colors"
                  title={isExpanded ? "Collapse panel width" : "Expand panel to 60% viewport width"}
                >
                  {isExpanded ? "Collapse" : "Expand"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                className="w-6 h-6 border border-cream/20 hover:border-cream/50 text-cream/70 hover:text-cream rounded flex items-center justify-center uppercase text-[9px] transition-colors"
                title="Close panel (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Panel Body */}
          <div className="space-y-3">
            {activePanel === "search" && <SearchPanel />}
            {activePanel === "targets" && <TargetsPanel />}
            {activePanel === "observations" && <ObservationsPanel />}
            {activePanel === "compare" && <ComparePanel />}
            {activePanel === "change" && <ChangePanel />}
            {activePanel === "spectra" && <SpectraPanel />}
            {activePanel === "overlays" && <OverlaysPanel />}
            {activePanel === "view" && <ViewPanel />}
          </div>
        </div>
      )}
    </>
  );
}
