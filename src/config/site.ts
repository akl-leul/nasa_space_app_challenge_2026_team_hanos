/** One place for the public identity of the site. Set NEXT_PUBLIC_SITE_URL at build time to use another address. */
export const SITE_URL: string = (process.env.NEXT_PUBLIC_SITE_URL || "https://hanos.surf").trim().replace(/\/+$/, "");

export const SITE_NAME = "HANOS";
export const SITE_TAGLINE = "Planet X and SPHEREx";

export const SITE_DESCRIPTION =
  "Explore real SPHEREx infrared observations of the sky across time, spot moving objects and brightness changes, and hear the data. Team Hanos, 2026 NASA Space Apps Challenge.";
