// Unified ingest — every source goes through here before touching the DB. PLAN.md §6.
// Complete schema (optional streams included) so adding rich sources
// in Phase 2 requires no changes to the data model.

import { z } from "zod";
import { SPORTS } from "@/lib/types";

export const ActivityInput = z
  .object({
    source: z.enum(["manual", "json_import", "file", "strava", "healthkit", "intervals"]),
    // Identifier in the external source (e.g. "intervals:123"): avoids double imports.
    external_id: z.string().trim().min(1).max(120).optional(),
    type: z
      .enum(["unclassified", "easy", "tempo", "interval", "long", "race", "recovery", "cross"])
      .default("unclassified"),
    sport: z.enum(SPORTS).default("running"),
    started_at: z.iso.datetime({ offset: true }),
    // For sports without distance (gym, yoga, football…) 0 is allowed;
    // for running it stays required > 0 (refine below).
    distance_m: z.number().int().nonnegative(),
    duration_s: z.number().int().positive(),
    moving_time_s: z.number().int().positive().optional(),
    avg_hr: z.number().int().positive().optional(),
    max_hr: z.number().int().positive().optional(),
    elevation_gain_m: z.number().int().nonnegative().optional(),
    rpe: z.number().int().min(1).max(10).optional(),
    rpe_source: z.enum(["fit", "user", "api"]).optional(),
    calories: z.number().int().positive().optional(),
    source_title: z.string().optional(),
    notes: z.string().optional(),
    // optional streams (only from rich imports; the manual form has none)
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
    // Cumulative distance from the watch (more precise than GPS for intervals).
    distance_series: z
      .array(z.object({ t: z.number(), d: z.number() }))
      .optional(),
    // Laps from the FIT file (button, guided workout or automatic per km).
    laps: z
      .array(
        z.object({
          start_s: z.number(),
          duration_s: z.number(),
          distance_m: z.number().nullable(),
          avg_hr: z.number().nullable(),
          max_hr: z.number().nullable(),
          intensity: z.string().nullable(),
          trigger: z.string().nullable(),
          step: z.number().nullable(),
        }),
      )
      .max(500)
      .optional(),
  })
  .refine((a) => a.sport !== "running" || a.distance_m > 0, {
    message: "distance_m deve essere > 0 per le corse",
    path: ["distance_m"],
  });

export type ActivityInput = z.infer<typeof ActivityInput>;
