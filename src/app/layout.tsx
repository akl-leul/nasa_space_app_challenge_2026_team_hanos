import type { Metadata } from "next";
import { metadataBase, pageMetadata } from "@/config/metadata";
import { SITE_NAME } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  title: { default: "HANOS — Planet X and SPHEREx Sky Explorer", template: "%s | HANOS" },
  keywords: ["SPHEREx", "NASA Space Apps Challenge", "Planet X", "infrared sky", "sky explorer", "sonification", "IRSA", "astronomy"],
  authors: [{ name: "Team Hanos" }],
  creator: "Team Hanos",
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
  ...pageMetadata({ title: "HANOS — Planet X and SPHEREx Sky Explorer", path: "/", absoluteTitle: true }),
};

/**
 * Runs before the landing pages (/ and /challenge) are painted: marks the document as script-enabled and applies the
 * saved day/night choice, so there is no flash of the wrong theme. It does nothing on any other route.
 * (It lives here, not in the landing layout: React warns about a <script> rendered while navigating on the client.)
 */
const LANDING_BEFORE_PAINT = String.raw`(function(){if(!/^\/(challenge\/?)?$/.test(location.pathname))return;var d=document.documentElement;d.classList.add('hanos-page','hanos-js');try{if(localStorage.getItem('hanos-theme')==='night'){d.setAttribute('data-theme','night');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#0b0f14')}}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the landing page's inline script sets classes and data-theme on <html> before React hydrates
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANDING_BEFORE_PAINT }} />
      </head>
      <body className="min-h-full flex flex-col bg-cream text-ink">
        {children}
      </body>
    </html>
  );
}
