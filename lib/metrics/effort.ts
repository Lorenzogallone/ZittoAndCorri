// Funzioni pure: metriche di sforzo derivate dagli stream. PLAN.md §7.
// Come tutte le lib/metrics: deterministiche, l'LLM le legge ma non le produce.

import type { GpsPoint, HrPoint } from "@/lib/types";
import { haversine } from "@/lib/metrics/splits";

/** Punto cadenza normalizzato (dal parser FIT). */
export interface CadencePoint {
  t: number;
  rpm: number;
}

/**
 * Cadenza media in passi/minuto. Nei file FIT la cadenza di corsa è in
 * giri/minuto per gamba (rpm): per la corsa i passi sono il doppio; per gli
 * altri sport (bici…) il valore resta in rpm com'è.
 * Ritorna null se la serie è vuota.
 */
export function avgCadenceSpm(
  cadence_series: CadencePoint[] | undefined,
  sport: string,
): number | null {
  if (!cadence_series || cadence_series.length === 0) return null;
  const avg =
    cadence_series.reduce((s, p) => s + p.rpm, 0) / cadence_series.length;
  const factor = sport === "running" ? 2 : 1;
  const spm = Math.round(avg * factor);
  return spm > 0 ? spm : null;
}

/** Media dei bpm dei campioni HR con t in [t0, t1). */
function avgHrInWindow(hr: HrPoint[], t0: number, t1: number): number | null {
  let sum = 0;
  let n = 0;
  for (const p of hr) {
    if (p.t >= t0 && p.t < t1) {
      sum += p.bpm;
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}

/** Distanza (m) percorsa tra t0 e t1 secondo la serie GPS. */
function distanceInWindow(gps: GpsPoint[], t0: number, t1: number): number {
  let dist = 0;
  for (let i = 1; i < gps.length; i++) {
    const prev = gps[i - 1];
    const curr = gps[i];
    if (prev.t >= t0 && curr.t <= t1) {
      dist += haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    }
  }
  return dist;
}

/**
 * Deriva cardiaca (aerobic decoupling) in %: confronta il rapporto
 * velocità/HR della prima metà con quello della seconda. Positiva = a parità
 * di passo il cuore sale (fatica, caldo, disidratazione, ritmo troppo alto
 * per lo stato di forma); ±5% è considerato fisiologico su una corsa easy.
 *
 * Con il GPS usa il vero decoupling passo/HR; senza GPS ripiega sulla sola
 * deriva HR (secondo tempo vs primo). Ritorna null se la seduta è troppo
 * corta (<20 min) o mancano i dati: meglio nessun numero che un numero
 * rumoroso.
 */
export function computeHrDrift(
  hr_series: HrPoint[] | undefined,
  gps_series?: GpsPoint[],
): number | null {
  if (!hr_series || hr_series.length < 10) return null;
  const tStart = hr_series[0].t;
  const tEnd = hr_series[hr_series.length - 1].t;
  const total = tEnd - tStart;
  if (total < 20 * 60) return null;

  const tMid = tStart + total / 2;
  const hr1 = avgHrInWindow(hr_series, tStart, tMid);
  const hr2 = avgHrInWindow(hr_series, tMid, tEnd + 1);
  if (hr1 == null || hr2 == null || hr1 <= 0 || hr2 <= 0) return null;

  if (gps_series && gps_series.length >= 4) {
    const d1 = distanceInWindow(gps_series, tStart, tMid);
    const d2 = distanceInWindow(gps_series, tMid, tEnd + 1);
    // Metà troppo corte (pause lunghe, GPS parziale) → fallback solo-HR.
    if (d1 > 200 && d2 > 200) {
      const v1 = d1 / (tMid - tStart);
      const v2 = d2 / (tEnd - tMid);
      const eff1 = v1 / hr1; // velocità per battito
      const eff2 = v2 / hr2;
      if (eff1 > 0) {
        const drift = ((eff1 - eff2) / eff1) * 100;
        return Math.round(drift * 10) / 10;
      }
    }
  }

  // Fallback: deriva della sola HR (assume passo ~costante).
  const drift = ((hr2 - hr1) / hr1) * 100;
  return Math.round(drift * 10) / 10;
}
