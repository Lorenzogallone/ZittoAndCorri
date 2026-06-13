import { TabBar } from "@/components/tab-bar";
import { BackButton } from "@/components/back-button";

interface AppShellProps {
  children: React.ReactNode;
  /** Optional page title shown at the top */
  title?: string;
  /** Optional action element rendered on the right side of the header */
  headerAction?: React.ReactNode;
  /** Hide tab bar (e.g., for forms or detail views) */
  hideTabBar?: boolean;
  /** Optional back link (shows ← instead of title) */
  backHref?: string;
  /** Label for the back link */
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
  const hasHeader = !!(title || headerAction || backHref);

  return (
    // Full-height flex column locked to the dynamic viewport. Header and tab
    // bar stay in normal flow (top / bottom), only the content scrolls. This
    // keeps the tab bar glued to the very bottom of the screen on every page,
    // regardless of how much content there is — fixing the "floats up on short
    // pages" issue on iOS Safari (where `position: fixed` anchors to the large
    // layout viewport). L'altezza (con fallback vh → dvh) è gestita interamente
    // da `.app-viewport`: niente `h-screen` qui, così su iPhone 15 in standalone
    // vince `100dvh` e la tab bar resta incollata in basso senza gap.
    <div className="app-viewport flex flex-col overflow-hidden">
      {/* Header */}
      {hasHeader && (
        <header className="z-40 shrink-0 glass-strong border-b border-border pt-safe">
          <div className="mx-auto flex h-12 max-w-lg items-center justify-between px-5">
            {backHref ? (
              <BackButton fallbackHref={backHref} label={backLabel} />
            ) : (
              <h1 className="text-lg font-semibold tracking-tight">
                {title}
              </h1>
            )}
            {headerAction && <div>{headerAction}</div>}
          </div>
        </header>
      )}

      {/* Content (the only scrollable region) */}
      <main
        className="min-h-0 flex-1 overflow-y-auto scroll-touch"
        style={
          !hasHeader
            ? { paddingTop: "env(safe-area-inset-top, 0px)" }
            : undefined
        }
      >
        <div className="mx-auto w-full max-w-lg px-5 py-6">
          {children}
        </div>
      </main>

      {/* Tab Bar — in normal flow, always pinned to the bottom */}
      {!hideTabBar && <TabBar />}
    </div>
  );
}

