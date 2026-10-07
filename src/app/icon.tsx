import { ImageResponse } from "next/og";

// Browser-tab icon: a coral "W" on the site's dark ink. Replaces the default
// Next.js favicon.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16130f",
          color: "#e0603f",
          fontSize: 44,
          fontWeight: 700,
          borderRadius: 12,
        }}
      >
        W
      </div>
    ),
    size,
  );
}
