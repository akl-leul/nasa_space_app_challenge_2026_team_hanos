"use client";

import dynamic from "next/dynamic";

const SkyExplorer = dynamic(
  () => import("@/components/explore/SkyExplorer").then((mod) => mod.SkyExplorer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-screen bg-ink text-cream flex items-center justify-center font-mono text-[9px] tracking-widest select-none">
        INITIALIZING SKY EXPLORER...
      </div>
    ),
  }
);

export default function ExplorePage() {
  return (
    <main className="w-full h-full min-h-screen bg-ink text-cream relative overflow-hidden">
      <SkyExplorer />
    </main>
  );
}
