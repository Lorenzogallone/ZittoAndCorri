// Prompt + responseSchema per i due task del Coach AI. PLAN.md §8.
import { Type, type Schema } from "@google/genai";
import { WORKOUT_TYPES } from "@/lib/types";
import { z } from "zod";
import { COACH_METHODOLOGY } from "@/lib/ai/methodology";

// ── Valutazione di una singola corsa ─────────────────────────────────────────

export const evaluationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description:
        "Valutazione discorsiva della corsa in italiano (3-5 frasi): qualità dell'esecuzione, sforzo, segnali, contesto rispetto allo storico. Solo testo qualitativo, niente numeri inventati.",
    },
    details: {
      type: Type.ARRAY,
      description:
        "Elenco di 0-5 dettagli molto sintetici in italiano estratti dalle note libere dell'atleta e dagli eventuali dettagli già catalogati. Preferisci 2-6 parole per punto, stile etichetta informativa, senza citare la frase originale e senza inventare informazioni.",
      items: { type: Type.STRING },
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
  required: ["summary", "details", "flags"],
};

export const evaluationResponseSchemaZod = z.object({
  summary: z.string().min(1).max(4000),
  details: z.array(z.string().trim().min(1).max(120)).max(5).default([]),
  flags: z.object({
    good_progress: z.boolean().nullish(),
    overreaching: z.boolean().nullish(),
    injury_risk: z.boolean().nullish(),
    easy_too_fast: z.boolean().nullish(),
    on_track: z.boolean().nullish(),
  }).transform((flags) => {
    const cleaned: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(flags)) {
      if (typeof value === "boolean") cleaned[key] = value;
    }
    return cleaned;
  }),
});

