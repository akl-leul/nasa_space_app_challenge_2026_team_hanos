"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { ARCHIVED_AUDIOS, type ArchivedAudioRecord } from "@/config/archivedAudios";
import { ArrowUpRight, Pause, Play } from "lucide-react";
export function SonificationArchive() {
  const [activeRecord, setActiveRecord] = useState<ArchivedAudioRecord>(() => {
    return ARCHIVED_AUDIOS.find((a) => a.id === "Ori") || ARCHIVED_AUDIOS[0];
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"all" | "featured" | "zodiac" | "northern" | "southern">("featured");
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Filtered constellation items
  const filteredAudios = useMemo(() => {
    let list = ARCHIVED_AUDIOS;

    if (selectedTab === "featured") {
      list = list.filter((a) => a.isFeatured);
    } else if (selectedTab === "zodiac") {
      list = list.filter((a) => a.isZodiac);
    } else if (selectedTab === "northern") {
      list = list.filter((a) => a.hemisphere === "northern");
    } else if (selectedTab === "southern") {
      list = list.filter((a) => a.hemisphere === "southern");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.gen.toLowerCase().includes(q) ||
          a.brightestStar.toLowerCase().includes(q)
      );
    }

    return list;
  }, [selectedTab, searchQuery]);

  // Handle Web Audio API connection lazily on user playback
  const setupWebAudio = useCallback(() => {
    if (audioContextRef.current || !audioRef.current || typeof window === "undefined") return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;

      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
    } catch {
      // Cross-origin or autoplay restrictions; fallback gracefully
    }
  }, []);

  // Play / Pause toggle
  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setupWebAudio();
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  }, [isPlaying, setupWebAudio]);

  // Select a constellation to play
  const selectConstellation = useCallback(
    async (item: ArchivedAudioRecord, autoPlay = true) => {
      setActiveRecord(item);
      const audio = audioRef.current;
      if (!audio) return;

      audio.src = item.path;
      audio.currentTime = 0;
      setCurrentTime(0);

      if (autoPlay) {
        setupWebAudio();
        if (audioContextRef.current && audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume();
        }
        try {
          await audio.play();
          setIsPlaying(true);
        } catch {
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(false);
      }
    },
    [setupWebAudio]
  );

  // Time & progress formatting
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Canvas Waveform & Frequency Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderFrame = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      const bufferLength = analyser ? analyser.frequencyBinCount : 32;
      const dataArray = new Uint8Array(bufferLength);

      if (analyser && isPlaying && !prefersReducedMotion) {
        analyser.getByteFrequencyData(dataArray);
      } else if (isPlaying && !prefersReducedMotion) {
        // Simulated organic wave if audio graph cannot attach directly
        const now = Date.now() * 0.005;
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.floor(
            50 + Math.sin(now + i * 0.4) * 45 + Math.cos(now * 0.7 + i * 0.2) * 35
          );
        }
      } else {
        // Rest state
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = 12;
        }
      }

      // Draw mirrored frequency bars with soft glow
      const barCount = 36;
      const barWidth = Math.max(2, (w / barCount) - 3);
      const cx = w / 2;
      const cy = h / 2;

      // Center baseline rule
      ctx.strokeStyle = "rgba(var(--ring-rgb, 27, 97, 163), 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();

      for (let i = 0; i < barCount / 2; i++) {
        const val = dataArray[i % bufferLength] / 255;
        const barH = Math.max(4, val * (cy - 12));

        // Right side
        const rx = cx + (i * (barWidth + 3)) + 2;
        // Left side (mirrored)
        const lx = cx - ((i + 1) * (barWidth + 3)) + 2;

        const alpha = Math.max(0.25, val * 0.95);
        ctx.fillStyle = isPlaying
          ? `rgba(74, 155, 227, ${alpha})`
          : `rgba(146, 146, 141, 0.3)`;

        // Draw symmetric vertical pill
        ctx.fillRect(rx, cy - barH, barWidth, barH * 2);
        ctx.fillRect(lx, cy - barH, barWidth, barH * 2);
      }

      // Running sine overlay for scientific acoustic character
      if (isPlaying && !prefersReducedMotion) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
        ctx.lineWidth = 1.4;
        const now = Date.now() * 0.004;
        for (let x = 0; x < w; x += 3) {
          const normX = (x - cx) / cx;
          const env = Math.exp(-normX * normX * 2.2); // Gaussian envelope
          const y = cy + Math.sin(x * 0.045 + now * 2) * 18 * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      if (isPlaying && !prefersReducedMotion) {
        animationFrameRef.current = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  // Volume synchronization
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  return (
    <section
      className="sonification-archive"
      id="sonification-archive"
      aria-labelledby="sonification-archive-title"
      tabIndex={-1}
    >
      {/* Hidden standard audio element */}
      <audio
        ref={audioRef}
        src={activeRecord.path}
        preload="metadata"
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onEnded={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)}
      />

      <div className="archive-inner">
        {/* Section Header */}
        <div className="archive-header">
          <span className="field-label">COSMIC SOUND · 88 CONSTELLATIONS ARCHIVED</span>
          <h2 id="sonification-archive-title" className="archive-title">
            Archived Audios from Sound Sonification
          </h2>
          <p className="archive-desc">
            Hear the geometry of the sky. We sonify real astronomical positions and infrared brightness
            across all 88 modern constellations into continuous harmonic acoustic sweeps.
          </p>
          <div className="archive-note" role="note">
            <span className="note-dot" aria-hidden="true">✦</span>
            <span>
              <strong>Scientific Honesty:</strong> Sound does not travel through space vacuum. These sweeps
              map real Right Ascension (sweep time), Declination (pitch/frequency), and stellar flux (loudness)
              using our verified SPHEREx Cosmic Sound methodology.
            </span>
          </div>
        </div>

        {/* Hero Interactive Jukebox Player */}
        <div className="archive-player-deck">
          <div className="player-meta-top">
            <div className="badge-group">
              <span className={`status-pill ${isPlaying ? "is-live" : ""}`}>
                {isPlaying ? "● PLAYING SWEEP" : "■ READY TO AUDITION"}
              </span>
              <span className="iau-badge">IAU · {activeRecord.id}</span>
              <span className="hemi-badge">
                {activeRecord.isZodiac
                  ? "ZODIAC"
                  : `${activeRecord.hemisphere.toUpperCase()} SKY`}
              </span>
            </div>
            <div className="track-coords">
              RA {activeRecord.ra.toFixed(1)}° · Dec {activeRecord.dec >= 0 ? "+" : ""}{activeRecord.dec.toFixed(1)}° · {activeRecord.area.toFixed(0)} sq°
            </div>
          </div>

          <div className="player-center">
            <div className="player-title-box">
              <h3 className="active-constellation-name">{activeRecord.name}</h3>
              <p className="active-constellation-gen">
                Genitive: <em>{activeRecord.gen}</em>
                {activeRecord.brightestStar ? ` · Brightest star: ${activeRecord.brightestStar}` : ""}
              </p>
            </div>

            {/* Live Canvas Visualizer */}
            <div className="visualizer-container">
              <canvas
                ref={canvasRef}
                width={720}
                height={120}
                className="visualizer-canvas"
                aria-label={`Acoustic frequency spectrum for ${activeRecord.name}`}
              />
            </div>
          </div>

          {/* Player Controls & Scrubber */}
          <div className="player-controls-deck">
            <div className="scrubber-row">
              <span className="time-label">{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration > 0 ? duration : 100}
                value={currentTime}
                step="0.05"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setCurrentTime(val);
                  if (audioRef.current) audioRef.current.currentTime = val;
                }}
                className="scrub-slider"
                aria-label="Seek time in constellation audio sweep"
              />
              <span className="time-label">{formatTime(duration)}</span>
            </div>

            <div className="buttons-row">
              <div className="primary-actions">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="play-hero-btn"
                  aria-label={isPlaying ? `Pause ${activeRecord.name} audio` : `Play ${activeRecord.name} audio`}
                >
                  {isPlaying ? (
                    <>
                      <span className="btn-icon" aria-hidden="true"><Pause className="h-4" /></span>
                      <span>PAUSE SWEEP</span>
                    </>
                  ) : (
                    <>
                      <span className="btn-icon" aria-hidden="true"><Play className="h-4" /></span>
                      <span>PLAY SWEEP</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = 0;
                      setCurrentTime(0);
                    }
                  }}
                  className="restart-btn"
                  aria-label="Restart audio from beginning"
                  title="Restart from 0:00"
                >
                  ↺ Restart
                </button>
              </div>

              {/* Volume & Links */}
              <div className="secondary-actions">
                <div className="volume-control">
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="mute-btn"
                    aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      setVolume(parseFloat(e.target.value));
                      if (isMuted) setIsMuted(false);
                    }}
                    className="volume-slider"
                    aria-label="Adjust audio volume"
                  />
                </div>

                <a
                  href={activeRecord.path}
                  download={activeRecord.file}
                  className="download-wav-btn"
                  title={`Download high-fidelity ${activeRecord.file} (44.1 kHz PCM)`}
                >
                  <span>Download .WAV</span>
                  <span aria-hidden="true">↓</span>
                </a>

                <Link
                  href={`/explore?sel=region:${activeRecord.id}`}
                  className="explore-sky-btn"
                  title={`View ${activeRecord.name} in 3D Sky Explorer`}
                >
                  <span>Sky Dome</span>
                  <span aria-hidden="true"><ArrowUpRight className="h-4" /></span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Featured Quick Audition Strip */}
        <div className="featured-strip">
          <p className="strip-title">QUICK AUDITION · ICONIC CELESTIAL TARGETS</p>
          <div className="featured-pills-row">
            {ARCHIVED_AUDIOS.filter((a) => a.isFeatured).map((item) => {
              const active = activeRecord.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectConstellation(item, true)}
                  className={`featured-pill ${active ? "is-selected" : ""}`}
                  aria-pressed={active}
                  aria-label={`Audition ${item.name}`}
                >
                  <span className="pill-dot" aria-hidden="true">
                    {active && isPlaying ? "♫" : "✦"}
                  </span>
                  <span className="pill-name">{item.name}</span>
                  <span className="pill-abbr">({item.id})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Full 88 Constellation Archive Drawer */}
        <div className="archive-drawer">
          <div className="drawer-header-bar">
            <div className="drawer-title-group">
              <h3 className="drawer-heading">Browse All 88 Sonified Constellations</h3>
              <p className="drawer-sub">
                Filter by celestial family or type a constellation name to audition its spatial wave.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="toggle-drawer-btn"
              aria-expanded={drawerOpen}
            >
              <span>{drawerOpen ? "Hide Constellation List" : `Show All Constellations (${filteredAudios.length})`}</span>
              <span className="toggle-arrow" aria-hidden="true">{drawerOpen ? "▲" : "▼"}</span>
            </button>
          </div>

          {drawerOpen && (
            <div className="drawer-content">
              {/* Filter Tabs & Search Bar */}
              <div className="filter-toolbar">
                <div className="category-tabs" role="tablist" aria-label="Constellation filters">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedTab === "featured"}
                    onClick={() => setSelectedTab("featured")}
                    className={`tab-btn ${selectedTab === "featured" ? "is-active" : ""}`}
                  >
                    Featured (10)
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedTab === "zodiac"}
                    onClick={() => setSelectedTab("zodiac")}
                    className={`tab-btn ${selectedTab === "zodiac" ? "is-active" : ""}`}
                  >
                    Zodiac (12)
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedTab === "northern"}
                    onClick={() => setSelectedTab("northern")}
                    className={`tab-btn ${selectedTab === "northern" ? "is-active" : ""}`}
                  >
                    Northern Sky (37)
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedTab === "southern"}
                    onClick={() => setSelectedTab("southern")}
                    className={`tab-btn ${selectedTab === "southern" ? "is-active" : ""}`}
                  >
                    Southern Sky (51)
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedTab === "all"}
                    onClick={() => setSelectedTab("all")}
                    className={`tab-btn ${selectedTab === "all" ? "is-active" : ""}`}
                  >
                    All Constellations (88)
                  </button>
                </div>

                <div className="search-box">
                  <input
                    type="search"
                    placeholder="Search name, code, star..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                    aria-label="Filter archived constellations"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="clear-search-btn"
                      aria-label="Clear constellation search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Constellation Grid */}
              <div className="archive-grid">
                {filteredAudios.map((item) => {
                  const isCurrent = activeRecord.id === item.id;
                  const itemPlaying = isCurrent && isPlaying;
                  return (
                    <div
                      key={item.id}
                      className={`archive-card ${isCurrent ? "is-active" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => selectConstellation(item, true)}
                        className="card-main-btn"
                        aria-label={`Play ${item.name} constellation sweep`}
                      >
                        <div className="card-top-row">
                          <span className="card-id">{item.id}</span>
                          <span className="card-play-icon" aria-hidden="true">
                            {itemPlaying ? "⏸" : "▶"}
                          </span>
                        </div>
                        <div className="card-name-row">
                          <h4 className="card-name">{item.name}</h4>
                          <span className="card-gen">{item.gen}</span>
                        </div>
                        <div className="card-detail-row">
                          <span className="card-hemi">
                            {item.isZodiac ? "Zodiac" : item.hemisphere}
                          </span>
                          {item.brightestStar && (
                            <span className="card-star">★ {item.brightestStar}</span>
                          )}
                        </div>
                      </button>

                      <div className="card-footer-row">
                        <a
                          href={item.path}
                          download={item.file}
                          className="card-dl-btn"
                          title={`Download ${item.file}`}
                          aria-label={`Download ${item.file}`}
                        >
                          WAV ↓
                        </a>
                        <Link
                          href={`/explore?sel=region:${item.id}`}
                          className="card-sky-btn"
                          title={`View ${item.name} on Sky Dome`}
                          aria-label={`View ${item.name} on Sky Dome`}
                        >
                          Sky ↗
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredAudios.length === 0 && (
                <div className="no-results-msg">
                  No constellations found matching &ldquo;{searchQuery}&rdquo;.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
