import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "BauCompliance.ch – Digitale Abnahme & Mängelrüge Frist 2026";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(249,115,22,0.15) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(249,115,22,0.1) 0%, transparent 50%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: "-2px",
            }}
          >
            Bau
          </span>
          <span
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: "#f97316",
              letterSpacing: "-2px",
            }}
          >
            Compliance
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: "#22c55e",
            }}
          />
          <span
            style={{
              fontSize: 20,
              color: "#f97316",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "3px",
            }}
          >
            Live: OR Revision 2026
          </span>
        </div>

        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: "#e2e8f0",
            textAlign: "center",
            maxWidth: 800,
            lineHeight: 1.3,
          }}
        >
          Mängelrüge-Fristen automatisch berechnen.
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: "#e2e8f0",
            textAlign: "center",
            maxWidth: 800,
            lineHeight: 1.3,
          }}
        >
          Digitale Abnahmeprotokolle erstellen.
        </div>

        <div
          style={{
            display: "flex",
            gap: 24,
            marginTop: 40,
          }}
        >
          {["Art. 370a OR", "60-Tage-Frist", "26 Kantone", "SIA 118"].map(
            (tag) => (
              <div
                key={tag}
                style={{
                  padding: "8px 20px",
                  borderRadius: 20,
                  backgroundColor: "rgba(249,115,22,0.15)",
                  border: "1px solid rgba(249,115,22,0.3)",
                  color: "#f97316",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                {tag}
              </div>
            )
          )}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 32,
            fontSize: 16,
            color: "#64748b",
          }}
        >
          baucompliance.ch · Zürich · Genève · Lugano
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
