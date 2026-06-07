// Funzione pura: split per km da gps_series. PLAN.md §7.
// Se manca il GPS ritorna null — niente dati, niente numeri inventati.

import type { GpsPoint, HrPoint, Split } from "@/lib/types";

/** Distanza Haversine tra due punti GPS (metri). */
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcola gli split per km da una serie GPS (e opzionalmente HR).
 * Accumula i metri con Haversine; ogni 1000 m registra km, tempo e HR media.
 * Ritorna null se la serie è vuota o ha meno di 2 punti.
 */
export function computeSplits(
  gps_series: GpsPoint[],
  hr_series?: HrPoint[],
): Split[] | null {
  if (!gps_series || gps_series.length < 2) return null;

  const splits: Split[] = [];
  let kmAccum = 0;
  let kmCount = 1;
  let splitStart = gps_series[0].t;
  let hrSum = 0;
  let hrCount = 0;

  // Indice corrente in hr_series per il lookup
  let hrIdx = 0;

  for (let i = 1; i < gps_series.length; i++) {
    const prev = gps_series[i - 1];
    const curr = gps_series[i];
    const seg = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    const remaining = 1000 - kmAccum;

    // Avanza hr_series fino al tempo corrente
    if (hr_series) {
      while (hrIdx < hr_series.length && hr_series[hrIdx].t <= curr.t) {
        hrSum += hr_series[hrIdx].bpm;
        hrCount++;
        hrIdx++;
      }
    }

    if (seg >= remaining) {
      // Interpolazione lineare del tempo al confine del km
      const frac = remaining / seg;
      const tAtBoundary = prev.t + frac * (curr.t - prev.t);

      splits.push({
        km: kmCount,
        time_s: Math.round(tAtBoundary - splitStart),
        ...(hrCount > 0 ? { avg_hr: Math.round(hrSum / hrCount) } : {}),
      });

      kmCount++;
      kmAccum = seg - remaining;
      splitStart = tAtBoundary;
      hrSum = 0;
      hrCount = 0;
    } else {
      kmAccum += seg;
    }
  }

  return splits.length > 0 ? splits : null;
}
