import { TabBar } from "@/components/tab-bar";
import { BackButton } from "@/components/back-button";
import { SideNav } from "@/components/side-nav";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  /** Titolo grande in cima al contenuto (scorre con la pagina) */
  title?: string;
  /** Azione a destra del titolo (o della barra con il pulsante indietro) */
  headerAction?: React.ReactNode;
  /** Nasconde la tab bar (form e dettagli) */
  hideTabBar?: boolean;
  /** Link "indietro": mostra una barra minimale in alto */
  backHref?: string;
  /** Etichetta del link indietro */
  backLabel?: string;
  /** Contenuto a tutta altezza (home con la chat): margine minimo sopra la tab bar. */
  fill?: boolean;
  /** Desktop: pagina larga (griglie a più colonne). Sul telefono non cambia nulla. */
  wide?: boolean;
}

export function AppShell({
  children,
  title,
  headerAction,
  hideTabBar = false,
  backHref,
  backLabel,
  fill = false,
  wide = false,
}: AppShellProps) {
  // Da lg in su: barra laterale al posto della tab bar e colonna più larga.
  // Tutte le classi desktop hanno il prefisso lg:, così il telefono resta com'è.
  const width = wide ? "lg:max-w-6xl" : "lg:max-w-3xl";
  return (
    // Colonna a tutta altezza: solo il contenuto scorre, tab bar sempre in
    // fondo. La safe-area in alto è uno spazio pieno (niente vetro sfocato):
    // su iPhone in PWA la status bar resta pulita, senza sfumature, e il
    // contenuto non le passa sotto. `.app-viewport` gestisce 100dvh/100vh.
    <div className="app-viewport flex h-screen flex-col overflow-hidden bg-background lg:pl-60">
      <SideNav />
      <div className="pt-safe shrink-0 bg-background" />

      {backHref && (
        <header className="z-40 shrink-0 bg-background">
          <div className={cn("mx-auto flex h-11 max-w-lg items-center justify-between px-5 lg:mt-4 lg:px-10", width)}>
            <BackButton fallbackHref={backHref} label={backLabel} />
            {headerAction && <div>{headerAction}</div>}
          </div>
        </header>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto scroll-touch">
        <div className={cn("animate-enter mx-auto h-full w-full max-w-lg px-5 pt-3 lg:px-10", width, fill ? "pb-2 lg:pb-6 lg:pt-6" : "pb-8 lg:pb-12 lg:pt-8")}>
          {title && (
            <div className="mb-5 flex items-center justify-between gap-3 pt-2">
              <h1 className="font-display text-display font-bold tracking-tight">{title}</h1>
              {!backHref && headerAction}
            </div>
          )}
          {children}
        </div>
      </main>

      {!hideTabBar && <TabBar />}
    </div>
  );
}
