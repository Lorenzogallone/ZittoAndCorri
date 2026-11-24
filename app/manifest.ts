import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";

const SHORTCUT_ICON = [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }];

/**
 * Legge la lingua dalla richiesta (cookie, poi Accept-Language): il manifest
 * diventa dinamico. Il browser può chiederlo senza cookie: allora vale la
 * lingua del telefono.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [t, locale] = await Promise.all([getTranslations("status.manifest"), getLocale()]);
  return {
    // `id` stabile: l'installazione resta la stessa anche se cambia start_url.
    id: "/",
    name: "Zitto e Corri",
    short_name: "Zitto&Corri",
    description: t("description"),
    lang: locale,
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
        name: t("shortcuts.newRun.name"),
        short_name: t("shortcuts.newRun.name"),
        description: t("shortcuts.newRun.description"),
        url: "/activities/new",
        icons: SHORTCUT_ICON,
      },
      {
        name: t("shortcuts.plan.name"),
        short_name: t("shortcuts.plan.name"),
        description: t("shortcuts.plan.description"),
        url: "/plan",
        icons: SHORTCUT_ICON,
      },
      {
        name: t("shortcuts.coach.name"),
        short_name: t("shortcuts.coach.name"),
        description: t("shortcuts.coach.description"),
        url: "/",
        icons: SHORTCUT_ICON,
      },
    ],
  };
}
