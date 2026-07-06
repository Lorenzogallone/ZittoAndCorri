"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pollAiJob } from "@/app/actions/ai-jobs";
import { clientLog, isStandalone } from "@/lib/clientlog";

const POLL_INTERVAL_MS = 2_000;
// Oltre questo tempo smettiamo di interrogare il job: la chiamata AI ha un
// deadline interno < 60s, quindi un job ancora 'pending' qui è bloccato.
const MAX_POLL_MS = 75_000;
// In PWA standalone: tempo concesso a router.refresh() per far arrivare il
// nuovo contenuto server-rendered prima di ripiegare sul reload completo.
const REFRESH_WATCHDOG_MS = 8_000;
// Circuit breaker anti-loop: non più di UN reload automatico per contesto in
// questa finestra. Su iOS il clear di localStorage può andare perso attraverso
// un reload (persistenza asincrona di WebKit): senza questo freno un job
// 'done' rimasto persistito rimetterebbe in loop reload → splash → reload.
const RELOAD_BREAKER_MS = 90_000;
// Un job persistito può essere ripreso al massimo così tante volte: oltre,
// qualcosa è andato storto (loop di rilanci) e va abbandonato.
const MAX_RESUMES = 2;

interface StartResult {
  jobId?: string;
  error?: string;
}

/** Voce persistita di un job in volo: id + scadenza assoluta del polling. */
interface PersistedJob {
  jobId: string;
  deadline: number;
  /** Quante volte il polling è stato ripreso dopo un reload/rilancio. */
  resumes?: number;
}

/** Chiave localStorage per un dato contesto (es. "plan", "eval:<id>"). */
function storageKeyFor(key: string): string {
  return `ai-job:${key}`;
}

/** Legge un job persistito ancora valido; pulisce le voci scadute/corrotte. */
function readPersisted(key: string): PersistedJob | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKeyFor(key));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedJob>;
    if (
      typeof parsed.jobId === "string" &&
      typeof parsed.deadline === "number" &&
      Date.now() < parsed.deadline
    ) {
      return {
        jobId: parsed.jobId,
        deadline: parsed.deadline,
        resumes: typeof parsed.resumes === "number" ? parsed.resumes : 0,
      };
    }
  } catch {
    // voce corrotta: cade nel clear sotto
  }
  clearPersisted(key);
  return null;
}

/** Chiave del circuit breaker reload per un dato contesto. */
function breakerKeyFor(key?: string): string {
  return `ai-job-reload:${key ?? "anon"}`;
}

/** True se per questo contesto non c'è stato un reload automatico recente. */
function canAutoReload(key?: string): boolean {
  try {
    const raw = window.localStorage.getItem(breakerKeyFor(key));
    if (raw && Date.now() - Number(raw) < RELOAD_BREAKER_MS) return false;
  } catch {
    // localStorage assente: nessuna memoria del breaker, si può ricaricare
  }
  return true;
}

/** Registra il reload automatico appena deciso (PRIMA di eseguirlo). */
function markAutoReload(key?: string): void {
  try {
    window.localStorage.setItem(breakerKeyFor(key), String(Date.now()));
  } catch {
    // ignora
  }
}

function writePersisted(key: string, job: PersistedJob): void {
  try {
    window.localStorage.setItem(storageKeyFor(key), JSON.stringify(job));
  } catch {
    // localStorage non disponibile: la ripresa post-reload non funzionerà,
    // ma il flusso normale (senza reload) resta intatto.
  }
}

function clearPersisted(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKeyFor(key));
  } catch {
    // ignora
  }
}

/**
 * Gestisce il ciclo di una richiesta AI asincrona: lancia la server action di
 * avvio (che ritorna subito un `jobId`) e poi fa polling di `ai_jobs` finché il
 * job non è 'done' o 'error'. `pending` resta true per tutta l'attesa, così
 * l'overlay di "pensiero" del coach copre i ~50s medi. Su 'done' fa
 * `router.refresh()` per mostrare il risultato server-rendered.
 *
 * `persistKey` (opzionale) abilita la ripresa del polling dopo un reload: il
 * job in volo viene salvato in localStorage e, al rimontaggio del componente,
 * il polling riparte da solo. Serve su iOS PWA standalone, dove il sistema può
 * rilanciare l'app (tornando allo splash) durante l'attesa: senza ripresa il
 * job finirebbe lato server ma l'UI resterebbe bloccata.
 *
 * `refreshSignal` (opzionale) è un valore server-rendered che CAMBIA quando il
 * risultato è arrivato (es. created_at dell'ultima review/valutazione). Con il
 * segnale, anche in PWA standalone si usa il refresh soft (niente flash da
 * reload): un watchdog controlla che il segnale cambi entro pochi secondi e
 * solo se il refresh soft si impalla — capita su iOS con l'RSC fetch — ripiega
 * sul reload completo. Senza segnale, in standalone si ricarica come prima.
 */
