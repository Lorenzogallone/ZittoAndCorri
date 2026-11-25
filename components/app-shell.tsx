import { TabBar } from "@/components/tab-bar";
import { BackButton } from "@/components/back-button";
import { SideNav } from "@/components/side-nav";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  /** Large title at the top of the content (scrolls with the page) */
  title?: string;
  /** Action to the right of the title (or of the bar with the back button) */
  headerAction?: React.ReactNode;
  /** Hides the tab bar (forms and details) */
  hideTabBar?: boolean;
  /** "Back" link: shows a minimal bar at the top */
  backHref?: string;
  /** Label of the back link */
  backLabel?: string;
  /** Full-height content (home with the chat): minimal margin above the tab bar. */
  fill?: boolean;
  /** Desktop: wide page (multi-column grids). Nothing changes on phones. */
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
  // From lg up: sidebar instead of the tab bar and a wider column.
  // All desktop classes have the lg: prefix, so the phone stays as is.
  // "wide" pages grow with the screen: 1152px, then 1280px from 2xl,
  // then 1792px on large monitors (3xl), where grids switch to 3 columns.
  const width = wide ? "lg:max-w-6xl 2xl:max-w-7xl 3xl:max-w-8xl" : "lg:max-w-3xl";
  return (
    // Full-height column: only the content scrolls, tab bar always at
    // the bottom. The top safe area is a solid space (no blurred glass):
    // on iPhone in a PWA the status bar stays clean, without gradients, and the
    // content does not pass under it. `.app-viewport` handles 100dvh/100vh.
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

      {/* The scrolling container: pull down from the top to reload. */}
      <PullToRefresh className="min-h-0 flex-1 overflow-y-auto scroll-touch">
        <div className={cn("animate-enter mx-auto h-full w-full max-w-lg px-5 pt-3 lg:px-10", width, fill ? "pb-2 lg:pb-6 lg:pt-6" : "pb-8 lg:pb-12 lg:pt-8")}>
          {title && (
            <div className="mb-5 flex items-center justify-between gap-3 pt-2">
              <h1 className="font-display text-display font-bold tracking-tight">{title}</h1>
              {!backHref && headerAction}
            </div>
          )}
          {children}
        </div>
      </PullToRefresh>

      {!hideTabBar && <TabBar />}
    </div>
  );
}
