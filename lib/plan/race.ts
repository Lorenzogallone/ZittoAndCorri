// Strategia di gara a ritmo costante: passo e tempi di passaggio. Funzioni pure.

export interface RaceCheckpoint {
  label: string;
  meters: number;
  elapsed_s: number;
}

export interface RacePacing {
  pace_s_km: number;
  checkpoints: RaceCheckpoint[];
}

function checkpointMeters(distance: number): number[] {
  const marks: number[] = [];
  if (distance <= 10_500) {
    for (let km = 1_000; km < distance; km += 1_000) marks.push(km);
  } else {
    for (let km = 5_000; km < distance; km += 5_000) marks.push(km);
    if (distance > 40_000) marks.push(21_097);
  }
  return [...marks.filter((m) => distance - m >= 300).sort((a, b) => a - b), distance];
}

function label(meters: number, distance: number): string {
  if (meters === distance) return "Arrivo";
  if (meters === 21_097) return "Mezza";
  return `${meters / 1000} km`;
}

export function racePacing(distance_m: number, target_s: number): RacePacing | null {
  if (distance_m <= 0 || target_s <= 0) return null;
  const pace = target_s / (distance_m / 1000);
  return {
    pace_s_km: Math.round(pace),
    checkpoints: checkpointMeters(distance_m).map((meters) => ({
      label: label(meters, distance_m),
      meters,
      elapsed_s: Math.round((meters / 1000) * pace),
    })),
  };
}
