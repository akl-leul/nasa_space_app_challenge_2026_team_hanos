import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { pageMetadata } from "@/config/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Sky Explorer",
  description: "Explore real SPHEREx infrared observations of any region of the sky over time, compare frames, measure motion and brightness, and listen to a region.",
  path: "/explore",
});

export const viewport: Viewport = { themeColor: "#111111" };

export default function ExploreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <noscript>
        <p className="p-6 text-cream bg-ink">The HANOS Sky Explorer is an interactive 3D sky and needs JavaScript. Please turn it on, or read about the project on the home page.</p>
      </noscript>
      {children}
    </>
  );
}
