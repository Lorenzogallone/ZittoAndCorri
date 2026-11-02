import type { MetadataRoute } from "next";

const SHORTCUT_ICON = [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }];

export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` stabile: l'installazione resta la stessa anche se cambia start_url.
    id: "/",
    name: "Zitto e Corri",
    short_name: "Zitto&Corri",
    description: "Il tuo coach di corsa personale. Traccia, migliora, corri.",
    lang: "it",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    categories: ["sports", "health", "fitness"],
    // Combacia con lo sfondo dello splash scuro (#pwa-splash in components/pwa-splash.tsx) così la schermata
    // di avvio nativa di iOS sfuma senza stacchi nello splash dell'app.
    background_color: "#101010",
    theme_color: "#101010",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Omino chiaro all'80% su fondo #101010 (lo stesso dello splash): resta
      // dentro la safe zone delle maschere (cerchio, squircle) di Android.
      {
        src: "/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Nuova corsa",
        short_name: "Nuova corsa",
        description: "Registra o importa una corsa",
        url: "/activities/new",
        icons: SHORTCUT_ICON,
      },
      {
        name: "Piano",
        short_name: "Piano",
        description: "Il piano di allenamento",
        url: "/plan",
        icons: SHORTCUT_ICON,
      },
      {
        name: "Coach",
        short_name: "Coach",
        description: "Chiedi al coach",
        url: "/",
        icons: SHORTCUT_ICON,
      },
    ],
  };
}
