"use client";

import type { ReactNode } from "react";
import { SegmentedTabs } from "@/components/segmented-tabs";

/** Tab delle impostazioni: la scelta resta nell'URL, così un ricarico non la perde. */
export function SettingsTabs({
  tabs,
  initial,
}: {
  tabs: Array<{ key: string; label: string; content: ReactNode }>;
  initial: string;
}) {
  return (
    <SegmentedTabs
      tabs={tabs}
      initial={initial}
      onChange={(key) => window.history.replaceState(null, "", `/settings?tab=${key}`)}
    />
  );
}
