import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OpenFinance Terminal", template: "%s · OpenFinance Terminal" },
  description: "Local financial research terminal for Indian markets.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0e1012",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
