import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "60-Tage-Rügefrist Rechner | Art. 370 nOR",
  description:
    "Kostenloser Rügefrist-Rechner: Berechnen Sie die 60-Tage-Frist nach Art. 370 nOR (OR-Revision 2026). Übergangsrecht-Check — Altrecht vs. Neurecht automatisch erkennen.",
  keywords: [
    "Rügefrist Rechner",
    "60 Tage Frist",
    "Art. 370 nOR",
    "OR Revision 2026",
    "Mängelrüge Frist berechnen",
    "Übergangsrecht Baurecht",
    "Baurecht Schweiz 2026",
  ],
  alternates: {
    canonical: "/tools/ruegefrist-rechner",
  },
  openGraph: {
    title: "60-Tage-Rügefrist Rechner | BauCompliance.ch",
    description:
      "Kostenloser Rügefrist-Rechner für die OR-Revision 2026. Berechnen Sie automatisch ob Alt- oder Neurecht gilt.",
    url: "https://baucompliance.ch/tools/ruegefrist-rechner",
  },
};

export default function RuegefristLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
