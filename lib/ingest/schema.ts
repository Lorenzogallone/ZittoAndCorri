// Ingest unificato — ogni sorgente passa da qui prima di toccare il DB. PLAN.md §6.
// Schema completo (stream opzionali inclusi) così l'aggiunta di sorgenti ricche
// in Fase 2 non richiede modifiche al data model.

import { z } from "zod";

export const ActivityInput = z.object({
  source: z.enum(["manual", "json_import", "file", "strava", "healthkit"]),
  type: z
    .enum(["easy", "tempo", "interval", "long", "race", "recovery", "cross"])
    .default("easy"),
  started_at: z.iso.datetime({ offset: true }),
  distance_m: z.number().int().positive(),
  duration_s: z.number().int().positive(),
  moving_time_s: z.number().int().positive().optional(),
  avg_hr: z.number().int().positive().optional(),
  max_hr: z.number().int().positive().optional(),
  elevation_gain_m: z.number().int().nonnegative().optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  notes: z.string().optional(),
  // stream opzionali (solo da import ricchi; il form manuale non li ha)
  hr_series: z.array(z.object({ t: z.number(), bpm: z.number() })).optional(),
  gps_series: z
    .array(
      z.object({
        t: z.number(),
        lat: z.number(),
        lon: z.number(),
        ele: z.number().optional(),
      }),
    )
    .optional(),
});

export type ActivityInput = z.infer<typeof ActivityInput>;
