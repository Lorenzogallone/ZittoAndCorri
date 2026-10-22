"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Activity, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";

// `fill`: icone con un'area chiusa da riempire quando la tab è attiva; le
// altre (linee aperte o dettagli interni) prendono solo un tratto più spesso.
const tabs = [
  { href: "/", label: "Coach", icon: MessageCircle, fill: true },
  { href: "/activities", label: "Corse", icon: Activity, fill: false },
  { href: "/plan", label: "Piano", icon: Calendar, fill: false },
  { href: "/profile", label: "Profilo", icon: User, fill: true },
] as const;

export function TabBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    // Resta l'ultimo elemento della colonna di AppShell (niente position:
    // fixed): cambia solo l'aspetto, una pillola che galleggia sullo sfondo.
    <nav className="z-50 shrink-0 bg-background" role="tablist">
      {/* Solo una piccola parte della safe-area in basso: la barra siede vicino
          alla home-indicator senza il gap dell'intera env(safe-area-inset-bottom). */}
      <div
        className="mx-auto max-w-md"
        style={{
          paddingTop: "4px",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px) - 14px, 6px)",
        }}
      >
        <div className="mx-4 mb-1 flex items-center justify-around rounded-full bg-card/85 px-2 py-1 shadow-[0_8px_24px_-12px_oklch(0_0_0/0.25)] ring-1 ring-border/60 backdrop-blur-xl dark:ring-white/8">
          {tabs.map(({ href, label, icon: Icon, fill }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                role="tab"
                aria-selected={active}
                className="group flex flex-1 flex-col items-center gap-0.5 pt-1"
              >
                <span
                  className={cn(
                    "flex h-6 items-center justify-center transition-[color,transform] duration-200 ease-out group-active:scale-90",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? (fill ? 2 : 2.5) : 1.8}
                    fill={active && fill ? "currentColor" : "none"}
                  />
                </span>
                <span
                  className={cn(
                    "text-micro transition-colors",
                    active ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {/* Segno della tab attiva: puntino nel colore principale. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1 w-1 rounded-full bg-primary transition-[opacity,transform] duration-200",
                    active ? "scale-100 opacity-100" : "scale-0 opacity-0",
                  )}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
