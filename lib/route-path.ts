// Traccia GPS → path SVG che riempie un riquadro mantenendo le proporzioni.
// Funzione pura.

export function routeSvgPath(
  points: Array<{ lat: number; lon: number }>,
  width: number,
  height: number,
  padding = 0,
): string | null {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (valid.length < 2) return null;
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
  return xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${(offsetX + (x - minX) * scale).toFixed(1)},${(offsetY + (ys[i] - minY) * scale).toFixed(1)}`)
    .join(" ");
}