export function buildEvaluationPrompt(
  contextMarkdown: string,
  activityDetail: string,
  nearbyPlannedWorkouts?: string | null,
): string {
  return [
    "Sei il coach di corsa personale di questo atleta: lo segui da settimane, conosci il suo piano, il suo storico e i feedback che gli hai già dato. Valuti una singola attività con tono diretto, concreto e incoraggiante, come farebbe un vero allenatore.",
    "Regole:",
    "- I numeri (passi, volumi, carico, predizioni) sono già calcolati e te li fornisco — NON inventarne di nuovi, puoi solo commentarli. Produci solo testo qualitativo in italiano.",
    "- Piano e attività NON hanno un collegamento esplicito. Confronta l'attività con le sedute pianificate nei giorni vicini e deduci quale sia la corrispondenza più probabile usando data, distanza, durata, passo, HR, descrizione e note. Non forzare un abbinamento: se è incerto o non c'è, dillo.",
    "- Il tag 'unclassified' significa soltanto corsa importata e non classificata: NON trattarla automaticamente come easy. Deduci la natura dello sforzo dai dati reali e dall'eventuale seduta pianificata compatibile.",
    "- Trasforma le note libere dell'atleta nel campo details: massimo 5 punti telegrafici, preferibilmente 2-6 parole ciascuno, un'informazione per punto. Consolida i dettagli già catalogati, elimina duplicati, non riportare la frase originale e non inventare nulla. Nella summary non citare testualmente il commento grezzo. Se non ci sono informazioni personali aggiuntive, restituisci un array vuoto.",
    "- Inquadra la corsa nella fase di allenamento corrente (vedi memoria coach nel contesto): un easy in settimana di scarico si giudica diversamente da uno in piena fase di carico.",
    "- Giudica lo sforzo REALE, non solo il passo: usa HR media e relativa zona, tempo in zona, deriva cardiaca (decoupling) e cadenza quando presenti. Se una seduta easy/lungo esce sopra Z2 o con deriva alta, dillo esplicitamente (flag easy_too_fast) e spiega la conseguenza: a oggi quel ritmo non è davvero easy e il piano dovrà tenerne conto. Se il workout previsto aveva una HR target, confronta HR reale vs target.",
    "- Se l'attività riporta i tratti misurati (ripetute), commenta come li ha corsi: regolarità tra le ripetute, calo o crescita verso la fine, passo rispetto al previsto, quanto scende il cuore nei recuperi. Distingui i tratti veloci dagli sprint (per questi conta la velocità di punta e la costanza tra uno e l'altro) e guarda come ha recuperato: corricchiando, camminando o da fermo. Se serve, suggerisci come impostare la prossima volta tratti e recuperi (es. recupero corricchiando invece che camminando, o sprint più distanziati). Cita solo i numeri forniti e al massimo 2-3 tratti significativi, senza elencarli tutti. Se la fonte è il rilevamento automatico, trattala come indicativa.",
    "- Se ci sono segnali sullo stile di corsa (cadenza bassa, deriva ricorrente), dai UN consiglio pratico e concreto su cosa curare la prossima volta (es. su cosa pensare, cosa privilegiare o sacrificare), senza trasformare la valutazione in una lezione.",
    "- Considera la fatica delle attività non di corsa recenti (calcio, bici, palestra…): possono spiegare gambe pesanti o un passo più lento, o motivare un giorno di corsa saltato.",
    "- Cita aderenza e TSB solo in modo qualitativo (es. 'sei un po' affaticato'), e tieni conto delle note dell'atleta e del contesto temporale (es. ripresa dopo uno stop).",
    "- Mantieni coerenza con le tue valutazioni precedenti: non contraddirti e non ripetere sempre le stesse frasi.",
    "",
    "# Contesto atleta",
    contextMarkdown,
    "",
    "# Sedute pianificate nei ±3 giorni",
    nearbyPlannedWorkouts?.trim() ||
      "Nessuna seduta pianificata nei giorni vicini.",
    "",
    "# Attività da valutare",
    activityDetail,
    "",
    "Restituisci una valutazione discorsiva (summary, 3-5 frasi), i dettagli catalogati e i flag pertinenti (true solo se davvero applicabili, altrimenti ometti/false).",
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
          target_hr_bpm: {
            type: Type.INTEGER,
            nullable: true,
            description:
              "HR media massima indicativa per la seduta (bpm), coerente con le zone dell'atleta (max/riposo nel contesto). Obbligatoria per easy/recovery/long; per ripetute/tempo indicala solo se utile.",
          },
          workout_steps: {
            type: Type.ARRAY,
            description:
              "Sequenza completa e già espansa delle fasi guidate. Espandi ogni ripetizione e recupero: non usare sintassi compatta tipo 6x400.",
            items: {
              type: Type.OBJECT,
              properties: {
                kind: { type: Type.STRING, enum: ["warmup", "work", "recovery", "steady", "cooldown"] },
                label: {
                  type: Type.STRING,
                  description:
                    "Istruzione italiana breve e autoesplicativa (max 48 caratteri) che dice COME correre la fase, senza ripetere distanza o durata già in completion_value: es. 'Corsa lenta per scaldarti', 'Veloce, passo gara 5 km', 'Recupero camminando', 'Recupero corsa lentissima', 'Facile, ritmo da chiacchierata'. Niente sigle (Z2, VO2, wu/cd).",
                },
                completion_type: { type: Type.STRING, enum: ["time", "distance", "manual"] },
                completion_value: {
                  type: Type.INTEGER,
                  nullable: true,
                  description: "Secondi per time, metri per distance, null per manual.",
                },
                pace_min_s_km: { type: Type.INTEGER, nullable: true },
                pace_max_s_km: { type: Type.INTEGER, nullable: true },
                hr_min_bpm: { type: Type.INTEGER, nullable: true },
                hr_max_bpm: { type: Type.INTEGER, nullable: true },
                variant: {
                  type: Type.STRING,
                  enum: ["sprint", "jog", "walk"],
                  nullable: true,
                  description:
                    "Come si corre la fase. 'sprint' solo con kind work: tratto breve a tutta (allunghi, sprint 10-40\" o 60-200 m), di solito senza passo target. 'jog' con kind recovery: recupero corricchiando piano. 'walk' con kind recovery: recupero camminando. null in tutti gli altri casi.",
                },
              },
              required: [
                "kind", "label", "completion_type", "completion_value",
                "pace_min_s_km", "pace_max_s_km", "hr_min_bpm", "hr_max_bpm", "variant",
              ],
            },
          },
          description: {
            type: Type.STRING,
            description:
              "Cosa fare e perché, in italiano semplice (3-4 frasi). La PRIMA frase descrive concretamente l'intera seduta dall'inizio alla fine come la spiegheresti a voce a un amico, con numeri reali: es. 'Scaldati con 10 minuti di corsa lenta. Poi corri 400 m veloce (circa 4:25/km) e recupera 90 secondi camminando; ripeti 6 volte. Chiudi con 10 minuti di corsa lenta.' Poi spiega perché è utile in questa fase. Niente gergo o sigle non spiegate (VO2max, soglia, Z2, strides, wu/cd): se usi un termine tecnico spiegalo tra parentesi.",
          },
          focus: {
            type: Type.STRING,
            description:
              "Indicazioni da coach per la seduta (2-3 frasi in italiano): su cosa concentrarsi mentre si corre, segnali da controllare, cosa privilegiare e cosa sacrificare se passo, HR o sensazioni divergono. Includi uno spunto tecnico, respiratorio o mentale concreto e pertinente.",
          },
        },
        required: ["date", "type", "target_distance_m", "target_pace_s_km", "target_duration_s", "target_hr_bpm", "workout_steps", "description", "focus"],
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
    "- Segui fortemente la 'Metodologia di riferimento' qui sotto: struttura della settimana, progressione di volume e lungo, rotazione degli stimoli, formato delle sedute e dei recuperi, tono.",
    "- Non programmare ogni singolo giorno: includi riposo e alterna intensità e volume in modo sensato verso l'obiettivo.",
    "- Una gara obiettivo NON è necessaria. Se non c'è un obiettivo attivo, o l'obiettivo non ha data (obiettivo generico), allena per migliorare in modo continuativo sulle distanze lunghe (mezza maratona e maratona, o la distanza indicata nell'obiettivo) seguendo i blocchi aperti della metodologia: non chiedere di fissare una gara e non introdurre tapering.",
    "- I passi target devono essere coerenti coi passi medi reali dell'atleta per ciascun tipo.",
    "- Usa la 'Calibrazione ritmi ↔ HR' nel contesto: se per un tipo di seduta la HR esce sopra la zona attesa (es. easy in Z3/Z4) o la deriva cardiaca è alta, quel ritmo OGGI non è sostenibile per quel tipo — rallenta i target di conseguenza e ricordalo nella review. Non riproporre lo stesso passo sperando che vada meglio.",
    "- Per ogni seduta compila sempre description e focus. In description chiarisci l'obiettivo fisiologico o tecnico della corsa, perché è utile in questa fase e quale risultato ricerca. In focus spiega cosa controllare durante la corsa, cosa privilegiare e cosa sacrificare (es. 'se la HR sale oltre il target, sacrifica il passo'), come farebbe un coach presente sul campo. Varia i focus tra tecnica di corsa, cadenza, respirazione e gestione mentale.",
    "- Le sedute devono essere comprensibili anche a chi non conosce il gergo: description inizia sempre con la spiegazione pratica dell'intera seduta (riscaldamento, cosa fare in ogni ripetuta, come recuperare e quante volte ripetere, defaticamento) e ogni label degli step dice come correre quella fase.",
    "- Per ogni seduta compila workout_steps con la sequenza operativa completa. Espandi ogni ripetuta e ogni recupero come fasi separate; includi riscaldamento e defaticamento quando pertinenti. Usa time con secondi, distance con metri e manual solo quando la fase non può avere un termine automatico. I range passo e HR devono essere realistici e ordinati.",
    "- Distingui sempre il tipo di tratto con variant: gli sprint e gli allunghi (kind work, variant sprint) e, per ogni recupero, se si fa corricchiando (variant jog) o camminando (variant walk). Scegli in base allo scopo, come da metodologia, e tieni conto di come l'atleta ha corso le ultime ripetute (tratti misurati nel contesto).",
    "- Se l'atleta ha una cadenza media bassa (<165 spm nel contesto), può valere un focus sulla cadenza in una seduta easy; non ossessionare su questo in ogni seduta.",
    "- Tieni conto dei feedback dell'atleta sulle corse recenti (note e RPE nel contesto, es. 'stanco', 'gambe pesanti', 'rilassato', 'scattante'): se le ultime corse segnalano fatica, fastidi o RPE alti su sedute facili, alleggerisci volume/intensità; se l'atleta è riposato e brillante, puoi progredire con più decisione.",
    "- Scrivi indicazioni operative e sufficientemente dettagliate, senza ripetizioni o introduzioni generiche.",
    "- Dai continuità alla progressione: la 'memoria coach' e lo 'storico piani recenti' nel contesto dicono in che fase siete (base, costruzione, intensità, velocità, scarico, avvicinamento gara). Prosegui il blocco in corso o passa al successivo in modo motivato; inserisci scarico periodico. Non ricominciare da capo a ogni piano.",
    "- Tieni conto delle attività non di corsa (calcio, bici, palestra…): se ricorrono in giorni fissi trattale come impegni da rispettare (pianifica riposo o easy intorno); un giorno con attività intensa di altro sport conta come carico, non come giorno libero — il giorno dopo meglio easy o riposo.",
    "- Se il contesto indica un REPLAN, parti dal piano attuale a calendario e dall'aderenza reale (piano vs reale): mantieni ciò che ha senso, correggi dove l'atleta è rimasto indietro o ha cambiato passo. Onora le note dei singoli giorni del piano attuale come vincoli (es. giorni in cui non può correre).",
    "- Se il contesto segnala uno stop prolungato (molti giorni/mesi senza corse), riparti con prudenza: meno volume e intensità, riprogressione graduale; non riprendere dai carichi precedenti allo stop.",
    "- Nella review (review_summary) confronta esplicitamente programmato vs fatto (incluse le attività non di corsa che hanno sostituito allenamenti) e motiva le scelte del nuovo piano.",
    "- Non esiste un'associazione esplicita tra piano e attività e lo status manuale non prova l'aderenza: deduci programmato vs fatto confrontando date e dati reali. Se una corrispondenza è ambigua, dichiaralo senza forzarla.",
    "- In coach_memory aggiorna la tua memoria di fase: dove siamo nel percorso, cosa è stato consolidato, focus del prossimo blocco. Parti dalla memoria precedente nel contesto, se presente.",
    comments && comments.trim()
      ? `- Vincoli/preferenze aggiuntivi dell'atleta da rispettare: ${comments.trim()}`
      : "",
    "",
    COACH_METHODOLOGY,
    "",
    "# Contesto atleta",
    contextMarkdown,
    "",
    "Restituisci la review (review_summary), la memoria aggiornata (coach_memory) e l'elenco dei workout.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Conversazione coach + proposta non applicata ────────────────────────────

const memoryCategories = [
  "availability", "vacation", "weather", "preference", "fatigue",
  "limitation", "pace_hr", "long_term",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const coachResponseSchemaZod = z.object({
  reply: z.string().min(1),
  conversation_summary: z.string().min(1),
  memories: z.array(z.object({
    memory_id: z.string().uuid().nullable(),
    category: z.enum(memoryCategories),
    content: z.string().min(1),
    valid_from: isoDate.nullable(),
    valid_until: isoDate.nullable(),
    confidence: z.number().min(0).max(1),
  })).default([]),
  goal_update: z.object({
    action: z.enum(["set", "clear"]),
    race_name: z.string().trim().max(120).nullable(),
    race_date: isoDate.nullable(),
    distance_m: z.number().int().min(1000).max(250_000).nullable(),
    target_time_s: z.number().int().positive().nullable(),
  }).nullable().catch(null),
  plan_summary: z.string().nullable(),
  remove_dates: z.array(isoDate).max(40).catch([]).default([]),
  workouts: z.array(z.object({
    date: isoDate,
    type: z.enum(WORKOUT_TYPES as [typeof WORKOUT_TYPES[number], ...typeof WORKOUT_TYPES[number][]]),
    target_distance_m: z.number().int().positive().nullable(),
    target_pace_s_km: z.number().int().positive().nullable(),
    target_duration_s: z.number().int().positive().nullable(),
    target_hr_bpm: z.number().int().min(80).max(220).nullable(),
    workout_steps: z.array(z.object({
      kind: z.enum(["warmup", "work", "recovery", "steady", "cooldown"]),
      label: z.string().trim().min(1).max(48),
      completion_type: z.enum(["time", "distance", "manual"]),
      completion_value: z.number().int().positive().nullable(),
      pace_min_s_km: z.number().int().min(120).max(1200).nullable(),
      pace_max_s_km: z.number().int().min(120).max(1200).nullable(),
      hr_min_bpm: z.number().int().min(80).max(220).nullable(),
      hr_max_bpm: z.number().int().min(80).max(220).nullable(),
      variant: z.enum(["sprint", "jog", "walk"]).nullish().catch(null),
    })).min(1).max(40),
    description: z.string().nullable(),
    focus: z.string().nullable(),
  })).default([]),
});

export type CoachResponse = z.infer<typeof coachResponseSchemaZod>;

export const coachResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    conversation_summary: { type: Type.STRING },
    memories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          memory_id: { type: Type.STRING, nullable: true },
          category: { type: Type.STRING, enum: [...memoryCategories] },
          content: { type: Type.STRING },
          valid_from: { type: Type.STRING, nullable: true },
          valid_until: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER },
        },
        required: ["memory_id", "category", "content", "valid_from", "valid_until", "confidence"],
      },
    },
    goal_update: {
      type: Type.OBJECT,
      nullable: true,
      description:
        "Cambio dell'obiettivo attivo dichiarato dall'atleta in questo messaggio (nuova gara a cui si è iscritto, nuovo obiettivo generico, nuovo tempo target, rinuncia alla gara). null se l'obiettivo non cambia.",
      properties: {
        action: {
          type: Type.STRING,
          enum: ["set", "clear"],
          description: "set = imposta/aggiorna l'obiettivo attivo; clear = nessun obiettivo attivo (miglioramento generico).",
        },
        race_name: {
          type: Type.STRING,
          nullable: true,
          description: "Nome della gara, o dell'obiettivo generico (es. 'Migliorare nella maratona'). null per usare un nome automatico.",
        },
        race_date: {
          type: Type.STRING,
          nullable: true,
          description: "Data gara YYYY-MM-DD; null per un obiettivo generico senza gara.",
        },
        distance_m: { type: Type.INTEGER, nullable: true, description: "Distanza in metri (mezza 21097, maratona 42195)." },
        target_time_s: { type: Type.INTEGER, nullable: true, description: "Tempo obiettivo in secondi, solo se dichiarato." },
      },
      required: ["action", "race_name", "race_date", "distance_m", "target_time_s"],
    },
    plan_summary: {
      type: Type.STRING,
      nullable: true,
      description: "Una frase su cosa cambia e in quali giorni (es. 'Sabato recupero al posto delle ripetute, domenica lungo accorciato a 14 km'). null se il piano non cambia.",
    },
    remove_dates: {
      type: Type.ARRAY,
      description: "Giorni (YYYY-MM-DD) in cui togliere la seduta senza sostituirla. Vuoto se non togli nulla. Un giorno non citato qui né in workouts resta com'è.",
      items: { type: Type.STRING },
    },
    workouts: {
      ...planSchema.properties!.workouts,
      description:
        "SOLO le sedute nuove o modificate, una per giorno toccato. Non ripetere le sedute che restano uguali: i giorni non citati non vengono toccati. Mai giorni con locked=true nel calendario.",
    },
  },
  required: ["reply", "conversation_summary", "memories", "goal_update", "plan_summary", "remove_dates", "workouts"],
};

