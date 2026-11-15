import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/**
 * Production runs on Vercel: the site is built here and /api/* is forwarded to the science API (a Docker service on
 * Render, see docs/DEPLOYMENT.md), so the browser only ever talks to one address (no CORS).
 * Locally, `next dev` forwards /api/* to the API on this machine.
 */
const isProduction = process.env.NODE_ENV === "production";
const isVercel = Boolean(process.env.VERCEL);

// A production site without an API address would build fine and then fail on every request: stop the build instead.
if (isVercel && !process.env.API_BASE_URL) {
  throw new Error("API_BASE_URL is not set. Add the address of the science API (the Render service) to the Vercel project's environment variables.");
}

const security = Object.entries(JSON.parse(readFileSync("deploy/security-headers.json", "utf8")) as Record<string, string>).map(([key, value]) => ({ key, value }));
const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    agentFeedback: true,
    // Only used by `next start` and `next dev` (self-hosted proxy cut-off, 30 s by default). Requests that would take longer
    // than about 25 s are answered 202 by the API and asked again, so this is a safety margin, not a requirement.
    proxyTimeout: 180_000,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Landing assets that never change under the same name are cached for a year (repeat visits load nothing).
  // app-preview.webp is left out: it is meant to be replaced with newer screenshots.
  async headers() {
    return [
      // the content security policy would block the dev server hot reload, so it is for production only
      ...(isProduction ? [{ source: "/:path*", headers: security }] : []),
      { source: "/landing/fonts/:path*", headers: immutable },
      { source: "/landing/team/:path*", headers: immutable },
      { source: "/landing/vendor/:path*", headers: immutable },
      { source: "/landing/hanos-logo.webp", headers: immutable },
      { source: "/landing/grain.png", headers: immutable },
      { source: "/landing/grain-night.png", headers: immutable },
    ];
  },
  async rewrites() {
    const apiBase = (process.env.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    return [{ source: "/api/:path*", destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
