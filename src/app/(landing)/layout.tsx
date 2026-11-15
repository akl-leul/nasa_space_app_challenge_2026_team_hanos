import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { pageMetadata } from "@/config/metadata";
import "./landing.css";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Hanos — Planet X and SPHEREx",
    description: "Team Hanos presents Planet X and SPHEREx for the 2026 NASA Space Apps Challenge. An illustrated journey through a changing sky.",
    path: "/",
    absoluteTitle: true,
  }),
  // no icons here: every page uses the Hanos emblem from src/app/favicon.ico, icon.png and apple-icon.png
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f1ed",
};

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* the title face and the body face are on screen at once, so they start downloading with the page (licences in /public/landing/licenses) */}
      <link rel="preload" href="/landing/fonts/title.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="preload" href="/landing/fonts/condensed.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      {children}
    </>
  );
}
