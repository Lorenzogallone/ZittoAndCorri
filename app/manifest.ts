import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zitto e Corri",
    short_name: "Zitto&Corri",
    description: "Il tuo coach di corsa personale. Traccia, migliora, corri.",
    start_url: "/",
    display: "standalone",
    // Combacia con lo sfondo dello splash scuro (#pwa-splash) così la schermata
    // di avvio nativa di iOS sfuma senza stacchi nello splash dell'app.
    background_color: "#16161f",
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
