// Passo istante per istante per il grafico della corsa: velocità su una
// finestra di qualche decina di secondi (il GPS secondo per secondo è troppo
// nervoso), sul tempo in movimento. Funzioni pure.

/** Sotto questa velocità (≈ 16:40/km) si sta camminando o si è fermi: niente passo. */
const MIN_SPEED = 1;

/**
 * Passo (s/km) da una traccia tempo/distanza cumulata, mediato su `window`
 * secondi centrati sul punto. Dove si cammina o si è fermi il punto manca,
 * così la linea si interrompe invece di schizzare in basso.
 */
export function paceSeries(track: Array<{ t: number; d: number }>, window = 30): Array<{ t: number; v: number }> {
  const points = track.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.d)).sort((a, b) => a.t - b.t);
  if (points.length < 3) return [];
  const half = window / 2;
  const out: Array<{ t: number; v: number }> = [];
  let lo = 0;
  let hi = 0;
  for (const point of points) {
    while (points[lo].t < point.t - half) lo++;
    while (hi < points.length - 1 && points[hi + 1].t <= point.t + half) hi++;
    const dt = points[hi].t - points[lo].t;
    if (dt < half) continue;
    const speed = (points[hi].d - points[lo].d) / dt;
    if (speed < MIN_SPEED) continue;
    out.push({ t: point.t, v: Math.round(1000 / speed) });
  }
  return out;
}
