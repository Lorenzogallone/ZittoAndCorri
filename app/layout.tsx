import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/navigation-progress";
import { PwaRegister } from "@/components/pwa-register";
import { PwaSplash } from "@/components/pwa-splash";
import { PwaDiagnostics } from "@/components/pwa-diagnostics";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { ThemeWatcher } from "@/components/theme-watcher";
import { createClient } from "@/lib/supabase/server";
import { themeInitScript, sanitizePrefs, type ThemePrefs } from "@/lib/theme";
import "./globals.css";


const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Condensed display for titles and big numbers (not variable: explicit weights).
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  weight: ["600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zitto e Corri",
  description: "Il tuo coach di corsa personale.",
  appleWebApp: {
    capable: true,
    // Solid and not translucent: since iOS 26 with "black-translucent" the system
    // fades the first ~40pt of the app over the content. The colour comes from the
    // theme-color meta, aligned to the theme in applyThemeToDocument.
    statusBarStyle: "default",
    title: "Zitto e Corri",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#101010" },
  ],
};

/** Reads theme preferences from the profile (source of truth, cross-device sync).
 *  Tolerant: without a user, with errors or if migration 0005 is not yet
 *  applied returns null → the init script falls back to localStorage/default. */
async function getThemeSeed(): Promise<ThemePrefs | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("theme_mode, theme_accent, theme_style")
      .eq("id", user.id)
      .maybeSingle<{
        theme_mode: string | null;
        theme_accent: string | null;
        theme_style: string | null;
      }>();
    if (error || !data) return null;
    return sanitizePrefs({
      mode: data.theme_mode,
      accent: data.theme_accent,
      style: data.theme_style,
    });
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [themeSeed, locale] = await Promise.all([getThemeSeed(), getLocale()]);

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${barlowCondensed.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider>
          {/* Theme init: sets class (dark/light) and inline colour variables
              from the DB seed, BEFORE first paint (anti-FOUC + cross-device sync). */}
          <script dangerouslySetInnerHTML={{ __html: themeInitScript(themeSeed) }} />
          <PwaSplash />
          <PwaRegister />
          <PwaDiagnostics />
          <ThemeWatcher />
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
