"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { mapView, type MapTile } from "@/lib/route-path";
import { PACE_SCALE, pointSpeedColors } from "@/lib/metrics/pace-colors";
import { useSegmentSelection } from "@/components/activity/segment-selection";
import type { RoutePart } from "@/components/activity-map-client";
import { segmentToneKey, TONE_LABELS, TONES, type ToneKey } from "@/lib/step-tones";
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

/** Percorso colorato per tratto (ripetute) o per velocità su mappa interattiva, con anteprima statica sotto. */
export function RoutePreview({ gps }: { gps: GpsPoint[] }) {
  const dark = useDarkTheme();
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const { segments: spans, selected } = useSegmentSelection();
  // Con le ripetute il percorso prende i colori dei tratti (come la card),
  // altrimenti quelli del passo. Un tratto scelto nella card resta in primo piano.
  const parts = useMemo<Array<RoutePart & { tone: ToneKey }> | null>(() => {
    if (!spans.some((segment) => segment.kind === "work")) return null;
    return spans.map((segment) => {
      const key = segmentToneKey(segment);
      return { index: segment.index, start: segment.start, end: segment.end, color: TONES[key].hex, tone: key };
    });
  }, [spans]);

  const view = mapView(gps, W, H, 18);
  if (!view) return null;
  const { points, tiles } = view;
  const colors = parts ? null : pointSpeedColors(gps);
  const partAt = (t: number) => parts?.find((part) => t >= part.start && t < part.end) ?? null;
  const path = (slice: Array<[number, number]>) => slice.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  // Spezzoni: con le ripetute uno per tratto, altrimenti di pochi punti col colore del passo.
  const pieces: Array<{ d: string; color: string; part: number | null }> = [];
  if (parts) {
    let from = 0;
    for (let i = 1; i <= points.length; i++) {
      const current = partAt(gps[from].t);
      if (i < points.length && partAt(gps[i].t) === current) continue;
      const slice = points.slice(from, Math.min(points.length, i + 1));
      if (slice.length >= 2) pieces.push({ d: path(slice), color: current?.color ?? TONES.easy.hex, part: current?.index ?? null });
      from = i;
    }
  } else {
    const chunk = Math.max(2, Math.ceil(points.length / 80));
    for (let start = 0; start < points.length - 1; start += chunk) {
      const mid = Math.min(points.length - 1, start + Math.floor(chunk / 2));
      pieces.push({ d: path(points.slice(start, Math.min(points.length, start + chunk + 1))), color: colors?.[mid] ?? PACE_SCALE.mid, part: null });
    }
  }
  const outline = path(points);
  const chosen = selected == null ? [] : pieces.filter((piece) => piece.part === selected);
  const legend = parts ? [...new Set(parts.map((part) => part.tone))] : [];
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
        {pieces.map((piece, index) => (
          <path
            key={index}
            d={piece.d}
            fill="none"
            stroke={piece.color}
            strokeOpacity={selected != null && piece.part !== selected ? 0.35 : 1}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {chosen.map((piece, index) => (
          <g key={`s${index}`}>
            <path d={piece.d} fill="none" stroke="var(--card)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
            <path d={piece.d} fill="none" stroke={piece.color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
        <circle cx={startX} cy={startY} r={5} fill="#10b981" stroke="var(--card)" strokeWidth={2} />
        <circle cx={endX} cy={endY} r={5} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2} />
      </svg>
      {near && !failed && <ActivityMapClient gpsSeries={gps} embedded onFail={onFail} parts={parts} selected={selected} />}
      {parts ? (
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-background/90 px-2.5 py-1.5 text-micro font-medium text-muted-foreground">
          {legend.map((key) => (
            <span key={key} className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONES[key].hex }} />
              {TONE_LABELS[key]}
            </span>
          ))}
        </span>
      ) : colors && (
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
