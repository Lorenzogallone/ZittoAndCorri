// Prompt + responseSchema per i due task del Coach AI. PLAN.md §8.
import { Type, type Schema } from "@google/genai";
import { WORKOUT_TYPES } from "@/lib/types";

// ── Valutazione di una singola corsa ─────────────────────────────────────────

export const evaluationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description:
        "Valutazione discorsiva della corsa in italiano (3-5 frasi): qualità dell'esecuzione, sforzo, segnali, contesto rispetto allo storico. Solo testo qualitativo, niente numeri inventati.",
    },
    flags: {
      type: Type.OBJECT,
      properties: {
        good_progress: { type: Type.BOOLEAN, nullable: true },
        overreaching: { type: Type.BOOLEAN, nullable: true },
        injury_risk: { type: Type.BOOLEAN, nullable: true },
        easy_too_fast: { type: Type.BOOLEAN, nullable: true },
        on_track: { type: Type.BOOLEAN, nullable: true },
      },
    },
  },
  required: ["summary", "flags"],
};

export function buildEvaluationPrompt(
  contextMarkdown: string,
  activityDetail: string,
): string {
  return [
    "Sei un coach di corsa esperto. Valuti una singola corsa dell'atleta.",
    "Regole: i numeri (passi, volumi, carico, predizioni) sono già calcolati e te li fornisco — NON inventarne di nuovi, puoi solo commentarli. Produci solo testo qualitativo in italiano.",
    "Tieni conto delle note dell'atleta sulla corsa, se presenti, e del contesto temporale (es. se segue un lungo stop, valuta la corsa come ripresa).",
    "",
    "# Contesto atleta",
    contextMarkdown,
    "",
    "# Corsa da valutare",
    activityDetail,
    "",
    "Restituisci una valutazione discorsiva (campo summary) e i flag pertinenti (true solo se davvero applicabili, altrimenti ometti/false).",
  ].join("\n");
}

// ── Generazione piano 2 settimane + review ───────────────────────────────────

export const planSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    review_summary: {
      type: Type.STRING,
      description:
        "Review discorsiva in italiano (4-6 frasi) delle ultime 2 settimane: programmato vs fatto, aderenza, andamento del carico, e razionale del nuovo piano.",
    },
    workouts: {
      type: Type.ARRAY,
      description:
        "Allenamenti pianificati per le prossime 2 settimane. Non riempire ogni giorno: lascia giorni di riposo. Rispetta i vincoli dell'atleta.",
      items: {
        type: Type.OBJECT,
        properties: {
          date: {
            type: Type.STRING,
            description: "Data in formato YYYY-MM-DD, entro la finestra indicata.",
          },
          type: { type: Type.STRING, enum: [...WORKOUT_TYPES] },
          target_distance_m: { type: Type.INTEGER, nullable: true },
          target_pace_s_km: {
            type: Type.INTEGER,
            nullable: true,
            description: "Passo target in secondi/km.",
          },
          target_duration_s: { type: Type.INTEGER, nullable: true },
          description: {
            type: Type.STRING,
            nullable: true,
            description: "Breve descrizione in italiano, es. struttura ripetute.",
          },
        },
        required: ["date", "type"],
      },
    },
  },
  required: ["review_summary", "workouts"],
};

export function buildPlanPrompt(
  contextMarkdown: string,
  windowStart: string,
  windowEnd: string,
  comments: string | null,
): string {
  return [
    "Sei un coach di corsa esperto. Genera un piano di allenamento per le prossime 2 settimane e una review del periodo appena trascorso.",
    "Regole:",
    "- I numeri di forma (passi, volumi, carico TSB, predizioni) sono già calcolati e te li fornisco: usali per dimensionare il piano, ma resta realistico e progressivo.",
    `- Pianifica SOLO date comprese tra ${windowStart} e ${windowEnd} (incluse).`,
    "- Non programmare ogni singolo giorno: includi riposo e alterna intensità e volume in modo sensato verso l'obiettivo.",
    "- I passi target devono essere coerenti coi passi medi reali dell'atleta per ciascun tipo.",
    "- Scrivi descrizioni brevi e operative in italiano.",
    "- Se il contesto indica un REPLAN, parti dal piano attuale a calendario e dall'aderenza reale (piano vs reale): mantieni ciò che ha senso, correggi dove l'atleta è rimasto indietro o ha cambiato passo. Onora le note dei singoli giorni del piano attuale come vincoli (es. giorni in cui non può correre).",
    "- Se il contesto segnala uno stop prolungato (molti giorni/mesi senza corse), riparti con prudenza: meno volume e intensità, riprogressione graduale; non riprendere dai carichi precedenti allo stop.",
    "- Nella review (review_summary) confronta esplicitamente programmato vs fatto e motiva le scelte del nuovo piano.",
    comments && comments.trim()
      ? `- Vincoli/preferenze aggiuntivi dell'atleta da rispettare: ${comments.trim()}`
      : "",
    "",
    "# Contesto atleta",
    contextMarkdown,
    "",
    "Restituisci la review (review_summary) e l'elenco dei workout.",
  ]
    .filter(Boolean)
    .join("\n");
}
