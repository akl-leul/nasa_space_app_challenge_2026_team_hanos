import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

export const OG_IMAGE = { url: "/og/hanos-og.png", width: 1200, height: 630, alt: "HANOS: see the sky change. Real SPHEREx observations in time order." };

/** Page metadata with the share preview filled in, so every route links and previews the same way. */
export function pageMetadata(opts: { title: string; description?: string; path: string; absoluteTitle?: boolean }): Metadata {
  const description = opts.description ?? SITE_DESCRIPTION;
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description,
    alternates: { canonical: opts.path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: opts.path,
      title: opts.title,
      description,
      images: [OG_IMAGE],
      locale: "en",
    },
    twitter: { card: "summary_large_image", title: opts.title, description, images: [OG_IMAGE.url] },
  };
}

export const metadataBase = new URL(SITE_URL);
