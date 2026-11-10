// Funzioni pure: zone HR con metodo HRR (Karvonen). PLAN.md §7.
// soglia_i = resting + pct_i * (max_hr - resting)

import type { HrPoint, Profile, TimeInZone, ZoneKey } from "@/lib/types";

/** Estremo inferiore (in % di HRR) di ogni zona. Default PLAN §7. */
const ZONE_LOWER_PCT: Record<ZoneKey, number> = {
  z1: 0.0,
  z2: 0.6,
  z3: 0.7,
  z4: 0.8,
  z5: 0.9,
};

const ZONE_ORDER: ZoneKey[] = ["z1", "z2", "z3", "z4", "z5"];

export interface HrZones {
  /** Soglia inferiore in bpm per ogni zona. */
  lower: Record<ZoneKey, number>;
  max_hr: number;
  resting_hr: number;
  /** hrr = riserva cardiaca (Karvonen); watch = soglie dell'orologio, usate solo senza FC a riposo. */
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

/**
 * Soglie inferiori (bpm) delle 5 zone con la riserva cardiaca (Karvonen).
 *
 * Le zone dell'orologio Zepp sono in % della FC massima (50/60/70/80/90%):
 * con FC a riposo bassa mettono in "Z4" una corsa aerobica (es. 156 bpm con
 * FC max 196 e riposo 47 è il 73% della riserva). Per analisi, carico e
 * piani si usa quindi sempre la riserva cardiaca; dall'orologio si prende
 * solo la FC massima. Le soglie Zepp servono solo se manca la FC a riposo.
 * Ritorna null se mancano i dati (niente default fisiologici).
 */
export function hrZones(profile: HrConfig): HrZones | null {
  const ranges = watchRanges(profile.hr_zone_ranges);
  const max_hr = ranges ? Math.round(ranges[5]) : profile.max_hr;
  const resting_hr = profile.resting_hr;
  if (max_hr != null && resting_hr != null && max_hr - resting_hr > 0) {
    const reserve = max_hr - resting_hr;
    const lower = {} as Record<ZoneKey, number>;
    for (const key of ZONE_ORDER) {
      lower[key] = Math.round(resting_hr + ZONE_LOWER_PCT[key] * reserve);
    }
    return { lower, max_hr, resting_hr, method: "hrr" };
  }
  if (ranges) {
    return {
      lower: {
        z1: Math.round(ranges[0]),
        z2: Math.round(ranges[1]),
        z3: Math.round(ranges[2]),
        z4: Math.round(ranges[3]),
        z5: Math.round(ranges[4]),
      },
      max_hr: Math.round(ranges[5]),
      resting_hr: resting_hr ?? 0,
      method: "watch",
    };
  }
  return null;
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
