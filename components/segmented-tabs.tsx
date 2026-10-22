"use client";

import { useState, type ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";

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
        <Segmented
          className="mb-4"
          size={tabs.length >= 4 ? "sm" : "md"}
          options={tabs.map(({ key, label }) => ({ key, label }))}
          value={current.key}
          onChange={(key) => {
            setActive(key);
            onChange?.(key);
          }}
        />
      )}
      <div key={current.key} className="animate-enter" role="tabpanel">
        {current.content}
      </div>
    </div>
  );
}
