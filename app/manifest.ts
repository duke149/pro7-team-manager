import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PRO7 Team Manager",
    short_name: "PRO7",
    description: "Quản lý đội bóng 7 người, lời mời trận đấu và phản hồi tham gia.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#e31837",
    lang: "vi",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
