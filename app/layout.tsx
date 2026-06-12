import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/navigation-progress";
import { PwaRegister } from "@/components/pwa-register";
import { PwaSplashLoader } from "@/components/pwa-splash-loader";
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
    statusBarStyle: "black-translucent",
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
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a2e" },
  ],
};

// Splash PWA pre-hydration: arriva con l'HTML del server (CSS+markup+script
// inline) così appare appena la risposta viene parsata, prima del JS. È
// renderizzato via dangerouslySetInnerHTML in un wrapper che React tratta come
// contenuto opaco: lo script può rimuovere il nodo interno PRIMA dell'hydration
// (browser normale o navigazioni successive) senza causare mismatch — React
// non riconcilia mai i figli del wrapper. PwaSplashLoader lo dissolve dopo
// l'hydration alla prima apertura standalone.
const PWA_SPLASH_HTML = `
<style>
  #pwa-splash{display:none}
  @media (display-mode: standalone){
    #pwa-splash{display:flex;position:fixed;inset:0;z-index:99999;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:#f8f6f1;transition:opacity .3s ease}
    @media (prefers-color-scheme: dark){#pwa-splash{background:#16161f}}
    #pwa-splash .ps-icon{display:flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:24px;background:rgba(232,118,90,.12);color:#e8765a;animation:ps-pulse 1.6s ease-in-out infinite}
    #pwa-splash h1{margin:0;font-size:24px;font-weight:700;letter-spacing:-.02em;color:#1c1c21;text-align:center;font-family:var(--font-inter),system-ui,sans-serif}
    #pwa-splash p{margin:6px 0 0;font-size:12px;font-weight:500;color:#8b8b94;text-align:center;font-family:var(--font-inter),system-ui,sans-serif}
    @media (prefers-color-scheme: dark){#pwa-splash h1{color:#f4f4f5}}
    #pwa-splash .ps-track{position:relative;width:128px;height:4px;margin-top:8px;border-radius:9999px;overflow:hidden;background:rgba(139,139,148,.25)}
    #pwa-splash .ps-bar{position:absolute;top:0;bottom:0;left:0;width:50%;border-radius:9999px;background:#e8765a;animation:ps-load 1.5s infinite ease-in-out}
    @keyframes ps-pulse{0%,100%{opacity:1}50%{opacity:.55}}
    @keyframes ps-load{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
  }
</style>
<div id="pwa-splash" aria-hidden="true">
  <div class="ps-icon">
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  </div>
  <div>
    <h1>Zitto e Corri</h1>
    <p>Il tuo coach di corsa personale</p>
  </div>
  <div class="ps-track"><div class="ps-bar"></div></div>
</div>
<script>(function(){try{var s=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!s||sessionStorage.getItem("pwa-splash-shown")){var e=document.getElementById("pwa-splash");if(e)e.remove();}}catch(err){}})();</script>
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <div
          id="pwa-splash-root"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: PWA_SPLASH_HTML }}
        />
        <PwaRegister />
        <PwaSplashLoader />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
