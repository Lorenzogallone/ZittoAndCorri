"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Loader2 } from "lucide-react";
import type { GpsPoint } from "@/lib/types";

// La mappa (maplibre-gl / WebGL) viene caricata solo dopo l'interazione
// dell'utente: inizializzarla al montaggio della pagina causa un picco di
// memoria che su iOS standalone fa rilanciare la PWA allo splash. Così il
// primo render è leggero, il WebGL context parte solo quando serve.
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
  const [show, setShow] = useState(false);

  if (show) {
    return <ActivityMapClient gpsSeries={gpsSeries} />;
  }

  return (
    <button
      type="button"
      onClick={() => setShow(true)}
      className="relative w-full h-36 rounded-2xl overflow-hidden border border-border bg-muted/30 flex flex-col items-center justify-center gap-2.5 text-muted-foreground transition-colors hover:bg-muted/50 active:scale-[0.99]"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <MapPin size={20} className="text-primary" />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-sm font-semibold text-foreground">Mostra percorso</span>
        <span className="text-xs text-muted-foreground">
          {gpsSeries.length} punti GPS · Tocca per aprire la mappa
        </span>
      </div>
    </button>
  );
}
