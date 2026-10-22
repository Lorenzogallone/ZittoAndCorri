"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Activity, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Coach", icon: MessageCircle },
  { href: "/activities", label: "Corse", icon: Activity },
  { href: "/plan", label: "Piano", icon: Calendar },
  { href: "/profile", label: "Profilo", icon: User },
] as const;

export function TabBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="z-50 shrink-0 border-t border-border/60 bg-background" role="tablist">
      {/* Solo una piccola parte della safe-area in basso: la barra siede vicino
          alla home-indicator senza il gap dell'intera env(safe-area-inset-bottom). */}
      <div
        className="mx-auto flex max-w-md items-center justify-around px-3"
        style={{
          paddingTop: "6px",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px) - 14px, 6px)",
        }}
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              role="tab"
              aria-selected={active}
              className="group flex flex-1 flex-col items-center gap-0.5"
            >
              <span
                className={cn(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-all duration-300 ease-out group-active:scale-90",
                  active ? "bg-primary/12 text-primary" : "text-muted-foreground",
                )}
              >
                <Icon size={21} strokeWidth={active ? 2.3 : 1.8} />
              </span>
              <span
                className={cn(
                  "text-micro font-medium tracking-wide transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
