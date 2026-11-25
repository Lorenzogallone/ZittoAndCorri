"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GpsPoint } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { PACE_SCALE, paceGradientStops } from "@/lib/metrics/pace-colors";

interface ActivityMapClientProps {
  gpsSeries: GpsPoint[];
  /**
   * Inside the activity card, above the static preview: fills the
   * frame, shows only once the map is ready and pans with two fingers (with one
   * finger the page scrolls). onFail falls back to the preview if WebGL gives out.
   */
  embedded?: boolean;
  onFail?: () => void;
  /** Session segments with their colour (like the Repeats card): they replace the pace colours. */
  parts?: RoutePart[] | null;
  /** Segment chosen in the card: highlighted, the others dimmed. */
  selected?: number | null;
}

/** Segment to colour on the route (seconds from the start, real clock of the GPS points). */
export interface RoutePart {
  index: number;
  start: number;
  end: number;
  color: string;
}

export default function ActivityMapClient({ gpsSeries, embedded = false, onFail, parts = null, selected = null }: ActivityMapClientProps) {
  const t = useTranslations("activities.map");
  const touchHelp = t("touchHelp");
  const windowsHelp = t("windowsHelp");
  const macHelp = t("macHelp");
  const zoomIn = t("zoomIn");
  const zoomOut = t("zoomOut");
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [colored, setColored] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || gpsSeries.length < 2) return;

    // Detect the theme: the forced class (.dark/.light, set by the theme
    // init) takes priority; in auto mode it falls back to the system preference.
    const root = document.documentElement;
    const isDarkTheme = root.classList.contains("dark")
      ? true
      : root.classList.contains("light")
        ? false
        : window.matchMedia("(prefers-color-scheme: dark)").matches;

    const styleUrl = isDarkTheme
      ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      : "https://tiles.openfreemap.org/styles/positron";

    // Initialize MapLibre Map
    // Contained memory: on iOS in a PWA a heavy WebGL map makes the page reload.
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      attributionControl: false,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      maxTileCacheSize: 40,
      fadeDuration: 0,
      refreshExpiredTiles: false,
      cooperativeGestures: embedded,
      locale: {
        "CooperativeGesturesHandler.MobileHelpText": touchHelp,
        "CooperativeGesturesHandler.WindowsHelpText": windowsHelp,
        "CooperativeGesturesHandler.MacHelpText": macHelp,
        "NavigationControl.ZoomIn": zoomIn,
        "NavigationControl.ZoomOut": zoomOut,
      },
      dragRotate: false,
      pitchWithRotate: false,
    });

    mapRef.current = map;
    map.on("error", (event) => console.error("mappa:", event.error?.message));
    map.getCanvas().addEventListener("webglcontextlost", () => onFail?.(), { once: true });

    // Add zoom controls
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      setMapLoaded(true);

      const coordinates = gpsSeries.map((p) => [p.lon, p.lat]);

      // Calculate the boundaries of the route
      const bounds = new maplibregl.LngLatBounds();
      coordinates.forEach((coord) => bounds.extend(coord as [number, number]));

      // Fit bounds to display the full track with a nice padding
      map.fitBounds(bounds, {
        padding: { top: 40, bottom: 40, left: 40, right: 40 },
        animate: false,
      });

      // Route coloured by speed (yellow = slow, red = fast) when
      // the track has enough timing data, otherwise a single colour.
      const stops = paceGradientStops(gpsSeries);
      map.addSource("route", {
        type: "geojson",
        lineMetrics: true,
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: coordinates,
          },
        },
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: stops
          ? {
              "line-width": 5,
              "line-opacity": 0.95,
              "line-gradient": ["interpolate", ["linear"], ["line-progress"], ...stops.flat()] as maplibregl.ExpressionSpecification,
            }
          : {
              "line-color": PACE_SCALE.mid,
              "line-width": 5,
              "line-opacity": 0.9,
            },
      });
      setColored(Boolean(stops));

      // Session segments, with the Repeats card colours, above (and instead of) the pace.
      map.addSource("parts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "parts-casing",
        type: "line",
        source: "parts",
        filter: ["==", ["get", "emphasis"], 2],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "black", "line-opacity": 0.5, "line-width": 11 },
      });
      map.addLayer({
        id: "parts-line",
        type: "line",
        source: "parts",
        layout: { "line-join": "round", "line-cap": "round", "line-sort-key": ["get", "emphasis"] },
        paint: {
          "line-color": ["get", "color"],
          "line-opacity": ["match", ["get", "emphasis"], 0, 0.35, 1],
          "line-width": ["match", ["get", "emphasis"], 2, 7, 5],
        },
      });

      // Create Custom Start Marker (Green circle)
      const startPoint = coordinates[0];
      const startEl = document.createElement("div");
      startEl.className = "w-4.5 h-4.5 rounded-full border-2 border-white bg-emerald-500 shadow-lg";
      new maplibregl.Marker({ element: startEl })
        .setLngLat(startPoint as [number, number])
        .addTo(map);

      // Create Custom End Marker (Red/Rose circle)
      const endPoint = coordinates[coordinates.length - 1];
      const endEl = document.createElement("div");
      endEl.className = "w-4.5 h-4.5 rounded-full border-2 border-white bg-rose-500 shadow-lg flex items-center justify-center";
      new maplibregl.Marker({ element: endEl })
        .setLngLat(endPoint as [number, number])
        .addTo(map);
    });

    // Cleanup map instance on component unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [gpsSeries, embedded, onFail, touchHelp, windowsHelp, macHelp, zoomIn, zoomOut]);

  // Per-segment colours: updated when the choice in the card changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource("parts") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const list = parts ?? [];
    // With segments the pace gradient is not visible: two colour scales together confuse.
    if (map.getLayer("route-line")) map.setLayoutProperty("route-line", "visibility", list.length ? "none" : "visible");
    const features = list.flatMap((part, i) => {
      // Up to the first point of the next segment: no gaps between segments.
      const end = list[i + 1]?.start ?? part.end;
      const coordinates = gpsSeries.filter((p) => p.t >= part.start && p.t <= end).map((p) => [p.lon, p.lat]);
      if (coordinates.length < 2) return [];
      const emphasis = selected == null ? 1 : selected === part.index ? 2 : 0;
      return [{ type: "Feature" as const, properties: { emphasis, color: part.color }, geometry: { type: "LineString" as const, coordinates } }];
    });
    source.setData({ type: "FeatureCollection", features });
  }, [parts, selected, mapLoaded, gpsSeries]);

  if (embedded) {
    return (
      <div className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${mapLoaded ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-border bg-muted/40">
      {!mapLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/50 z-10 backdrop-blur-xs">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs font-medium">{t("loading")}</span>
        </div>
      )}
      <div ref={mapContainerRef} className="w-full h-full" />
      {colored && (
        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-micro font-medium text-muted-foreground backdrop-blur">
          {t("slow")}
          <span className="h-1.5 w-12 rounded-full" style={{ background: `linear-gradient(90deg, ${PACE_SCALE.slow}, ${PACE_SCALE.mid}, ${PACE_SCALE.fast})` }} />
          {t("fast")}
        </div>
      )}
    </div>
  );
}
