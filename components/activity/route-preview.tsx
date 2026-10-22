"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Map as MapIcon } from "lucide-react";
import { projectRoute } from "@/lib/route-path";
import { PACE_SCALE, pointSpeedColors } from "@/lib/metrics/pace-colors";
import type { GpsPoint } from "@/lib/types";

// La mappa interattiva (WebGL) parte solo su richiesta: su iOS standalone
// caricarla subito fa ricaricare la PWA per la memoria.
const ActivityMapClient = dynamic(() => import("@/components/activity-map-client"), { ssr: false });

const W = 340;
const H = 210;

/** Percorso disegnato e colorato per velocità; tocca per la mappa vera. */
export function RoutePreview({ gps }: { gps: GpsPoint[] }) {
  const [interactive, setInteractive] = useState(false);
  if (interactive) return <ActivityMapClient gpsSeries={gps} />;

  const points = projectRoute(gps, W, H, 18);
  const colors = pointSpeedColors(gps);
  if (points.length < 2) return null;
  // Spezzoni di pochi punti, ciascuno col colore della sua velocità.
  const chunk = Math.max(2, Math.ceil(points.length / 80));
  const segments: Array<{ d: string; color: string }> = [];
  for (let start = 0; start < points.length - 1; start += chunk) {
    const slice = points.slice(start, Math.min(points.length, start + chunk + 1));
    const mid = Math.min(points.length - 1, start + Math.floor(chunk / 2));
    segments.push({
      d: slice.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      color: colors?.[mid] ?? PACE_SCALE.mid,
    });
  }
  const [startX, startY] = points[0];
  const [endX, endY] = points[points.length - 1];

  return (
    <button
      type="button"
      onClick={() => setInteractive(true)}
      className="surface group relative block w-full overflow-hidden"
      aria-label="Apri la mappa del percorso"
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full bg-muted/40">
        {segments.map((segment, index) => (
          <path key={index} d={segment.d} fill="none" stroke={segment.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <circle cx={startX} cy={startY} r={5} fill="#10b981" stroke="var(--card)" strokeWidth={2} />
        <circle cx={endX} cy={endY} r={5} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2} />
      </svg>
      <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium shadow-sm transition-transform group-active:scale-95">
        <MapIcon size={13} /> Mappa
      </span>
      {colors && (
        <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1.5 text-micro font-medium text-muted-foreground">
          lento
          <span className="h-1.5 w-10 rounded-full" style={{ background: `linear-gradient(90deg, ${PACE_SCALE.slow}, ${PACE_SCALE.mid}, ${PACE_SCALE.fast})` }} />
          veloce
        </span>
      )}
    </button>
  );
}
