import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Couple Quest",
    short_name: "CoupleQuest",
    description: "两个人的任务与积分小游戏",
    start_url: "/",
    display: "standalone",
    background_color: "#fdf7f9",
    theme_color: "#fdf2f8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
