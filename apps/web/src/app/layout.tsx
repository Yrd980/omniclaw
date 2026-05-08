import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniClaw Marketplace",
  description: "Marketplace and task console for the OmniClaw MVP.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
