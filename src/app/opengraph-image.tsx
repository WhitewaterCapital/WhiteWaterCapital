import { ImageResponse } from "next/og";

// Link-preview card (iMessage, WhatsApp, Slack, LinkedIn...): the site's
// coral→teal gradient with the name and tagline.
export const alt = "Whitewater — a concentrated, conviction-led investment club";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "white",
          background: "linear-gradient(135deg, #e0603f 0%, #c98a77 45%, #8fb5ad 100%)",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 8, fontWeight: 600 }}>WHITEWATER</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, fontWeight: 300 }}>Sustained conviction</div>
          <div style={{ fontSize: 76, lineHeight: 1.05, fontWeight: 300 }}>in public markets.</div>
          <div style={{ marginTop: 28, fontSize: 28, opacity: 0.85 }}>
            A concentrated, conviction-led investment club.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
