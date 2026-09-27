import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/config/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 96,
          background: "#f7f8fb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#0b0f1a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, color: "#0b0f1a" }}>{siteConfig.name}</div>
        </div>
        <div style={{ marginTop: 24, fontSize: 40, fontWeight: 700, color: "#101828" }}>
          Save TikTok videos. Simply.
        </div>
        <div style={{ marginTop: 12, fontSize: 26, color: "#667085" }}>{siteConfig.tagline}</div>
      </div>
    ),
    { ...size }
  );
}
