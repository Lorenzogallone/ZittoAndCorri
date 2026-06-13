"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GpsPoint } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface ActivityMapClientProps {
  gpsSeries: GpsPoint[];
}

export default function ActivityMapClient({ gpsSeries }: ActivityMapClientProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || gpsSeries.length < 2) return;

    // Rileva il tema: la classe forzata (.dark/.light, impostata dal theme
    // init) ha priorità; in automatico si cade sulla preferenza di sistema.
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
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      attributionControl: false,
    });

    mapRef.current = map;

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

      // Add the route coordinate source
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: coordinates,
          },
        },
      });

      // Style and add the route track line (Coral/Orange color)
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#f06292", // Beautiful warm coral/pink tone matching the logo
          "line-width": 5,
          "line-opacity": 0.9,
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
  }, [gpsSeries]);

  return (
    <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-border bg-muted/40">
      {!mapLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/50 z-10 backdrop-blur-xs">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs font-medium">Caricamento mappa…</span>
        </div>
      )}
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
}
