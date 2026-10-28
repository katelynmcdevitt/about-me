import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Katelyn McDevitt — Front End Software Engineer",
    template: "%s | Katelyn McDevitt",
  },
  description:
    "Katelyn McDevitt — front end software engineer with 15+ years of experience in individual contribution, technical leadership, and management.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