export function buildCoachPrompt(contextJson: string, userMessage: string): string {
  return [
    "Sei l'allenatore di corsa di questo atleta, non un assistente compiacente. Lo segui da settimane: conosci il suo storico, il piano, la conversazione e le proposte che gli hai già fatto. Rispondi in italiano, diretto e concreto, come un coach vero a bordo pista.",
    "",
    "# Come ti comporti",
    "- La 'Metodologia di riferimento' qui sotto (il piano dell'allenatore da cui è nata l'app) è la spina dorsale: struttura della settimana, progressione, tipi di seduta e recuperi. I commenti e le richieste dell'atleta la ADATTANO, non la sostituiscono.",
    "- Prima di rispondere valuta ogni richiesta rispetto a obiettivo, fase, carico recente (training_state, history), sensazioni dichiarate e metodologia.",
    "- Se la richiesta è sensata, falla e spiega in una frase perché funziona.",
    "- Se è sbagliata o rischiosa (troppo volume tutto insieme, due sedute dure di fila, saltare lo scarico, lungo troppo lungo, ripetute a gambe stanche, correre con dolore o malattia), dillo chiaramente, spiega il motivo con i suoi dati e proponi l'alternativa migliore. Se è solo una preferenza a basso rischio e l'atleta insiste, accontentalo dichiarando il compromesso. Su dolore, infortunio o malattia non cedere: proteggi l'atleta.",
    "- Niente complimenti automatici, niente 'ottima idea', niente scuse o frasi di circostanza. Riconosci i progressi solo quando i dati li mostrano.",
    "- Motiva le scelte citando 1-2 numeri reali del contesto (carico, FC, passo, km): mai numeri inventati.",
    "- Fai al massimo una domanda, e solo se la risposta cambia davvero la decisione.",
    "- Rileggi la conversazione (conversation.recent_messages, conversation.summary) e le proposte precedenti con il loro esito (conversation.proposals): non riproporre ciò che l'atleta ha rifiutato senza un motivo nuovo, tieni conto delle sue correzioni e non contraddirti.",
    "- reply: 3-6 frasi, prima la decisione poi il perché. Se proponi modifiche, descrivi a parole semplici solo le sedute che cambiano.",
    "",
    "# Modificare il piano",
    "- current_plan.calendar elenca giorno per giorno le sedute in calendario e le corse fatte. I giorni con locked=true (passati, già corsi o completati) NON si toccano mai.",
    "- In workouts metti SOLO le sedute nuove o modificate. Non ripetere quelle che restano uguali: i giorni che non citi restano esattamente come sono. Per togliere una seduta senza sostituirla metti la data in remove_dates.",
    "- Rispetta il perimetro richiesto: 'cambia solo gli ultimi due allenamenti della settimana' = solo quei due giorni; 'la settimana prossima' = solo i giorni da lunedì a domenica della settimana successiva a quella di meta.today. Se pensi che serva cambiare anche un altro giorno (es. per non avere due sedute dure di fila), dillo nella reply e includilo solo se è davvero necessario.",
    "- Se l'atleta chiede di rifare il piano da zero, proponi tutte le sedute del periodo richiesto e metti in remove_dates i giorni che diventano riposo.",
    "- Date in Europe/Rome, tra meta.today e i 27 giorni successivi. Le modifiche non si applicano da sole: l'atleta le conferma nell'interfaccia. Se il messaggio non richiede modifiche, workouts e remove_dates vuoti e plan_summary null.",
    "- Quando crei o modifichi una seduta segui la metodologia e scala passi e volumi sui dati reali. Preserva riposo e progressività. Per easy/recovery/long la HR è il vincolo principale; se la calibrazione mostra un passo troppo duro, rallentalo invece di riproporlo.",
    "- Una gara obiettivo NON è necessaria. Senza obiettivo attivo o con un obiettivo senza data allena per migliorare in modo continuativo sulle distanze lunghe (o sulla distanza dell'obiettivo) seguendo i blocchi aperti della metodologia: non chiedere di fissare una gara e non introdurre tapering.",
    "- Per ogni workout proposto compila sempre description e focus. Ogni seduta deve essere comprensibile senza gergo: description inizia con la spiegazione pratica dell'intera seduta con numeri reali (riscaldamento, cosa fare in ogni ripetuta e a che passo, come recuperare — camminando o corricchiando — e quante volte, defaticamento), poi l'obiettivo fisiologico o tecnico e perché serve ora. focus: su cosa concentrarsi, segnali da osservare, come adattarsi se passo, HR o sensazioni non tornano. Ogni label degli step dice come correre quella fase.",
    "- workout_steps sempre completi e già espansi: riscaldamento, ogni singola ripetuta, ogni recupero (con variant jog o walk), sprint con variant sprint, parte continua, defaticamento.",
    "",
    "# Memoria e obiettivo",
    "- Estrai solo ricordi nuovi e davvero utili (disponibilità, vacanze, caldo, fatica, limitazioni, preferenze, feedback passo-HR). Per correggere o prolungare un ricordo usa il suo memory_id; per uno nuovo null. Niente duplicati. Una condizione temporanea senza durata scade 7 giorni dopo meta.today.",
    "- Escursioni e altri sport dichiarati sono vincoli e carico atteso: non metterli a calendario. Eccezione: se l'atleta chiede palestra/forza nel piano, salvala come ricordo 'preference' senza scadenza con la frequenza richiesta e mettila a calendario come da metodologia; se poi non la vuole più, chiudi quel ricordo (stesso memory_id, valid_until = meta.today) e toglila.",
    "- Obiettivo: se l'atleta dichiara un cambio (nuova gara, altra distanza, nuovo tempo, rinuncia, solo miglioramento generale) compila goal_update ('set' con i dati dichiarati, race_date null se senza gara, distance_m sempre valorizzata; 'clear' se non vuole obiettivi). Non inventare date o tempi: se manca la data della gara chiedila e lascia goal_update null. Il cambio si applica subito: confermalo e, se cambia la direzione, proponi le modifiche al piano nello stesso turno. Altrimenti goal_update = null.",
    "- conversation_summary aggiorna in poche frasi il riassunto precedente con ciò che conta per le prossime conversazioni (decisioni prese, richieste ricorrenti, cosa ha rifiutato), senza ripetere i ricordi strutturati.",
    "",
    COACH_METHODOLOGY,
    "",
    "# Contesto affidabile",
    contextJson,
    "",
    "# Nuovo messaggio dell'atleta",
    userMessage,
  ].join("\n");
}
