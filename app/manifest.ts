import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zitto e Corri",
    short_name: "Zitto&Corri",
    description: "Il tuo coach di corsa personale. Traccia, migliora, corri.",
    start_url: "/",
    display: "standalone",
    background_color: "#121214",
    theme_color: "#1a1a2e",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
