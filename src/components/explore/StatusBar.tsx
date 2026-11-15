"use client";

import { useEffect, useState } from "react";
import { formatRaSexagesimal, formatDecSexagesimal } from "@/lib/astro/coordinates";

interface StatusBarProps {
  initialFov?: number;
  initialRa?: number;
  initialDec?: number;
  initialConName?: string | null;
}

let lastUpdateTime = 0;

/**
 * High-performance direct DOM updater for status bar values.
 * Throttles writes to at most 10 times per second to prevent React re-renders during drag.
 */
export function updateStatusBarDirect(
  ra: number,
  dec: number,
  fov: number,
  conName: string | null,
  force = false
) {
  const now = performance.now();
  if (!force && now - lastUpdateTime < 100) return;
  lastUpdateTime = now;

  const coordsEl = document.getElementById("status-coords");
  if (coordsEl) {
    coordsEl.textContent = `RA ${formatRaSexagesimal(ra)} · Dec ${formatDecSexagesimal(dec)} (J2000)`;
  }

  const fovEl = document.getElementById("status-fov");
  if (fovEl) {
    fovEl.textContent = `FOV ${fov.toFixed(1)}°`;
  }

  const regionEl = document.getElementById("status-region");
  if (regionEl) {
    regionEl.textContent = conName ? `Region: ${conName}` : "";
    regionEl.style.display = conName ? "inline" : "none";
  }
}

export function StatusBar({
  initialFov = 60,
  initialRa = 0,
  initialDec = 0,
  initialConName = null,
}: StatusBarProps) {
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Addis Ababa UTC+03:00 time
      const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
      const eatDate = new Date(utcTime + 3 * 3600000);

      const y = eatDate.getFullYear();
      const m = String(eatDate.getMonth() + 1).padStart(2, "0");
      const d = String(eatDate.getDate()).padStart(2, "0");
      const hh = String(eatDate.getHours()).padStart(2, "0");
      const mm = String(eatDate.getMinutes()).padStart(2, "0");
      const ss = String(eatDate.getSeconds()).padStart(2, "0");

      setTimeStr(`${y}-${m}-${d} ${hh}:${mm}:${ss} UTC+03:00`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer
      aria-label="Celestial Status Bar"
      className="fixed bottom-0 left-0 right-0 z-30 h-7 bg-ink/95 border-t border-cream/20 text-cream px-3 flex items-center justify-between select-none tracking-wide text-[9px]"
    >
      {/* Left: Location & Catalogue notice */}
      <div className="flex items-center gap-3 truncate">
        <span>Earth, Addis Ababa (9.03° N, 38.74° E)</span>
        <span className="hidden lg:inline text-cream/50">|</span>
        <span className="hidden lg:inline text-cream/60">
          Ref star map from catalogue data (Hipparcos/Yale BSC/IAU). Not SPHEREx data.
        </span>
      </div>

      {/* Center & Right: Coordinates, FOV, Time */}
      <div className="flex items-center gap-4 text-right">
        <span id="status-region" className="text-cream/90 hidden sm:inline">
          {initialConName ? `Region: ${initialConName}` : ""}
        </span>
        <span id="status-coords">
          RA {formatRaSexagesimal(initialRa)} · Dec {formatDecSexagesimal(initialDec)} (J2000)
        </span>
        <span className="text-cream/50">|</span>
        <span id="status-fov">FOV {initialFov.toFixed(1)}°</span>
        <span className="text-cream/50 hidden md:inline">|</span>
        <span className="hidden md:inline font-mono">{timeStr}</span>
      </div>
    </footer>
  );
}
