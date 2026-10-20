import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/navigation-progress";
import { PwaRegister } from "@/components/pwa-register";
import { PwaSplash } from "@/components/pwa-splash";
import { PwaDiagnostics } from "@/components/pwa-diagnostics";
import { ThemeWatcher } from "@/components/theme-watcher";
import { createClient } from "@/lib/supabase/server";
import { themeInitScript, sanitizePrefs, type ThemePrefs } from "@/lib/theme";
import "./globals.css";


const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zitto e Corri",
  description: "Il tuo coach di corsa personale.",
  appleWebApp: {
    capable: true,
    // Piena e non traslucida: da iOS 26 con "black-translucent" il sistema
    // sfuma i primi ~40pt dell'app sopra i contenuti. Il colore arriva dal
    // meta theme-color, allineato al tema in applyThemeToDocument.
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
    { media: "(prefers-color-scheme: light)", color: "#fbfaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
  ],
};

/** Legge le preferenze tema dal profilo (sorgente di verità, sync cross-device).
 *  Tollerante: senza utente, con errori o se la migration 0005 non è ancora
 *  applicata torna null → l'init script ripiega su localStorage/default. */
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
  const themeSeed = await getThemeSeed();

  return (
    <html
      lang="it"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Theme init: imposta classe (dark/light) e variabili colore inline
            dal seed DB, PRIMA del primo paint (anti-FOUC + sync cross-device). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(themeSeed) }} />
        <PwaSplash />
        <PwaRegister />
        <PwaDiagnostics />
        <ThemeWatcher />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
