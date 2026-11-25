// GPS track → drawing coordinates that fill a box while keeping the
// proportions (equirectangular projection corrected for latitude).
// Pure functions.

/** Track points projected into the box. */
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

/** SVG path of the track, or null if it has fewer than two valid points. */
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

/** Raster map tile (z/x/y scheme) to draw in the box. */
export interface MapTile {
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
  size: number;
}

const TILE = 256;
const MAX_ZOOM = 17;

/** Web Mercator coordinates at zoom 0 (world of 256 × 256). */
function mercator(lat: number, lon: number): [number, number] {
  const clamped = Math.max(-85.05, Math.min(85.05, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return [((lon + 180) / 360) * TILE, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE];
}

/**
 * Track and background tiles in the same projection (Web Mercator), with the
 * fractional zoom that makes the route fit the box. Tiles are from the lower
 * integer level, enlarged up to 2×: a real map without WebGL.
 */
export function mapView(
  points: Array<{ lat: number; lon: number }>,
  width: number,
  height: number,
  padding = 0,
): { points: Array<[number, number]>; tiles: MapTile[]; zoom: number } | null {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (valid.length < 2) return null;
  const world = valid.map((p) => mercator(p.lat, p.lon));
  const xs = world.map(([x]) => x);
  const ys = world.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const fit = Math.min(
    spanX > 0 ? (width - padding * 2) / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? (height - padding * 2) / spanY : Number.POSITIVE_INFINITY,
  );
  const zoom = Math.max(1, Math.min(MAX_ZOOM, Number.isFinite(fit) ? Math.log2(fit) : MAX_ZOOM));
  const scale = 2 ** zoom;
  const offsetX = (minX + spanX / 2) * scale - width / 2;
  const offsetY = (minY + spanY / 2) * scale - height / 2;
  const projected = world.map(([x, y]): [number, number] => [x * scale - offsetX, y * scale - offsetY]);

  const z = Math.floor(zoom);
  const size = TILE * 2 ** (zoom - z);
  const count = 2 ** z;
  const tiles: MapTile[] = [];
  for (let ty = Math.floor(offsetY / size); ty * size < offsetY + height; ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(offsetX / size); tx * size < offsetX + width; tx++) {
      tiles.push({ z, x: ((tx % count) + count) % count, y: ty, left: tx * size - offsetX, top: ty * size - offsetY, size });
    }
  }
  return { points: projected, tiles, zoom };
}
