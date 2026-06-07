import type { AdherenceResult, PlannedStatus } from "@/lib/types";

export function computeAdherence(
  workouts: Array<{ status: PlannedStatus; date: string }>,
  today: string,
): AdherenceResult {
  let completed = 0;
  let missed = 0;
  let skipped = 0;

  for (const w of workouts) {
    if (w.status === "completed") {
      completed++;
    } else if (w.status === "skipped") {
      skipped++;
    } else if (w.status === "planned" && w.date < today) {
      missed++;
    }
    // status='planned' con date >= today → futuro, non conta
  }

  const total = completed + missed + skipped;
  return {
    total,
    completed,
    missed,
    skipped,
    pct: total > 0 ? Math.round((completed / total) * 100) : 100,
  };
}
