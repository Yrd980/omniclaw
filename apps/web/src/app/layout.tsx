import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniClaw Research Workbench",
  description: "Escrow-backed Web3 agent research workflow demo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
