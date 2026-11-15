/**
 * Share Card Fonts Management
 *
 * Supports Hatton-Bold (commercial, team-supplied at /fonts/Hatton-Bold.woff2)
 * falling back to Playfair Display 800/900 if missing.
 * Self-hosts Inter-Bold 700 at /fonts/Inter-Bold.woff2.
 */

export interface FontStatus {
  isHattonAvailable: boolean;
  isInterLoaded: boolean;
  fontFamilyTitle: string;
  fontFamilyFacts: string;
}

let cachedFontStatus: FontStatus | null = null;
let fontLoadPromise: Promise<FontStatus> | null = null;

export async function loadShareCardFonts(): Promise<FontStatus> {
  if (cachedFontStatus) return cachedFontStatus;
  if (fontLoadPromise) return fontLoadPromise;

  fontLoadPromise = (async () => {
    if (typeof window === "undefined" || !("fonts" in document)) {
      cachedFontStatus = {
        isHattonAvailable: false,
        isInterLoaded: false,
        fontFamilyTitle: "'Playfair Display', Georgia, serif",
        fontFamilyFacts: "Inter, 'Geist Sans', sans-serif",
      };
      return cachedFontStatus;
    }

    let isHattonAvailable = false;
    let isInterLoaded = false;

    // 1. Check & load Hatton-Bold.woff2 if present
    try {
      const res = await fetch("/fonts/Hatton-Bold.woff2", { method: "HEAD" });
      if (res.ok) {
        const fontFace = new FontFace(
          "Hatton",
          "url(/fonts/Hatton-Bold.woff2) format('woff2')",
          { weight: "700", style: "normal" }
        );
        const loaded = await fontFace.load();
        document.fonts.add(loaded);
        isHattonAvailable = true;
      }
    } catch {
      isHattonAvailable = false;
    }

    // 2. Load self-hosted Inter-Bold.woff2
    try {
      const fontFaceInter = new FontFace(
        "Inter",
        "url(/fonts/Inter-Bold.woff2) format('woff2')",
        { weight: "700", style: "normal" }
      );
      const loadedInter = await fontFaceInter.load();
      document.fonts.add(loadedInter);
      isInterLoaded = true;
    } catch {
      isInterLoaded = false;
    }

    // 3. Fallback font for title if Hatton is missing: Playfair Display
    if (!isHattonAvailable) {
      try {
        await document.fonts.load("800 24px 'Playfair Display'");
      } catch {
        // Continue with serif fallback
      }
    }

    cachedFontStatus = {
      isHattonAvailable,
      isInterLoaded,
      fontFamilyTitle: isHattonAvailable
        ? "Hatton, 'Playfair Display', serif"
        : "'Playfair Display', Georgia, serif",
      fontFamilyFacts: "Inter, 'Geist Sans', -apple-system, sans-serif",
    };

    return cachedFontStatus;
  })();

  return fontLoadPromise;
}
