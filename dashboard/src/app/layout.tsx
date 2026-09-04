import type { Metadata, Viewport } from "next";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/** A government-commissioned face, openly licensed. Carries the interface. */
const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

/** Carries references, coordinates and times: read aloud and transcribed. */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bachero, pothole detection and repair dispatch",
  description:
    "Operations console for highway authorities: map detected potholes, triage the repair queue, and dispatch routes to crews.",
};

/**
 * The console is used on a phone in a van as well as at a desk. Cover the
 * notches (the frame reads the safe-area insets) and let the keyboard shrink
 * the viewport rather than slide over the sheet.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={`${publicSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
