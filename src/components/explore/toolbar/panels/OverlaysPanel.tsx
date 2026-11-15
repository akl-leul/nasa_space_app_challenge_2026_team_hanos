"use client";

import React, { useState, useEffect } from "react";
import { useExplore } from "../ExploreContext";

interface ReleaseItem {
  collection: string;
  label: string;
  surveys: string;
  citation: string;
  searchable_by_default?: boolean;
}

interface CatalogueResult {
  ok: boolean;
  count: number;
  error?: string;
  credit?: string;
  note?: string;
}

interface OverlaysData {
  gaia: CatalogueResult;
  wise: CatalogueResult;
}

interface ContextInfo {
  note?: string;
  credit?: string;
  [key: string]: unknown;
}

export function OverlaysPanel() {
  const {
    viewCenter,
    activeTarget,
    gaiaOverlay,
    setGaiaOverlay,
    wiseOverlay,
    setWiseOverlay
  } = useExplore();

  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [ack, setAck] = useState<string | null>(null);
  const [overlayErr, setOverlayErr] = useState<string | null>(null);
  const [overlaysData, setOverlaysData] = useState<OverlaysData | null>(null);
  const [dssContext, setDssContext] = useState<ContextInfo | null>(null);
  const [neossatContext, setNeossatContext] = useState<ContextInfo | null>(null);

  const ra = activeTarget?.ra ?? viewCenter.ra;
  const dec = activeTarget?.dec ?? viewCenter.dec;

  useEffect(() => {
    fetch("/api/releases")
      .then((r) => r.json())
      .then((d) => {
        setReleases((d.releases || []).filter((x: ReleaseItem & { is_cube?: boolean }) => x.collection))
        setAck(d.acknowledgement ?? null);
      })
      .catch(() => {});
  }, []);

  const posKey = `${ra}|${dec}|${activeTarget?.epoch}`;
  const [prevPosKey, setPrevPosKey] = useState(posKey);
  if (prevPosKey !== posKey) {
    setPrevPosKey(posKey);
    setOverlaysData(null);
    setOverlayErr(null);
    setDssContext(null);
    setNeossatContext(null);
  }

  useEffect(() => {
    let live = true;
    fetch(`/api/overlays?ra=${ra}&dec=${dec}&size=0.1&epoch=${activeTarget?.epoch ?? 2026}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => live && (ok ? setOverlaysData(d) : setOverlayErr(d.detail || "The catalogues are busy.")))
      .catch(() => live && setOverlayErr("The catalogues did not answer."));
    fetch(`/api/context/dss?ra=${ra}&dec=${dec}&size=0.05`)
      .then((r) => r.json())
      .then((d) => live && setDssContext(d))
      .catch(() => {});
    fetch(`/api/context/neossat?ra=${ra}&dec=${dec}`)
      .then((r) => r.json())
      .then((d) => live && setNeossatContext(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ra, dec, activeTarget?.epoch]);

  return (
    <div className="space-y-4">
      {/* Overlay Toggles */}
      <div className="space-y-2">
        <div className="text-cream/50 uppercase tracking-wider ">Catalogue Overlays</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setGaiaOverlay(!gaiaOverlay)}
            className={`py-1.5 px-2 rounded border uppercase  tracking-wider transition-colors text-center ${
              gaiaOverlay
                ? "bg-blue text-cream border-blue"
                : "border-cream/20 text-cream/70 hover:border-cream/40 hover:text-cream"
            }`}
          >
            Gaia DR3 {gaiaOverlay ? "on" : "off"} ({overlaysData ? overlaysData.gaia.count : "..."})
          </button>
          <button
            type="button"
            onClick={() => setWiseOverlay(!wiseOverlay)}
            className={`py-1.5 px-2 rounded border uppercase  tracking-wider transition-colors text-center ${
              wiseOverlay
                ? "bg-blue text-cream border-blue"
                : "border-cream/20 text-cream/70 hover:border-cream/40 hover:text-cream"
            }`}
          >
            AllWISE {wiseOverlay ? "on" : "off"} ({overlaysData ? overlaysData.wise.count : "..."})
          </button>
        </div>
      </div>

      {overlayErr && (
        <div role="alert" className="p-2 border border-blue rounded text-cream leading-relaxed">
          {overlayErr}
        </div>
      )}
      {overlaysData && (!overlaysData.gaia.ok || !overlaysData.wise.ok) && (
        <div role="alert" className="p-2 border border-blue rounded text-cream leading-relaxed">
          {!overlaysData.gaia.ok && `Gaia did not answer: ${overlaysData.gaia.error}. `}
          {!overlaysData.wise.ok && `AllWISE did not answer: ${overlaysData.wise.error}.`}
        </div>
      )}

      {/* SPHEREx releases, read from IRSA */}
      <div className="pt-2 border-t border-cream/10 space-y-2">
        <div className="text-cream/50 uppercase tracking-wider">SPHEREx releases (read from IRSA)</div>
        <div className="space-y-1.5">
          {releases.map((rel) => (
            <div key={rel.collection} className="p-2 bg-cream/5 border border-cream/10 rounded font-mono">
              <div className="flex justify-between text-cream">
                <span>{rel.label}</span>
                <span className="text-cream/50">{rel.searchable_by_default ? "used" : "not used for time series"}</span>
              </div>
              <div className="text-cream/50 mt-0.5">{rel.surveys}</div>
              <div className="text-cream/70 mt-0.5">{rel.citation}</div>
            </div>
          ))}
        </div>
        <div className="text-cream/50 leading-relaxed">
          DR1 and QR3 share one calibration across Surveys 1 to 4, so they form one time series. QR2 is retired and left out.
        </div>
      </div>

      {/* Optional Context Layers (DSS & NEOSSat) */}
      <div className="pt-2 border-t border-cream/10 space-y-2">
        <div className="text-cream/50 uppercase tracking-wider ">Context Archives (Optical)</div>
        {dssContext && (
          <div className="p-2 bg-cream/5 border border-cream/10 rounded font-mono  text-cream/70">
            <div className="text-cream font-normal">Digitized Sky Survey (DSS2-red)</div>
            <div className="text-cream/40  mt-0.5">{dssContext.note}</div>
            <div className="text-cream/50  mt-0.5">{dssContext.credit}</div>
          </div>
        )}
        {neossatContext && (
          <div className="p-2 bg-cream/5 border border-cream/10 rounded font-mono  text-cream/70">
            <div className="text-cream font-normal">NEOSSat Canadian Space Archive</div>
            <div className="text-cream/40  mt-0.5">{neossatContext.note}</div>
            <div className="text-cream/50  mt-0.5">{neossatContext.credit}</div>
          </div>
        )}
        <div className="flex justify-between ">
          <a
            href="https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/ssois/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cream underline underline-offset-2 uppercase"
          >
            CADC SSOIS Portal ↗
          </a>
        </div>
      </div>

      {/* Data and Credits Section */}
      <div className="pt-2 border-t border-cream/10 space-y-1.5  text-cream/60 leading-relaxed font-mono">
        <div className="text-cream uppercase tracking-wider">Data credits</div>
        {ack && <div>{ack}</div>}
        <div>• SPHEREx data served by NASA/IPAC IRSA (DOI 10.26131/IRSA678 for images, 10.26131/IRSA679 for the all-sky cube).</div>
        <div>• ESA Gaia mission, Data Release 3 (positions and proper motions).</div>
        <div>• AllWISE source catalogue (NASA/IPAC IRSA).</div>
        <div>• SIMBAD, CDS Strasbourg (names, positions and proper motions).</div>
        <div>• Digitized Sky Survey (STScI, Caltech, AAO) through NASA SkyView; NEOSSat through the Canadian Astronomy Data Centre.</div>
        <div>• Open-source software: Astropy, Astroquery, reproject, hpgeom, NumPy, SciPy.</div>
      </div>
    </div>
  );
}
