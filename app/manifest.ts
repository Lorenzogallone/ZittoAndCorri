import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zitto e Corri",
    short_name: "Zitto&Corri",
    description: "Il tuo coach di corsa personale. Traccia, migliora, corri.",
    start_url: "/",
    display: "standalone",
    // Combacia con lo sfondo dello splash scuro (#pwa-splash in components/pwa-splash.tsx) così la schermata
    // di avvio nativa di iOS sfuma senza stacchi nello splash dell'app.
    background_color: "#101010",
    theme_color: "#101010",
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
