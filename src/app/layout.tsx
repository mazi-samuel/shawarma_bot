import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shawarma Bot",
  description: "WhatsApp ordering bot admin",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
