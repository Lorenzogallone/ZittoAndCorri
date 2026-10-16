// Geometria di base sulle tracce GPS. Funzioni pure.

export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
}

/** Distanza Haversine tra due punti GPS (metri). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distanza cumulata (m) per ogni punto. I salti più veloci di `maxSpeed` m/s
 * sono glitch del GPS e non aggiungono distanza.
 */
export function cumulativeDistance(points: TrackPoint[], maxSpeed = 12): number[] {
  const out = new Array<number>(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const seg = haversineM(prev.lat, prev.lon, curr.lat, curr.lon);
    const dt = curr.t - prev.t;
    const valid = Number.isFinite(seg) && dt > 0 && seg / dt <= maxSpeed;
    out[i] = out[i - 1] + (valid ? seg : 0);
  }
  return out;
}
