"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageCircle, Activity, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";

// `fill`: icons with a closed area to fill when the tab is active; the
// others (open lines or inner details) just get a thicker stroke.
const tabs = [
  { href: "/", labelKey: "coach", icon: MessageCircle, fill: true },
  { href: "/activities", labelKey: "activities", icon: Activity, fill: false },
  { href: "/plan", labelKey: "plan", icon: Calendar, fill: false },
  { href: "/profile", labelKey: "profile", icon: User, fill: true },
] as const;

export function TabBar() {
  const t = useTranslations("shell");
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    // Stays the last element of the AppShell column (no position:
    // fixed): only the look changes, a pill floating over the background.
    <nav className="z-50 shrink-0 bg-background lg:hidden" role="tablist">
      {/* Only a small part of the bottom safe area: the bar sits close
          to the home indicator without the gap of the full env(safe-area-inset-bottom). */}
      <div
        className="mx-auto max-w-md"
        style={{
          paddingTop: "4px",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px) - 14px, 6px)",
        }}
      >
        <div className="mx-4 mb-1 flex items-center justify-around rounded-full bg-card/85 px-2 py-1 shadow-[0_8px_24px_-12px_oklch(0_0_0/0.25)] ring-1 ring-border/60 backdrop-blur-xl dark:ring-white/8">
          {tabs.map(({ href, labelKey, icon: Icon, fill }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                role="tab"
                aria-selected={active}
                className="pressable flex flex-1 flex-col items-center gap-0.5 pt-1 [--press-scale:0.92]"
              >
                <span
                  className={cn(
                    "flex h-6 items-center justify-center transition-colors duration-200 ease-out",
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
                  {t(`nav.${labelKey}`)}
                </span>
                {/* Active tab mark: a dot in the main colour. */}
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
