import { Geist, Geist_Mono } from "next/font/google";

// Weight 400 only (the explorer uses regular weight everywhere). Loaded here so the landing pages do not download them.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], weight: "400" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], weight: "400" });

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable} app-shell min-h-screen bg-cream text-ink flex flex-col`}>
      {children}
    </div>
  );
}
