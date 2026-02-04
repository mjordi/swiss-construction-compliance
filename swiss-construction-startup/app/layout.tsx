import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BauCompliance.ch | Swiss Construction Intelligence",
  description: "Automated legal compliance for the 2026 Swiss Code of Obligations revision.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body
        className={`${outfit.variable} ${jakarta.variable} antialiased`}
        style={{ fontFamily: "var(--font-jakarta)" }}
      >
        <div className="blob" />
        {children}
      </body>
    </html>
  );
}
