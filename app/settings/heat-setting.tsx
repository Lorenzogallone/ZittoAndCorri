"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setHeatAdjust } from "./actions";

const LABEL = "Adatta i passi al caldo";

export function HeatSetting({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await setHeatAdjust(next);
      if (result.error) {
        setEnabled(!next);
        setError(result.error);
      }
    });
  };

  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{LABEL}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Con caldo e umidità previsti rallenta i passi delle sedute, anche sull&apos;orologio.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={pending} aria-label={LABEL} />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
