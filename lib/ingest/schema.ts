// Ingest unificato — ogni sorgente passa da qui prima di toccare il DB. PLAN.md §6.
// Schema completo (stream opzionali inclusi) così l'aggiunta di sorgenti ricche
// in Fase 2 non richiede modifiche al data model.

import { z } from "zod";
import { SPORTS } from "@/lib/types";

export const ActivityInput = z
  .object({
    source: z.enum(["manual", "json_import", "file", "strava", "healthkit"]),
    type: z
      .enum(["easy", "tempo", "interval", "long", "race", "recovery", "cross"])
      .default("easy"),
    sport: z.enum(SPORTS).default("running"),
    started_at: z.iso.datetime({ offset: true }),
    // Per gli sport senza distanza (palestra, yoga, calcio…) è ammesso 0;
    // per la corsa resta obbligatoria > 0 (refine sotto).
    distance_m: z.number().int().nonnegative(),
    duration_s: z.number().int().positive(),
    moving_time_s: z.number().int().positive().optional(),
    avg_hr: z.number().int().positive().optional(),
    max_hr: z.number().int().positive().optional(),
    elevation_gain_m: z.number().int().nonnegative().optional(),
    rpe: z.number().int().min(1).max(10).optional(),
    calories: z.number().int().positive().optional(),
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
    cadence_series: z
      .array(z.object({ t: z.number(), rpm: z.number() }))
      .optional(),
  })
  .refine((a) => a.sport !== "running" || a.distance_m > 0, {
    message: "distance_m deve essere > 0 per le corse",
    path: ["distance_m"],
  });

export type ActivityInput = z.infer<typeof ActivityInput>;
