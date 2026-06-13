"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Activity, Calendar, User } from "lucide-react";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/activities", label: "Corse", icon: Activity },
  { href: "/plan", label: "Piano", icon: Calendar },
  { href: "/settings", label: "Profilo", icon: User },
] as const;

export function TabBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="z-50 shrink-0 glass-strong border-t border-border"
      role="tablist"
    >
      {/* Padding inferiore ridotto: lasciamo solo una piccola parte della
          safe-area (home-indicator) così la barra siede più in basso, senza il
          gap eccessivo dato dall'intera env(safe-area-inset-bottom). */}
      <div
        className="mx-auto flex max-w-md items-center justify-around px-2"
        style={{
          paddingTop: "2px",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px) - 16px, 4px)",
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
              className={`flex flex-col items-center gap-0 px-3 py-1 transition-all duration-200 ${
                active
                  ? "text-primary scale-105"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.2 : 1.6}
                className="transition-all duration-200"
              />
              <span className="text-[10px] font-medium tracking-wide">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
