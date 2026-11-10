// Funzioni pure: zone HR sulla riserva cardiaca (Karvonen), con gli stessi
// tagli delle zone "riserva cardiaca" dell'app Zepp. PLAN.md §7.
// soglia_i = floor(resting + pct_i * (max_hr - resting))

import type { HrPoint, Profile, TimeInZone, ZoneKey } from "@/lib/types";

/**
 * Estremo inferiore (in % della riserva cardiaca) di ogni zona: sono i tagli
 * delle zone Zepp a riserva cardiaca (metodologia Daniels).
 * Z1 facile (easy e lunghi; sotto il 59% conta comunque come Z1),
 * Z2 medio / passo maratona, Z3 soglia, Z4 ripetute, Z5 massimale.
 */
export const ZONE_LOWER_PCT: Record<ZoneKey, number> = {
  z1: 0.59,
  z2: 0.74,
  z3: 0.84,
  z4: 0.88,
  z5: 0.95,
};

const ZONE_ORDER: ZoneKey[] = ["z1", "z2", "z3", "z4", "z5"];

/** Tagli generici in % della FC max: l'impostazione di fabbrica dell'orologio. */
const PERCENT_OF_MAX = [0.5, 0.6, 0.7, 0.8, 0.9];

export interface HrZones {
  /** Soglia inferiore in bpm per ogni zona. */
  lower: Record<ZoneKey, number>;
  max_hr: number;
  resting_hr: number;
  /** hrr = riserva cardiaca calcolata dall'app; watch = zone impostate sull'orologio. */
  method: "hrr" | "watch";
}

/** Config HR sufficiente al calcolo zone. */
export type HrConfig = Pick<Profile, "max_hr" | "resting_hr"> & {
  /** Soglie Zepp: limiti inferiori Z1-Z5 seguiti dalla FC massima configurata. */
  hr_zone_ranges?: number[] | null;
};

function watchRanges(configured: number[] | null | undefined): number[] | null {
  if (!configured || configured.length < 6) return null;
  const ranges = configured.slice(0, 6);
  const valid = ranges.every((value, index) =>
    Number.isFinite(value)
    && value >= 25
    && value <= 240
    && (index === 0 || value > ranges[index - 1]),
  );
  return valid ? ranges : null;
}

/** True se le soglie dell'orologio sono quelle di fabbrica in % della FC max. */
export function isPercentOfMaxRanges(ranges: number[]): boolean {
  const max = ranges[5];
  return PERCENT_OF_MAX.every((pct, index) => Math.abs(ranges[index] - pct * max) <= 1.5);
}

/**
 * Soglie inferiori (bpm) delle 5 zone.
 *
 * - Zone impostate sull'orologio (riserva cardiaca, soglia del lattato o
 *   personalizzate): si usano così come sono, così app e orologio coincidono.
 * - Zone di fabbrica in % della FC max: non si usano, perché ignorano la FC a
 *   riposo e mettono in "Z4" una corsa aerobica. Si calcola la riserva
 *   cardiaca con i tagli Zepp, che dà gli stessi numeri della schermata
 *   "Zona frequenza cardiaca riservata" dell'app Zepp.
 * - Senza FC a riposo restano le soglie dell'orologio, se ci sono.
 * Ritorna null se mancano i dati (niente default fisiologici).
 */
export function hrZones(profile: HrConfig): HrZones | null {
  const ranges = watchRanges(profile.hr_zone_ranges);
  const resting_hr = profile.resting_hr;
  const fromWatch = (values: number[]): HrZones => ({
    lower: {
      z1: Math.round(values[0]),
      z2: Math.round(values[1]),
      z3: Math.round(values[2]),
      z4: Math.round(values[3]),
      z5: Math.round(values[4]),
    },
    max_hr: Math.round(values[5]),
    resting_hr: resting_hr ?? 0,
    method: "watch",
  });

  if (ranges && !isPercentOfMaxRanges(ranges)) return fromWatch(ranges);

  const max_hr = ranges ? Math.round(ranges[5]) : profile.max_hr;
  if (max_hr != null && resting_hr != null && max_hr - resting_hr > 0) {
    const reserve = max_hr - resting_hr;
    const lower = {} as Record<ZoneKey, number>;
    for (const key of ZONE_ORDER) {
      // Zepp tronca all'intero: floor per avere al battito gli stessi numeri.
      lower[key] = Math.floor(resting_hr + ZONE_LOWER_PCT[key] * reserve + 1e-9);
    }
    return { lower, max_hr, resting_hr, method: "hrr" };
  }
  return ranges ? fromWatch(ranges) : null;
}

/**
 * Zona HR per una singola frequenza. Ritorna null se le zone non sono calcolabili.
 */
export function zoneForHr(bpm: number, profile: HrConfig): ZoneKey | null {
  const zones = hrZones(profile);
  if (!zones) return null;
  // dalla più alta alla più bassa: la prima la cui soglia inferiore è <= bpm
  for (let i = ZONE_ORDER.length - 1; i >= 0; i--) {
    const key = ZONE_ORDER[i];
    if (bpm >= zones.lower[key]) return key;
  }
  return "z1";
}

/**
 * Approssimazione "zone-da-media": senza stream HR, attribuisce l'intera durata
 * alla zona della HR media. Ritorna null se manca avg_hr o le zone non sono calcolabili.
 */
export function timeInZoneFromAverage(
  avg_hr: number | null | undefined,
  duration_s: number,
  profile: HrConfig,
): TimeInZone | null {
  if (avg_hr == null) return null;
  const zone = zoneForHr(avg_hr, profile);
  if (!zone) return null;
  return { [zone]: duration_s };
}

/**
 * Calcola il tempo (secondi) in ogni zona da una serie HR reale.
 * Per ogni campione somma Δt (distanza al campione successivo) nella zona di quel bpm.
 * Prevale su timeInZoneFromAverage quando la serie è disponibile.
 * Ritorna null se la serie è vuota o le zone non sono calcolabili.
 */
export function timeInZoneFromSeries(
  hr_series: HrPoint[],
  profile: HrConfig,
): TimeInZone | null {
  if (!hr_series || hr_series.length < 2) return null;
  const zones = hrZones(profile);
  if (!zones) return null;

  const acc: Partial<Record<ZoneKey, number>> = {};

  for (let i = 0; i < hr_series.length - 1; i++) {
    const dt = hr_series[i + 1].t - hr_series[i].t;
    if (dt <= 0) continue;
    const zone = zoneForHr(hr_series[i].bpm, profile);
    if (!zone) continue;
    acc[zone] = (acc[zone] ?? 0) + dt;
  }

  return Object.keys(acc).length > 0 ? acc : null;
}
