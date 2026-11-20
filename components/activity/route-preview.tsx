"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { mapView, type MapTile } from "@/lib/route-path";
import { PACE_SCALE, pointSpeedColors } from "@/lib/metrics/pace-colors";
import { useSegmentSelection } from "@/components/activity/segment-selection";
import type { RepOnMap } from "@/components/activity-map-client";
import type { GpsPoint } from "@/lib/types";

// Mappa interattiva (WebGL) di base, ma solo quando la card entra nello schermo
// e con memoria contenuta: su iOS standalone una mappa pesante fa ricaricare la
// PWA. Sotto c'è un'anteprima statica (tessere raster e percorso) che si vede
// subito e resta se WebGL non parte.
const ActivityMapClient = dynamic(() => import("@/components/activity-map-client"), { ssr: false });

const W = 340;
const H = 210;

/** Tema scuro attivo: classe forzata sull'<html>, altrimenti preferenza di sistema. */
function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function isDarkTheme(): boolean {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Null sul server: le tessere arrivano dopo l'idratazione, il percorso subito. */
function useDarkTheme(): boolean | null {
  return useSyncExternalStore(subscribeTheme, isDarkTheme, () => null);
}

const tileUrl = (tile: MapTile, dark: boolean) =>
  `https://${"abcd"[(tile.x + tile.y) % 4]}.basemaps.cartocdn.com/${dark ? "dark_all" : "light_all"}/${tile.z}/${tile.x}/${tile.y}@2x.png`;

/** Monta la mappa WebGL quando il riquadro è vicino allo schermo. */
function useNearViewport<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin: "200px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near] as const;
}

/** Percorso colorato per velocità su mappa interattiva, con anteprima statica sotto. */
export function RoutePreview({ gps }: { gps: GpsPoint[] }) {
  const dark = useDarkTheme();
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const { segments: spans, selected } = useSegmentSelection();
  // Ripetute sempre sul percorso, numerate; il tratto scelto nella card (anche
  // un recupero) in primo piano.
  const reps = useMemo<RepOnMap[]>(() => {
    let number = 0;
    return spans.flatMap<RepOnMap>((segment) => {
      if (segment.kind === "work") return [{ index: segment.index, number: ++number, start: segment.start, end: segment.end }];
      return segment.index === selected ? [{ index: segment.index, number: null, start: segment.start, end: segment.end }] : [];
    });
  }, [spans, selected]);

  const view = mapView(gps, W, H, 18);
  if (!view) return null;
  const { points, tiles } = view;
  const colors = pointSpeedColors(gps);
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
  const outline = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const repPaths = reps.flatMap((rep) => {
    const inside = points.filter((_, i) => gps[i].t >= rep.start && gps[i].t <= rep.end);
    if (inside.length < 2) return [];
    const emphasis = selected == null ? 1 : selected === rep.index ? 2 : 0;
    return [{ ...rep, emphasis, d: inside.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "), first: inside[0] }];
  });
  const [startX, startY] = points[0];
  const [endX, endY] = points[points.length - 1];

  return (
    <div ref={ref} className="surface relative w-full overflow-hidden" role="region" aria-label="Mappa del percorso">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="block h-auto w-full bg-muted/40 lg:h-96" aria-hidden>
        {dark != null && (
          <g aria-hidden>
            {tiles.map((tile) => (
              <image
                key={`${tile.z}/${tile.x}/${tile.y}`}
                href={tileUrl(tile, dark)}
                x={tile.left}
                y={tile.top}
                width={tile.size + 0.5}
                height={tile.size + 0.5}
                preserveAspectRatio="none"
              />
            ))}
          </g>
        )}
        {/* Bordo del colore della card: il percorso resta leggibile su strade e scritte. */}
        <path d={outline} fill="none" stroke="var(--card)" strokeOpacity={0.85} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        {segments.map((segment, index) => (
          <path key={index} d={segment.d} fill="none" stroke={segment.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* Ripetute: linea chiara numerata; con un tratto scelto le altre si attenuano. */}
        {repPaths.map((rep) => (
          <g key={rep.index} opacity={rep.emphasis === 0 ? 0.35 : 1}>
            <path d={rep.d} fill="none" stroke="black" strokeOpacity={0.45} strokeWidth={rep.emphasis === 2 ? 10 : 8} strokeLinecap="round" strokeLinejoin="round" />
            <path d={rep.d} fill="none" stroke="white" strokeWidth={rep.emphasis === 2 ? 6 : 4} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
        {repPaths.filter((rep) => rep.number != null).map((rep) => (
          <g key={`n${rep.index}`} opacity={rep.emphasis === 0 ? 0.4 : 1}>
            <circle cx={rep.first[0]} cy={rep.first[1]} r={7} fill="white" stroke="black" strokeOpacity={0.4} />
            <text x={rep.first[0]} y={rep.first[1] + 3.5} textAnchor="middle" className="fill-black text-micro font-bold">{rep.number}</text>
          </g>
        ))}
        <circle cx={startX} cy={startY} r={5} fill="#10b981" stroke="var(--card)" strokeWidth={2} />
        <circle cx={endX} cy={endY} r={5} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2} />
      </svg>
      {near && !failed && <ActivityMapClient gpsSeries={gps} embedded onFail={onFail} reps={reps} selected={selected} />}
      {colors && (
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1.5 text-micro font-medium text-muted-foreground">
          lento
          <span className="h-1.5 w-10 rounded-full" style={{ background: `linear-gradient(90deg, ${PACE_SCALE.slow}, ${PACE_SCALE.mid}, ${PACE_SCALE.fast})` }} />
          veloce
        </span>
      )}
      <span className="pointer-events-none absolute bottom-1 right-2 text-micro text-muted-foreground/80">© OpenStreetMap © CARTO</span>
    </div>
  );
}
