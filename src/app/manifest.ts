import type { MetadataRoute } from "next";

// Manifest de la PWA (Next lo sirve en /manifest.webmanifest).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FinApp — Finanzas",
    short_name: "FinApp",
    description: "Administra las finanzas de tu hogar.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es",
    dir: "ltr",
    background_color: "#ffffff",
    theme_color: "#2563EB",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
