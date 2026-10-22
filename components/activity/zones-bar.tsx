import { formatDuration } from "@/lib/format";
import type { TimeInZone, ZoneKey } from "@/lib/types";

const ZONES: Array<{ key: ZoneKey; label: string; color: string }> = [
  { key: "z1", label: "Recupero", color: "bg-sky-400" },
  { key: "z2", label: "Fondo", color: "bg-emerald-400" },
  { key: "z3", label: "Medio", color: "bg-amber-400" },
  { key: "z4", label: "Soglia", color: "bg-orange-500" },
  { key: "z5", label: "Massimo", color: "bg-rose-500" },
];

/** Tempo nelle zone cardiache: una barra unica e i valori sotto. */
export function ZonesBar({ zones }: { zones: TimeInZone }) {
  const total = ZONES.reduce((sum, zone) => sum + (zones[zone.key] ?? 0), 0);
  if (total <= 0) return null;
  return (
    <div>
      <div className="animate-grow-x flex h-3 gap-[2px] overflow-hidden rounded-full">
        {ZONES.map((zone) => {
          const seconds = zones[zone.key] ?? 0;
          return seconds > 0 ? <div key={zone.key} className={zone.color} style={{ flexGrow: seconds / total }} /> : null;
        })}
      </div>
      <dl className="mt-4 grid grid-cols-5 gap-1 text-center">
        {ZONES.map((zone, index) => {
          const seconds = zones[zone.key] ?? 0;
          return (
            <div key={zone.key}>
              <dt className="flex items-center justify-center gap-1 text-micro text-muted-foreground" title={zone.label}>
                <span className={`h-1.5 w-1.5 rounded-full ${zone.color}`} />Z{index + 1}
              </dt>
              <dd className="mt-0.5 text-caption font-semibold tabular-nums">{Math.round((seconds / total) * 100)}%</dd>
              <dd className="text-micro text-muted-foreground tabular-nums">{formatDuration(seconds)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
