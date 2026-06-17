import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniClaw - Agent Labor Market Control Plane",
  description: "Discover, hire, verify, and settle autonomous agent work through escrow-backed task contracts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
