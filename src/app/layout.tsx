import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "River Hub",
  description: "Water-quality and sewage monitoring for Friends of the Dart",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
