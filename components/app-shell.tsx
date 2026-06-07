import { TabBar } from "@/components/tab-bar";

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
  return (
    <div className="flex min-h-svh flex-col">
      {/* Header */}
      {(title || headerAction || backHref) && (
        <header className="sticky top-0 z-40 glass-strong border-b border-white/[0.06] pt-safe">
          <div className="mx-auto flex h-12 max-w-lg items-center justify-between px-5">
            {backHref ? (
              <a
                href={backHref}
                className="text-muted-foreground text-sm hover:text-foreground transition-colors"
              >
                ← {backLabel ?? "Indietro"}
              </a>
            ) : (
              <h1 className="text-lg font-semibold tracking-tight">
                {title}
              </h1>
            )}
            {headerAction && <div>{headerAction}</div>}
          </div>
        </header>
      )}

      {/* Content */}
      <main
        className="flex-1 scroll-touch"
        style={
          !hideTabBar
            ? { paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', paddingTop: !(title || headerAction || backHref) ? 'env(safe-area-inset-top, 0px)' : undefined }
            : { paddingBottom: '1.5rem', paddingTop: !(title || headerAction || backHref) ? 'env(safe-area-inset-top, 0px)' : undefined }
        }
      >
        <div className="mx-auto w-full max-w-lg px-5 py-6">
          {children}
        </div>
      </main>

      {/* Tab Bar */}
      {!hideTabBar && <TabBar />}
    </div>
  );
}
