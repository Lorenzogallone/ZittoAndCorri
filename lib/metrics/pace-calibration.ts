// Funzione pura: calibrazione ritmi ↔ HR. PLAN.md §7.
// Risponde alla domanda "il ritmo easy dell'atleta è davvero easy?" in modo
// deterministico, confrontando la HR media delle corse recenti con la zona
// attesa per quel tipo di seduta. Il risultato entra nel prompt del coach:
// così se le easy escono in Z3/Z4 il piano successivo se lo ricorda.

import { zoneForHr, type HrConfig } from "@/lib/metrics/zones";
import type { ActivityType, WorkoutType, ZoneKey } from "@/lib/types";

/** Zona HR massima attesa per ciascun tipo di seduta di corsa. */
const EXPECTED_MAX_ZONE: Partial<Record<WorkoutType, ZoneKey>> = {
  recovery: "z1",
  easy: "z2",
  long: "z2",
  tempo: "z4",
  interval: "z5",
  race: "z5",
};

const ZONE_INDEX: Record<ZoneKey, number> = { z1: 1, z2: 2, z3: 3, z4: 4, z5: 5 };

export interface PaceCalibrationEntry {
  type: WorkoutType;
  /** Corse considerate. */
  runs: number;
  /** Passo medio osservato (s/km). */
  avg_pace_s_km: number;
  /** HR media osservata (bpm). */
  avg_hr: number;
  /** Zona della HR media osservata. */
  zone: ZoneKey;
  /** Zona massima attesa per il tipo. */
  expected_zone: ZoneKey;
  /** Deriva cardiaca media (%), se disponibile. */
  avg_drift_pct: number | null;
  /** true = la HR osservata supera la zona attesa: quel ritmo è troppo per ora. */
  too_hard: boolean;
}

interface CalibrationRun {
  type: ActivityType;
  sport?: string | null;
  avg_pace_s_km: number | null;
  avg_hr: number | null;
  hr_drift_pct?: number | null;
}

/**
 * Aggrega le corse recenti per tipo e verifica se la HR media è nella zona
 * attesa. Ritorna solo i tipi con almeno una corsa dotata di passo + HR.
 * Serve il profilo con max_hr, altrimenti null (zone non calcolabili).
 */
export function calibratePaces(
  runs: CalibrationRun[],
  profile: HrConfig,
): PaceCalibrationEntry[] | null {
  if (profile.max_hr == null) return null;

  const byType = new Map<
    WorkoutType,
    { pace: number; hr: number; n: number; drift: number; nDrift: number }
  >();
  for (const r of runs) {
    if ((r.sport ?? "running") !== "running") continue;
    if (r.avg_pace_s_km == null || r.avg_hr == null) continue;
    // Una corsa importata senza classificazione non può alimentare la
    // calibrazione specifica di easy/tempo/lungo finché non viene interpretata.
    if (r.type === "unclassified") continue;
    const expected = EXPECTED_MAX_ZONE[r.type];
    if (!expected) continue;
    const e = byType.get(r.type) ?? { pace: 0, hr: 0, n: 0, drift: 0, nDrift: 0 };
    e.pace += r.avg_pace_s_km;
    e.hr += r.avg_hr;
    e.n += 1;
    if (r.hr_drift_pct != null) {
      e.drift += r.hr_drift_pct;
      e.nDrift += 1;
    }
    byType.set(r.type, e);
  }

  const out: PaceCalibrationEntry[] = [];
  for (const [type, e] of byType) {
    const avg_hr = Math.round(e.hr / e.n);
    const zone = zoneForHr(avg_hr, profile);
    if (!zone) continue;
    const expected_zone = EXPECTED_MAX_ZONE[type]!;
    out.push({
      type,
      runs: e.n,
      avg_pace_s_km: Math.round(e.pace / e.n),
      avg_hr,
      zone,
      expected_zone,
      avg_drift_pct:
        e.nDrift > 0 ? Math.round((e.drift / e.nDrift) * 10) / 10 : null,
      too_hard: ZONE_INDEX[zone] > ZONE_INDEX[expected_zone],
    });
  }

  return out.length > 0 ? out : null;
}
