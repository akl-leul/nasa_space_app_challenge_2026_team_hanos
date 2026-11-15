"use client";

import React, { useState } from "react";
import { useExplore } from "../ExploreContext";
import { resolveActiveTarget } from "@/lib/explore/resolveTarget";

interface MovingMatch {
  predicted_ra: number;
  predicted_dec: number;
  start_utc?: string;
  mjd_start?: number;
  detector?: number;
  v_mag?: number | null;
  label?: string;
  [key: string]: unknown;
}

export function SearchPanel() {
  const { viewCenter, fov, setFov, flyTo, setActiveTarget, setDockOpen } = useExplore();

  const [query, setQuery] = useState("");
  const [ssObjName, setSsObjName] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [movingResults, setMovingResults] = useState<MovingMatch[]>([]);
  const [isSearchingMoving, setIsSearchingMoving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Direct coordinate or SIMBAD target resolution
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsResolving(true);
    setSearchMsg(null);
    try {
      // SIMBAD (or typed coordinates), moved to 2026.0 with the real proper motion; the dock then follows it over time
      const t = await resolveActiveTarget(query);
      setActiveTarget(t);
      setDockOpen(true);
      flyTo(t.ra, t.dec, 5.0);
      setSearchMsg(`Found ${t.name} (RA ${t.ra.toFixed(4)}°, Dec ${t.dec.toFixed(4)}° on 2026.0). The time-lapse is at the bottom left.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSearchMsg(`Could not find that: ${msg}`);
    } finally {
      setIsResolving(false);
    }
  };

  // Solar-system object search via IRSA MOST
  const handleMovingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ssObjName.trim()) return;

    setIsSearchingMoving(true);
    setSearchMsg(null);
    try {
      const resp = await fetch(`/api/moving?name=${encodeURIComponent(ssObjName.trim())}`);
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 404) {
        // Not a planet, asteroid or comet. Stars and brown dwarfs (Epsilon Indi B) are found by name through SIMBAD instead.
        const t = await resolveActiveTarget(ssObjName).catch(() => null);
        if (t) {
          setMovingResults([]);
          setActiveTarget(t);
          setDockOpen(true);
          flyTo(t.ra, t.dec, 5.0);
          setSearchMsg(`${t.name} is not a solar-system object, so it is not in the moving-object search. It is in the sky catalogue, so it is opened in the time-lapse at the bottom left.`);
          return;
        }
        throw new Error(`'${ssObjName}' was found neither as a solar-system object (IRSA MOST) nor as a star or galaxy (SIMBAD). Check the spelling.`);
      }
      if (!resp.ok) throw new Error(data.detail || "The moving-object search did not answer. Try again in a moment.");
      const matches: MovingMatch[] = (data.matches || []).sort((a: MovingMatch, b: MovingMatch) => (a.mjd_start ?? 0) - (b.mjd_start ?? 0));
      setMovingResults(matches);
      setSearchMsg(
        matches.length === 0
          ? `The archive answered: no SPHEREx frame contains ${ssObjName} between May 2025 and Dec 2026.`
          : `${matches.length} real SPHEREx frames contain ${ssObjName} (predicted by JPL Horizons through IRSA MOST).`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSearchMsg(`Error: ${msg}`);
    } finally {
      setIsSearchingMoving(false);
    }
  };

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/explore?ra=${viewCenter.ra.toFixed(4)}&dec=${viewCenter.dec.toFixed(4)}&fov=${fov.toFixed(1)}`
    : "";

  const embedSnippet = `<iframe src="${shareUrl}&embed=1" width="800" height="600" frameborder="0" allowfullscreen></iframe>`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Target or Coordinate Search */}
      <div>
        <div className="text-cream/50 uppercase tracking-wider mb-1.5">Celestial Coordinates or Target</div>
        <form onSubmit={handleSearch} className="space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Barnard's star, WISE 0855, or 08:55:10 -07:14:42"
            className="w-full bg-ink border border-cream/20 rounded px-2.5 py-1.5 text-cream placeholder:text-cream/30 focus:border-blue focus:outline-none"
          />
          <button
            type="submit"
            disabled={isResolving}
            className="w-full py-1.5 bg-blue text-cream rounded tracking-wider uppercase hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isResolving ? "Resolving via SIMBAD..." : "Go to Target"}
          </button>
        </form>
      </div>

      {/* Solar-System Object Search (IRSA MOST) */}
      <div className="pt-2 border-t border-cream/10">
        <div className="text-cream/50 uppercase tracking-wider mb-1.5">Planet, asteroid or comet (IRSA MOST)</div>
        <form onSubmit={handleMovingSearch} className="space-y-2">
          <input
            type="text"
            value={ssObjName}
            onChange={(e) => setSsObjName(e.target.value)}
            placeholder="e.g. Pallas, Ceres, Apophis, 29P"
            className="w-full bg-ink border border-cream/20 rounded px-2.5 py-1.5 text-cream placeholder:text-cream/30 focus:border-blue focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSearchingMoving}
            className="w-full py-1.5 border border-cream/25 text-cream/80 hover:text-cream hover:border-cream/50 rounded tracking-wider uppercase transition-colors disabled:opacity-50"
          >
            {isSearchingMoving ? "Asking the archive..." : "Search SPHEREx frames"}
          </button>
        </form>

        {movingResults.length > 0 && (
          <div className="mt-2 max-h-32 overflow-y-auto space-y-1.5">
            {movingResults.map((m, idx) => (
              <div
                key={idx}
                onClick={() => {
                  flyTo(m.predicted_ra, m.predicted_dec, 5.0);
                  setActiveTarget({
                    name: `${ssObjName.trim()} (${String(m.start_utc ?? "").slice(0, 10)})`,
                    kind: "object",
                    ra: m.predicted_ra,
                    dec: m.predicted_dec,
                    epoch: 2026.0,
                    pmra: 0,
                    pmdec: 0,
                    detail: `Predicted solar-system object position (JPL Horizons via IRSA MOST) in SPHEREx exposure on ${String(m.start_utc ?? "").slice(0, 10)}.`
                  });
                  setDockOpen(true);
                }}
                className="p-1.5 bg-cream/5 hover:bg-blue/15 border border-cream/10 rounded cursor-pointer transition-colors"
              >
                <div className="flex justify-between">
                  <span className="text-cream font-mono">RA {m.predicted_ra.toFixed(4)}°, Dec {m.predicted_dec.toFixed(4)}°</span>
                  <span className="text-blue uppercase tracking-wider">Track & Fly</span>
                </div>
                <div className="text-cream/50">
                  {String(m.start_utc ?? "").slice(0, 16)} UTC · detector {String(m.detector ?? "")}
                  {m.v_mag != null ? ` · magnitude ${m.v_mag}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Field of View / Cutout Size */}
      <div className="pt-2 border-t border-cream/10">
        <div className="flex justify-between items-center mb-1">
          <span className="text-cream/50 uppercase tracking-wider">Field of View</span>
          <span className="font-mono text-cream">{fov.toFixed(1)}°</span>
        </div>
        <input
          type="range"
          min="5.0"
          max="100.0"
          step="1.0"
          value={fov}
          onChange={(e) => setFov(parseFloat(e.target.value))}
          className="w-full accent-blue cursor-pointer"
        />
        <div className="text-cream/40 leading-relaxed mt-1">
          Note: Larger fields of view track faster-moving sources at the cost of longer data transfer times.
        </div>
      </div>

      {/* Shareable Link & Embed */}
      <div className="pt-2 border-t border-cream/10 space-y-2">
        <div className="text-cream/50 uppercase tracking-wider">Share and Embed</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="py-1.5 px-2 border border-cream/20 text-cream/70 hover:text-cream hover:border-cream/40 rounded uppercase tracking-wider text-center transition-colors"
          >
            {copiedLink ? "Link Copied" : "Copy View Link"}
          </button>
          <button
            type="button"
            onClick={handleCopyEmbed}
            className="py-1.5 px-2 border border-cream/20 text-cream/70 hover:text-cream hover:border-cream/40 rounded uppercase tracking-wider text-center transition-colors"
          >
            {copiedEmbed ? "Snippet Copied" : "Copy Embed Code"}
          </button>
        </div>
      </div>

      {searchMsg && (
        <div className="p-2 bg-cream/5 border border-cream/10 rounded text-cream/80 break-words">
          {searchMsg}
        </div>
      )}
    </div>
  );
}
