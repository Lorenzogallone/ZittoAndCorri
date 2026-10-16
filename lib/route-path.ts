// Traccia GPS → coordinate di disegno che riempiono un riquadro mantenendo le
// proporzioni (proiezione equirettangolare corretta per la latitudine).
// Funzioni pure.

/** Punti della traccia proiettati nel riquadro. */
export function projectRoute(
  points: Array<{ lat: number; lon: number }>,
  width: number,
  height: number,
  padding = 0,
): Array<[number, number]> {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (valid.length < 2) return [];
  const midLat = valid.reduce((sum, p) => sum + p.lat, 0) / valid.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = valid.map((p) => p.lon * kx);
  const ys = valid.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1e-9;
  const spanY = Math.max(...ys) - minY || 1e-9;
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return xs.map((x, i) => [offsetX + (x - minX) * scale, offsetY + (ys[i] - minY) * scale]);
}

/** Path SVG della traccia, o null se ha meno di due punti validi. */
export function routeSvgPath(
  points: Array<{ lat: number; lon: number }>,
  width: number,
  height: number,
  padding = 0,
): string | null {
  const projected = projectRoute(points, width, height, padding);
  if (projected.length < 2) return null;
  return projected.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}
