import { TabBar } from "@/components/tab-bar";
import { BackButton } from "@/components/back-button";

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
}

export function AppShell({
  children,
  title,
  headerAction,
  hideTabBar = false,
  backHref,
  backLabel,
}: AppShellProps) {
  return (
    // Colonna a tutta altezza: solo il contenuto scorre, tab bar sempre in
    // fondo. La safe-area in alto è uno spazio pieno (niente vetro sfocato):
    // su iPhone in PWA la status bar resta pulita, senza sfumature, e il
    // contenuto non le passa sotto. `.app-viewport` gestisce 100dvh/100vh.
    <div className="app-viewport flex h-screen flex-col overflow-hidden bg-background">
      <div className="pt-safe shrink-0 bg-background" />

      {backHref && (
        <header className="z-40 shrink-0 bg-background">
          <div className="mx-auto flex h-11 max-w-lg items-center justify-between px-5">
            <BackButton fallbackHref={backHref} label={backLabel} />
            {headerAction && <div>{headerAction}</div>}
          </div>
        </header>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto scroll-touch">
        <div className="animate-enter mx-auto h-full w-full max-w-lg px-5 pb-8 pt-3">
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
