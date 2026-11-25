import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";

const SHORTCUT_ICON = [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }];

/**
 * Reads the language from the request (cookie, then Accept-Language): the manifest
 * becomes dynamic. The browser may request it without a cookie: then the
 * phone's language applies.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [t, locale] = await Promise.all([getTranslations("status.manifest"), getLocale()]);
  return {
    // Stable `id`: the installation stays the same even if start_url changes.
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
    // Matches the dark splash background (#pwa-splash in components/pwa-splash.tsx) so the native iOS
    // launch screen fades into the app splash without a seam.
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
      // Light figure at 80% on a #101010 background (same as the splash): it stays
      // inside the safe zone of Android masks (circle, squircle).
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
