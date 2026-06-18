"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { GpsPoint } from "@/lib/types";

// Dynamically load the client-only map component with SSR disabled
const ActivityMapClient = dynamic(() => import("./activity-map-client"), {
  ssr: false,
  loading: () => (
    <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-border bg-muted/40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <span className="text-xs font-medium">Inizializzazione mappa…</span>
    </div>
  ),
});

interface ActivityMapProps {
  gpsSeries: GpsPoint[];
}

export default function ActivityMap({ gpsSeries }: ActivityMapProps) {
  return <ActivityMapClient gpsSeries={gpsSeries} />;
}
