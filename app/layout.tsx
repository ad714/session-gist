import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sentient = localFont({
  src: [
    { path: "./fonts/Sentient-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Sentient-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sentient",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Session Gist",
  description: "Record or upload a mentorship session and see what it was about.",
};

export const viewport: Viewport = {
  themeColor: "#fcfcfa",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sentient.variable}>
      <body>{children}</body>
    </html>
  );
}
