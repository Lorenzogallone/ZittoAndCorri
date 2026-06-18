// Helper di presentazione e parsing input. Niente metriche: solo formattazione.

/** Secondi/km → "m:ss/km". */
export function formatPace(s_km: number | null | undefined): string {
  if (s_km == null) return "—";
  const m = Math.floor(s_km / 60);
  const s = Math.round(s_km % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

/** Secondi → "h:mm:ss" (o "m:ss" se < 1h). */
export function formatDuration(total_s: number | null | undefined): string {
  if (total_s == null) return "—";
  const h = Math.floor(total_s / 3600);
  const m = Math.floor((total_s % 3600) / 60);
  const s = Math.round(total_s % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Metri → "X,XX km". */
export function formatDistance(distance_m: number | null | undefined): string {
  if (distance_m == null) return "—";
  return `${(distance_m / 1000).toFixed(2)} km`;
}

/**
 * Tempo "effettivo" di un'attività: il tempo in movimento (pause escluse) se
 * disponibile, altrimenti il tempo totale. È il tempo che mostra Strava, usato
 * ovunque per durata, totali e carico.
 */
export function activeDuration(a: {
  duration_s: number;
  moving_time_s?: number | null;
}): number {
  return a.moving_time_s ?? a.duration_s;
}

/** Giorni interi rimanenti a raceDate (min 0). Null se raceDate è null. */
export function daysUntil(raceDate: string | null | undefined): number | null {
  if (!raceDate) return null;
  const diff = new Date(raceDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 3600 * 1000)));
}

/** "142 giorni" / "1 giorno" / "Oggi!" */
export function countdownLabel(raceDate: string | null | undefined): string | null {
  const d = daysUntil(raceDate);
  if (d === null) return null;
  if (d === 0) return "Oggi!";
  if (d === 1) return "1 giorno";
  return `${d} giorni`;
}

/**
 * "h:mm:ss" | "mm:ss" | "ss" → secondi. Ritorna null se non parsabile.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  let h = 0;
  let m = 0;
  let s = 0;
  if (nums.length === 3) [h, m, s] = nums;
  else if (nums.length === 2) [m, s] = nums;
  else if (nums.length === 1) [s] = nums;
  else return null;
  if (s >= 60 || m >= 60) return null;
  return h * 3600 + m * 60 + s;
}
