import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter for headings and body, exactly as the dashboard does it
// (dashboard/src/app/layout.tsx, docs/design/DESIGN.md §0). Exposed as
// --font-inter, which globals.css maps to --font-body and --font-heading.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Bachero — contractor",
  description: "Repair routes, stops and evidence for council pothole crews",
};

// The crew screen is a phone in a windscreen cradle. It must not zoom-jump when
// the note field takes focus, and it must respect the notch.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f2f3",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
