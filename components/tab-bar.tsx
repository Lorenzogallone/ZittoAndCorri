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
      className="fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-white/[0.06]"
      role="tablist"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2" style={{ paddingTop: '4px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) / 2)' }}>
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              role="tab"
              aria-selected={active}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 transition-all duration-200 ${
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
