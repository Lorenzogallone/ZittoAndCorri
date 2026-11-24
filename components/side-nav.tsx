"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Activity, Calendar, MessageCircle, Plus, RefreshCw, Settings, User } from "lucide-react";
import { RunnerMark } from "@/components/runner-mark";
import { cn } from "@/lib/utils";
import { refreshMessage, useAppRefresh } from "@/lib/use-app-refresh";

// Navigazione laterale della versione desktop (da lg in su). Sul telefono
// resta la tab bar in basso: questa barra non viene mai mostrata.
const items = [
  { href: "/", labelKey: "coach", icon: MessageCircle },
  { href: "/activities", labelKey: "activities", icon: Activity },
  { href: "/plan", labelKey: "plan", icon: Calendar },
  { href: "/profile", labelKey: "profile", icon: User },
] as const;

/** Ripiego del trascina-giù su desktop: stessa ricarica (orologio + dati). */
function RefreshButton() {
  const t = useTranslations("shell");
  const { refreshing, result, refresh } = useAppRefresh();
  const message = refreshing ? t("refreshButton.busy") : refreshMessage(result);
  return (
    <button
      type="button"
      onClick={refresh}
      disabled={refreshing}
      className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-body font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-70"
    >
      <RefreshCw size={19} strokeWidth={1.9} className={cn(refreshing && "animate-spin text-primary")} />
      <span className="min-w-0">
        {t("refreshButton.label")}
        {message && <span aria-live="polite" className={cn("block truncate text-micro", result?.error && !refreshing ? "text-destructive" : "text-muted-foreground")}>{message}</span>}
      </span>
    </button>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof User; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-body outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/30",
        active ? "bg-primary/10 font-semibold text-foreground" : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon size={19} strokeWidth={active ? 2.3 : 1.9} className={active ? "text-primary" : undefined} />
      {label}
    </Link>
  );
}

export function SideNav() {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/60 bg-card px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 rounded-xl px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
        <RunnerMark size={30} cutout="var(--card)" className="text-primary" />
        <span className="font-display text-heading font-bold tracking-tight">Zitto e Corri</span>
      </Link>
      <nav aria-label={t("nav.main")} className="grid gap-1">
        {items.map(({ href, labelKey, icon }) => (
          <NavLink key={href} href={href} label={t(`nav.${labelKey}`)} icon={icon} active={isActive(href)} />
        ))}
      </nav>
      <div className="mt-auto grid gap-1">
        <Link
          href="/activities/new"
          className="mb-2 flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-caption font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <Plus size={17} /> {t("nav.registerActivity")}
        </Link>
        <RefreshButton />
        <NavLink href="/settings" label={t("nav.settings")} icon={Settings} active={isActive("/settings")} />
      </div>
    </aside>
  );
}
