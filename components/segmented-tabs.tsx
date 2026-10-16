"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedTab {
  key: string;
  label: string;
  content: ReactNode;
}

/** Controllo a segmenti: una sola vista alla volta, cambio con animazione. */
export function SegmentedTabs({
  tabs,
  initial,
  className,
  onChange,
}: {
  tabs: SegmentedTab[];
  initial?: string;
  className?: string;
  onChange?: (key: string) => void;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div className={className}>
      {tabs.length > 1 && (
        <div
          className={cn("mb-4 grid rounded-xl bg-muted p-0.5 font-medium", tabs.length >= 4 ? "text-xs" : "text-[13px]")}
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          role="tablist"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.key === current.key}
              onClick={() => {
                setActive(tab.key);
                onChange?.(tab.key);
              }}
              className={cn(
                "min-w-0 truncate rounded-[10px] px-1 py-1.5 transition-all duration-200",
                tab.key === current.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground active:scale-95",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div key={current.key} className="animate-enter" role="tabpanel">
        {current.content}
      </div>
    </div>
  );
}
