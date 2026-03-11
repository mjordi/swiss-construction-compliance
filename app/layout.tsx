import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "BauCompliance.ch | Mängelrüge Frist 2026 – Digitale Abnahme Schweiz",
    template: "%s | BauCompliance.ch",
  },
  description:
    "Automatische Mängelrüge-Fristen nach OR Art. 370a (60-Tage-Frist seit 1.1.2026). Digitale Abnahmeprotokolle, Risiko-Matrix für alle 26 Kantone. OR Revision Baurecht Schweiz.",
  keywords: [
    "Mängelrüge Frist 2026",
    "OR Revision Baurecht",
    "Abnahmeprotokoll digital Schweiz",
    "BauCompliance",
    "OR Art. 370a",
    "60 Tage Rügefrist",
    "SIA 118",
    "Gewährleistungsrecht Schweiz",
    "Obligationenrecht Revision",
    "digitale Abnahme Baurecht",
  ],
  authors: [{ name: "BauCompliance.ch", url: "https://baucompliance.ch" }],
  creator: "BauCompliance.ch",
  publisher: "BauCompliance.ch",
  metadataBase: new URL("https://baucompliance.ch"),
  alternates: {
    canonical: "/",
    languages: {
      "de-CH": "/",
      "fr-CH": "/?lang=fr",
      "it-CH": "/?lang=it",
      "rm-CH": "/?lang=rm",
      "en": "/?lang=en",
    },
  },
  openGraph: {
    type: "website",
    locale: "de_CH",
    alternateLocale: ["fr_CH", "it_CH", "en_US"],
    url: "https://baucompliance.ch",
    siteName: "BauCompliance.ch",
    title: "BauCompliance.ch | Mängelrüge Frist 2026 – OR Revision Baurecht",
    description:
      "Schützen Sie Ihr Bauunternehmen vor den Risiken der OR-Revision 2026. Automatische Fristenberechnung nach Art. 370a OR – digitale Abnahmeprotokolle für alle 26 Kantone.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BauCompliance.ch – Digitale Abnahme & Mängelrüge Frist 2026",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BauCompliance.ch | Mängelrüge Frist 2026",
    description:
      "Automatische Fristenberechnung nach OR Art. 370a (60-Tage-Frist) – digitale Abnahmeprotokolle für Schweizer Bauunternehmen.",
    images: ["/og-image.png"],
    creator: "@baucompliance",
    site: "@baucompliance",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "baucompliance-google-verification",
  },
  category: "business",
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
        <LanguageProvider>
          <AuthProvider>
            <div className="blob" />
            {children}
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
