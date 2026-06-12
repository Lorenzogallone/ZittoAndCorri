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
  plannedWorkoutDetail?: string | null,
): string {
  return [
    "Sei il coach di corsa personale di questo atleta: lo segui da settimane, conosci il suo piano, il suo storico e i feedback che gli hai già dato. Valuti una singola attività con tono diretto, concreto e incoraggiante, come farebbe un vero allenatore.",
    "Regole:",
    "- I numeri (passi, volumi, carico, predizioni) sono già calcolati e te li fornisco — NON inventarne di nuovi, puoi solo commentarli. Produci solo testo qualitativo in italiano.",
    "- Confronta l'attività con l'allenamento previsto a piano per quel giorno: era la seduta in programma? È stata eseguita ai target (distanza, passo)? Se differisce, dillo e spiega cosa cambia.",
    "- Inquadra la corsa nella fase di allenamento corrente (vedi memoria coach nel contesto): un easy in settimana di scarico si giudica diversamente da uno in piena fase di carico.",
    "- Considera la fatica delle attività non di corsa recenti (calcio, bici, palestra…): possono spiegare gambe pesanti o un passo più lento, o motivare un giorno di corsa saltato.",
    "- Cita aderenza e TSB solo in modo qualitativo (es. 'sei un po' affaticato'), e tieni conto delle note dell'atleta e del contesto temporale (es. ripresa dopo uno stop).",
    "- Mantieni coerenza con le tue valutazioni precedenti: non contraddirti e non ripetere sempre le stesse frasi.",
    "",
    "# Contesto atleta",
    contextMarkdown,
    "",
    "# Allenamento previsto a piano",
    plannedWorkoutDetail?.trim() ||
      "Nessun allenamento era previsto a piano per questo giorno.",
    "",
    "# Attività da valutare",
    activityDetail,
    "",
    "Restituisci una valutazione discorsiva (campo summary, 3-5 frasi) e i flag pertinenti (true solo se davvero applicabili, altrimenti ometti/false).",
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
    coach_memory: {
      type: Type.STRING,
      description:
        "Memoria del coach (3-5 frasi in italiano) da rileggere al prossimo ciclo: in che fase del percorso siamo (base/costruzione/intensità/velocità/scarico/avvicinamento gara), cosa si è lavorato finora e con quali risultati, e qual è il focus del prossimo blocco. Aggiorna la memoria precedente, non ripartire da zero.",
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
  required: ["review_summary", "coach_memory", "workouts"],
};

export function buildPlanPrompt(
  contextMarkdown: string,
  windowStart: string,
  windowEnd: string,
  comments: string | null,
): string {
  return [
    "Sei il coach di corsa personale di questo atleta: lo segui ciclo dopo ciclo e conosci il percorso fatto finora. Genera un piano di allenamento per le prossime 2 settimane, una review del periodo appena trascorso e l'aggiornamento della tua memoria di coach.",
    "Regole:",
    "- I numeri di forma (passi, volumi, carico TSB, predizioni) sono già calcolati e te li fornisco: usali per dimensionare il piano, ma resta realistico e progressivo.",
    `- Pianifica SOLO date comprese tra ${windowStart} e ${windowEnd} (incluse).`,
    "- Non programmare ogni singolo giorno: includi riposo e alterna intensità e volume in modo sensato verso l'obiettivo.",
    "- I passi target devono essere coerenti coi passi medi reali dell'atleta per ciascun tipo.",
    "- Scrivi descrizioni brevi e operative in italiano.",
    "- Dai continuità alla progressione: la 'memoria coach' e lo 'storico piani recenti' nel contesto dicono in che fase siete (base, costruzione, intensità, velocità, scarico, avvicinamento gara). Prosegui il blocco in corso o passa al successivo in modo motivato; inserisci scarico periodico. Non ricominciare da capo a ogni piano.",
    "- Tieni conto delle attività non di corsa (calcio, bici, palestra…): se ricorrono in giorni fissi trattale come impegni da rispettare (pianifica riposo o easy intorno); un giorno con attività intensa di altro sport conta come carico, non come giorno libero — il giorno dopo meglio easy o riposo.",
    "- Se il contesto indica un REPLAN, parti dal piano attuale a calendario e dall'aderenza reale (piano vs reale): mantieni ciò che ha senso, correggi dove l'atleta è rimasto indietro o ha cambiato passo. Onora le note dei singoli giorni del piano attuale come vincoli (es. giorni in cui non può correre).",
    "- Se il contesto segnala uno stop prolungato (molti giorni/mesi senza corse), riparti con prudenza: meno volume e intensità, riprogressione graduale; non riprendere dai carichi precedenti allo stop.",
    "- Nella review (review_summary) confronta esplicitamente programmato vs fatto (incluse le attività non di corsa che hanno sostituito allenamenti) e motiva le scelte del nuovo piano.",
    "- In coach_memory aggiorna la tua memoria di fase: dove siamo nel percorso, cosa è stato consolidato, focus del prossimo blocco. Parti dalla memoria precedente nel contesto, se presente.",
    comments && comments.trim()
      ? `- Vincoli/preferenze aggiuntivi dell'atleta da rispettare: ${comments.trim()}`
      : "",
    "",
    "# Contesto atleta",
    contextMarkdown,
    "",
    "Restituisci la review (review_summary), la memoria aggiornata (coach_memory) e l'elenco dei workout.",
  ]
    .filter(Boolean)
    .join("\n");
}
