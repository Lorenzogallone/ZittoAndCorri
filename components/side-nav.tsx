"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Calendar, MessageCircle, Plus, Settings, User } from "lucide-react";
import { RunnerMark } from "@/components/runner-mark";
import { cn } from "@/lib/utils";

// Navigazione laterale della versione desktop (da lg in su). Sul telefono
// resta la tab bar in basso: questa barra non viene mai mostrata.
const items = [
  { href: "/", label: "Coach", icon: MessageCircle },
  { href: "/activities", label: "Corse", icon: Activity },
  { href: "/plan", label: "Piano", icon: Calendar },
  { href: "/profile", label: "Profilo", icon: User },
] as const;

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
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/60 bg-card px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 rounded-xl px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
        <RunnerMark size={30} cutout="var(--card)" className="text-primary" />
        <span className="font-display text-heading font-bold tracking-tight">Zitto e Corri</span>
      </Link>
      <nav aria-label="Navigazione principale" className="grid gap-1">
        {items.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>
      <div className="mt-auto grid gap-1">
        <Link
          href="/activities/new"
          className="mb-2 flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-caption font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <Plus size={17} /> Registra un&apos;attività
        </Link>
        <NavLink href="/settings" label="Impostazioni" icon={Settings} active={isActive("/settings")} />
      </div>
    </aside>
  );
}
