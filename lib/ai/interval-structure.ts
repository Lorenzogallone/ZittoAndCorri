import "server-only";

// Struttura della seduta scritta nella nota dell'atleta ("3 × (3' forte + 1'
// jog + 1' sprint)", anche dettata a voce): Gemini la traduce in step, poi
// l'allineamento sulla curva di velocità è deterministico (lib/metrics/intervals).

import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import { generateAi } from "@/lib/ai/llm";
import type { AiConfig } from "@/lib/ai/credentials";
import { describeStructure, isStructured } from "@/lib/metrics/intervals";
import type { DeclaredIntervals } from "@/lib/derived";
import type { WorkoutStepInput } from "@/lib/types";

const KINDS = ["warmup", "work", "recovery", "steady", "cooldown"] as const;

const structureSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    found: {
      type: Type.BOOLEAN,
      description: "true solo se la nota descrive la sequenza dei tratti corsi con durate o distanze.",
    },
    description: {
      type: Type.STRING,
      nullable: true,
      description: "Forma compatta in italiano, es. \"3 × (3' forte + 1' jog + 1' sprint)\".",
    },
    blocks: {
      type: Type.ARRAY,
      description: "Blocchi in ordine. Un blocco ripetuto N volte ha repeat N; un tratto singolo ha repeat 1.",
      items: {
        type: Type.OBJECT,
        properties: {
          repeat: { type: Type.INTEGER, description: "Quante volte si ripete il blocco (1-30)." },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                kind: { type: Type.STRING, enum: [...KINDS] },
                label: { type: Type.STRING, description: "Una o due parole in minuscolo: forte, sprint, jog, cammino, soglia, ritmo gara…" },
                unit: { type: Type.STRING, enum: ["seconds", "meters", "open"] },
                value: { type: Type.INTEGER, nullable: true, description: "Secondi o metri; null se unit è open." },
                variant: {
                  type: Type.STRING,
                  enum: ["sprint", "jog", "walk"],
                  nullable: true,
                  description: "sprint per i tratti a tutta (sprint, allunghi, scatti); jog per i recuperi corricchiando; walk per i recuperi camminando; altrimenti null.",
                },
              },
              required: ["kind", "label", "unit", "value", "variant"],
            },
          },
        },
        required: ["repeat", "steps"],
      },
    },
  },
  required: ["found", "blocks"],
};

const responseZod = z.object({
  found: z.boolean(),
  description: z.string().trim().max(120).nullish(),
  blocks: z.array(z.object({
    repeat: z.number().int().min(1).max(30),
    steps: z.array(z.object({
      kind: z.enum(KINDS),
      label: z.string().trim().max(40),
      unit: z.enum(["seconds", "meters", "open"]),
      value: z.number().int().positive().max(50_000).nullish(),
      variant: z.enum(["sprint", "jog", "walk"]).nullish().catch(null),
    })).min(1).max(12),
  })).max(12),
});

/** Evita una chiamata AI quando la nota non contiene nemmeno un numero. */
export function mayDescribeStructure(notes: string | null | undefined): notes is string {
  return !!notes && /\d|\b(un[oa]?|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|dodici|quindici|venti|trenta|mezz[oa])\b/i.test(notes);
}

function buildPrompt(notes: string, plannedHint: string | null): string {
  return [
    "Leggi la nota che un runner ha scritto (o dettato a voce) su una sua corsa e, solo se descrive la struttura dei tratti corsi (ripetute, serie, variazioni di ritmo con durate o distanze), trasformala in blocchi.",
    "Regole:",
    "- Minuti in secondi (3' = 3 min = 180; 30\" = 30), km e metri in metri (1 km = 1000).",
    "- Se manca l'unità di un tratto, usa quella del tratto accanto (\"3 minuti forte + 1 jogging + 1 sprint\" → 180, 60, 60 secondi).",
    "- \"N x (…)\", \"N volte\", \"N serie\", \"N ripetute\" → un blocco con repeat N. La nota può contenere errori di trascrizione vocale (\"per\", \"paio\", \"ics\" al posto di \"x\"): interpreta l'intento.",
    "- forte, veloce, sprint, allungo, soglia, ritmo gara, progressivo → work; jogging, corsetta, piano, lento, recupero, camminata → recovery; riscaldamento → warmup; defaticamento → cooldown; tratto continuo a ritmo medio → steady.",
    "- variant: sprint per sprint, allunghi e scatti a tutta; jog per i recuperi corricchiando (jogging, corsetta, piano); walk per i recuperi camminando o da fermo.",
    "- Riporta solo ciò che è scritto: non aggiungere recuperi, riscaldamento o defaticamento non citati.",
    "- Se la nota parla d'altro (sensazioni, meteo, dolori) found=false e blocks vuoto.",
    plannedHint ? `\nSeduta prevista dal piano, solo come riferimento (se la nota dice altro vale la nota): ${plannedHint}` : "",
    "",
    `Nota: """${notes.slice(0, 1500)}"""`,
  ].join("\n");
}

/** Struttura dichiarata nella nota, o null se la nota non ne descrive una. */
export async function extractDeclaredStructure(
  notes: string,
  plannedHint: string | null,
  ai: AiConfig,
): Promise<DeclaredIntervals | null> {
  const raw = await generateAi<unknown>(buildPrompt(notes, plannedHint), structureSchema, ai);
  const parsed = responseZod.safeParse(raw);
  if (!parsed.success || !parsed.data.found) return null;
  const steps: WorkoutStepInput[] = [];
  for (const block of parsed.data.blocks) {
    for (let i = 0; i < block.repeat; i++) {
      for (const step of block.steps) {
        const open = step.unit === "open" || !step.value;
        const variant = step.variant ?? (
          step.kind === "work" && /sprint|allung|scatt/i.test(step.label) ? "sprint"
          : step.kind === "recovery" && /cammin|fermo/i.test(step.label) ? "walk"
          : step.kind === "recovery" && /jog|corsett|corricch|piano/i.test(step.label) ? "jog"
          : null
        );
        steps.push({
          kind: step.kind,
          label: step.label.toLowerCase() || step.kind,
          completion_type: open ? "manual" : step.unit === "meters" ? "distance" : "time",
          completion_value: open ? null : step.value!,
          pace_min_s_km: null,
          pace_max_s_km: null,
          hr_min_bpm: null,
          hr_max_bpm: null,
          variant,
        });
      }
    }
  }
  if (!steps.length || steps.length > 60 || !isStructured(steps)) return null;
  return { steps, description: parsed.data.description || describeStructure(steps) };
}