export function useAiJob(
  persistKey?: string,
  refreshSignal?: string | number | null,
) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invalida i poll in volo quando parte una nuova richiesta o si smonta.
  const runIdRef = useRef(0);

  // Refresh soft in corso: segnale catturato al momento del 'done' + watchdog.
  const signalRef = useRef(refreshSignal);
  useEffect(() => {
    signalRef.current = refreshSignal;
  }, [refreshSignal]);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalAtDoneRef = useRef<string | number | null | undefined>(undefined);

  useEffect(
    () => () => {
      runIdRef.current += 1;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    },
    [],
  );

  // Il nuovo contenuto server-rendered è arrivato (il segnale è cambiato):
  // il refresh soft ha funzionato, il watchdog non serve più.
  useEffect(() => {
    if (watchdogRef.current == null) return;
    if (signalAtDoneRef.current === refreshSignal) return;
    clientLog("aijob:refresh-confirmed", { key: persistKey });
    clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  }, [refreshSignal, persistKey]);

  // Reload automatico con circuit breaker: al massimo uno per contesto ogni
  // RELOAD_BREAKER_MS. Se un reload recente c'è già stato, NON ricarica (è
  // così che si spezzano i loop reload → splash → reload): resta sulla pagina
  // e tenta un ultimo refresh soft.
  const reloadOnce = useCallback(
    (reason: string) => {
      if (!canAutoReload(persistKey)) {
        clientLog("aijob:reload-suppressed", { key: persistKey, reason });
        if (persistKey) clearPersisted(persistKey);
        try {
          router.refresh();
        } catch {
          // niente: meglio una pagina ferma di un loop di reload
        }
        return;
      }
      markAutoReload(persistKey);
      clientLog(reason, { key: persistKey });
      window.location.reload();
    },
    [persistKey, router],
  );

  const finishWithRefresh = useCallback(() => {
    setDone(true);
    setPending(false);

    const canConfirm = refreshSignal != null;
    if (isStandalone() && !canConfirm) {
      // Nessun segnale per verificare il refresh soft: in PWA il reload
      // completo resta l'unica opzione affidabile.
      reloadOnce("aijob:done-hard-reload");
      return;
    }

    clientLog("aijob:done-soft-refresh", { key: persistKey });
    signalAtDoneRef.current = signalRef.current;

    if (isStandalone()) {
      // Watchdog (armato PRIMA del refresh): se il payload RSC non arriva
      // (refresh appeso, tipico di iOS standalone su rete mobile), ripiega
      // sul reload completo — uno solo, grazie al breaker.
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        reloadOnce("aijob:refresh-watchdog-reload");
      }, REFRESH_WATCHDOG_MS);
    }

    router.refresh();
  }, [persistKey, refreshSignal, reloadOnce, router]);

  // Ciclo di polling riusato sia all'avvio sia alla ripresa post-reload.
  const runPoll = useCallback(
    (jobId: string, deadline: number, runId: number) => {
      const poll = async () => {
        if (runId !== runIdRef.current) return;
        if (Date.now() > deadline) {
          if (persistKey) clearPersisted(persistKey);
          setError("L'AI ci sta mettendo troppo. Riprova tra poco.");
          setPending(false);
          return;
        }
        try {
          const status = await pollAiJob(jobId);
          if (runId !== runIdRef.current) return;
          clientLog("aijob:poll", { key: persistKey, status: status.status });
          if (status.status === "done") {
            if (persistKey) clearPersisted(persistKey);
            // Isolato dal ciclo di poll: se il refresh lancia, il catch
            // esterno NON deve rimettere in coda il polling di un job già
            // concluso (sarebbe un loop di refresh ogni 2s).
            try {
              finishWithRefresh();
            } catch {
              // stato done già impostato: al peggio serve un refresh manuale
            }
            return;
          }
          if (status.status === "error") {
            if (persistKey) clearPersisted(persistKey);
            setError(status.error ?? "Richiesta AI non riuscita. Riprova.");
            setPending(false);
            return;
          }
          if (status.status === "missing") {
            if (persistKey) clearPersisted(persistKey);
            setError("Richiesta AI non trovata. Riprova.");
            setPending(false);
            return;
          }
        } catch {
          // Errore di rete transitorio: ritenta al prossimo giro.
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      };

      setTimeout(poll, POLL_INTERVAL_MS);
    },
    [persistKey, finishWithRefresh],
  );

  // Ripresa al montaggio: se c'è un job persistito ancora valido (es. dopo un
  // reload della PWA su iOS), riattacca il polling e mostra di nuovo l'overlay.
  // Il contatore `resumes` limita le riprese: se lo stesso job viene ripreso
  // più di MAX_RESUMES volte significa che l'app sta ripartendo in loop —
  // il job va abbandonato, non ripreso all'infinito.
  useEffect(() => {
    if (!persistKey) return;
    const saved = readPersisted(persistKey);
    if (!saved) return;
    const resumes = saved.resumes ?? 0;
    if (resumes >= MAX_RESUMES) {
      clientLog("aijob:resume-abandoned", { key: persistKey, resumes });
      clearPersisted(persistKey);
      return;
    }
    writePersisted(persistKey, { ...saved, resumes: resumes + 1 });
    clientLog("aijob:resume", { key: persistKey, resumes: resumes + 1 });
    const runId = ++runIdRef.current;
    setError(null);
    setDone(false);
    setPending(true);
    runPoll(saved.jobId, saved.deadline, runId);
    // Eseguito una sola volta al montaggio: persistKey/runPoll sono stabili.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(
    async (starter: () => Promise<StartResult>) => {
      const runId = ++runIdRef.current;
      setError(null);
      setDone(false);
      setPending(true);

      let res: StartResult;
      try {
        res = await starter();
      } catch {
        if (runId !== runIdRef.current) return;
        setError("Richiesta non avviata. Riprova.");
        setPending(false);
        return;
      }
      if (runId !== runIdRef.current) return;
      if (res.error || !res.jobId) {
        setError(res.error ?? "Richiesta non avviata. Riprova.");
        setPending(false);
        return;
      }

      const jobId = res.jobId;
      const deadline = Date.now() + MAX_POLL_MS;
      if (persistKey) writePersisted(persistKey, { jobId, deadline });
      clientLog("aijob:start", { key: persistKey, jobId });

      runPoll(jobId, deadline, runId);
    },
    [persistKey, runPoll],
  );

  return { pending, done, error, start };
}
