import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter for headings and body (docs/design/DESIGN.md §0). Exposed as --font-inter,
// which globals.css maps to --font-body and --font-heading.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Bachero",
  description: "Pothole detection network for council fleets",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
