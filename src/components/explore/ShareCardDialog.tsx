"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { SkySelection, ConstellationInfo, StarRecord } from "@/types/sky";
import { drawShareCard, ShareCardData } from "@/lib/share/drawShareCard";
import { buildShareUrl, generateCardFilename, getBaseOrigin } from "@/lib/share/shareUrl";
import { computeCardFacts } from "@/lib/share/facts";
import { cleanObjectName } from "@/lib/explore/detectCategory";

export interface ShareCardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selection: SkySelection;
  constellations: ConstellationInfo[];
  stars: StarRecord[];
  boundaryPositions: Float32Array | null;
  constellationPolygons: Record<string, number[][][]> | null;
  triggerButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function ShareCardDialog({
  isOpen,
  onClose,
  selection,
  constellations,
  stars,
  boundaryPositions,
  constellationPolygons,
  triggerButtonRef,
}: ShareCardDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const downloadButtonRef = useRef<HTMLButtonElement | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null);
  const [canSystemShare] = useState<boolean>(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function"
  );

  const origin = getBaseOrigin();
  const shareUrl = buildShareUrl(selection);
  const { title, coordinatesSexagesimal, facts } = computeCardFacts(selection, constellations, stars);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  }, []);

  // Render the card canvas whenever dialog opens or font loads
  const renderCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cardData: ShareCardData = {
      selection,
      constellations,
      stars,
      boundaryPositions,
      constellationPolygons,
      siteUrl: origin,
    };

    await drawShareCard(canvas, cardData);
  }, [selection, constellations, stars, boundaryPositions, constellationPolygons, origin]);

  // Dynamically load Playfair Display for the dialog card only, then redraw once loaded
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    // Inject stylesheet link if not already added
    const linkId = "hanos-playfair-font-link";
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,700&display=swap";
      document.head.appendChild(link);
    }

    if ("fonts" in document) {
      document.fonts
        .load('900 48px "Playfair Display"')
        .then(() => {
          if (isMounted) {
            renderCard();
          }
        })
        .catch(() => {
          if (isMounted) {
            renderCard();
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, renderCard]);

  useEffect(() => {
    if (isOpen) {
      renderCard();
    }
  }, [isOpen, renderCard]);

  // Focus trap and Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    // Initial focus on primary action button
    downloadButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        triggerButtonRef?.current?.focus();
        return;
      }

      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusableArr = Array.from(focusable);
        if (focusableArr.length === 0) return;

        const first = focusableArr[0];
        const last = focusableArr[focusableArr.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, triggerButtonRef]);

  // 1. Download PNG Action (1920x1080)
  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = generateCardFilename(selection);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      showToast("PNG downloaded");
    }, "image/png");
  };

  // 2. Copy Link Action
  const handleCopyLink = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast("Link copied");
        return;
      } catch {}
    }
    setShareFallbackUrl(shareUrl);
  };

  // 3. System Share Action
  const handleSystemShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof navigator === "undefined" || !navigator.share) return;

    const targetName = selection.kind === "region" ? selection.name : cleanObjectName(selection.name) || `HIP ${selection.id}`;

    // Try sharing as image file first
    canvas.toBlob(async (blob) => {
      if (blob && navigator.canShare) {
        const file = new File([blob], generateCardFilename(selection), { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `HANOS Sky Explorer — ${targetName}`,
              text: `Explore ${targetName} on HANOS 3D Sky Dome`,
              files: [file],
            });
            showToast("Shared successfully");
            return;
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
          }
        }
      }

      // Fallback: share URL only
      try {
        await navigator.share({
          title: `HANOS Sky Explorer — ${targetName}`,
          text: `Explore ${targetName} on HANOS 3D Sky Dome`,
          url: shareUrl,
        });
        showToast("Shared successfully");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        handleCopyLink();
      }
    }, "image/png");
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/80 backdrop-blur-xs select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
          triggerButtonRef?.current?.focus();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-card-dialog-title"
        className="relative flex flex-col items-center max-w-[760px] w-full bg-ink border border-cream/30 p-4 sm:p-5 text-cream rounded-sm shadow-none space-y-3.5"
      >
        {/* Header Bar */}
        <div className="w-full flex items-center justify-between border-b border-cream/20 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue" />
            <h2
              id="share-card-dialog-title"
              className="text-[9px] font-normal tracking-widest uppercase text-cream"
            >
              Share Target Card · {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              triggerButtonRef?.current?.focus();
            }}
            aria-label="Close share dialog"
            className="w-6 h-6 flex items-center justify-center border border-cream/30 hover:border-cream text-cream rounded cursor-pointer text-[9px] transition-colors focus-visible:outline-2 focus-visible:outline-blue"
          >
            ✕
          </button>
        </div>

        {/* 16:9 Card Canvas Preview */}
        <div className="relative w-full aspect-video bg-ink rounded border border-cream/20 overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain block"
            aria-label={`Share card for ${title}: ${coordinatesSexagesimal}`}
          />
          {/* Visually hidden description for screen readers */}
          <div className="sr-only">
            <h3>{title}</h3>
            <p>{coordinatesSexagesimal}</p>
            <ul>
              {facts.map((f, i) => (
                <li key={i}>
                  {f.label}: {f.value}
                </li>
              ))}
            </ul>
            <p>Direct view link: {shareUrl}</p>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Primary: Download PNG */}
            <button
              ref={downloadButtonRef}
              type="button"
              onClick={handleDownloadPng}
              className="h-7 px-3 bg-blue text-cream border border-blue hover:brightness-110 cursor-pointer rounded text-[9px] font-normal tracking-widest uppercase flex items-center gap-1.5 transition-all focus-visible:outline-2 focus-visible:outline-cream"
            >
              <span>Download PNG</span>
            </button>

            {/* Secondary: Copy Link */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="h-7 px-3 bg-ink text-cream border border-cream/30 hover:bg-cream hover:text-ink cursor-pointer rounded text-[9px] font-normal tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-blue"
            >
              <span>Copy Link</span>
            </button>

            {/* Secondary: System Share */}
            {canSystemShare && (
              <button
                type="button"
                onClick={handleSystemShare}
                className="h-7 px-3 bg-ink text-cream border border-cream/30 hover:bg-cream hover:text-ink cursor-pointer rounded text-[9px] font-normal tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-blue"
              >
                <span>Share</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              triggerButtonRef?.current?.focus();
            }}
            className="h-7 px-3 bg-ink text-cream/70 hover:text-cream border border-cream/20 hover:border-cream/50 cursor-pointer rounded text-[9px] font-normal tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-blue"
          >
            Close
          </button>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3 py-1 bg-ink border border-blue text-cream rounded text-[9px] font-normal tracking-widest uppercase flex items-center gap-2 animate-fade-in"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Manual Fallback Field if Clipboard unavailable */}
        {shareFallbackUrl && (
          <div className="w-full bg-ink border border-cream/25 p-2 rounded text-[9px] space-y-1.5">
            <div className="text-cream/80 uppercase tracking-wider">Direct share link:</div>
            <input
              type="text"
              readOnly
              value={shareFallbackUrl}
              onFocus={(e) => e.target.select()}
              className="w-full bg-ink border border-cream/20 text-cream px-2 py-1 font-mono text-[9px] rounded focus:outline-blue"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ShareCardDialog;
