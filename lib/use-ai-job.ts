"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pollAiJob, type AiJobStatus } from "@/app/actions/ai-jobs";
import { clientLog } from "@/lib/clientlog";
import { APP_REFRESH_EVENT } from "@/lib/use-app-refresh";

const POLL_INTERVAL_MS = 2_000;
// Oltre questo tempo smettiamo di interrogare il job. La chat del coach può
// durare fino a 270 s con i modelli lenti (le altre analisi 180 s); lasciamo
// un altro minuto per salvataggio e ritardi di rete mobile prima di
// considerare il job realmente bloccato.
const MAX_POLL_MS = 330_000;

interface StartResult {
  jobId?: string;
  error?: string;
}

/** Voce persistita di un job in volo: id + scadenza assoluta del polling. */
interface PersistedJob {
  jobId: string;
  deadline: number;
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
      return { jobId: parsed.jobId, deadline: parsed.deadline };
    }
  } catch {
    // voce corrotta: cade nel clear sotto
  }
  clearPersisted(key);
  return null;
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
 * `router.refresh()` per mostrare il risultato server-rendered, oppure consegna
 * il risultato al callback `onDone` senza alcun refresh della pagina.
 *
 * `persistKey` (opzionale) abilita la ripresa del polling dopo un reload: il
 * job in volo viene salvato in localStorage e, al rimontaggio del componente,
 * il polling riparte da solo. Serve su iOS PWA standalone, dove il sistema può
 * rilanciare l'app (tornando allo splash) durante l'attesa: senza ripresa il
 * job finirebbe lato server ma l'UI resterebbe bloccata.
 *
 * Non viene mai eseguito un reload completo: in PWA farebbe riapparire la splash
 * e interromperebbe la continuità dell'interfaccia.
 */
export function useAiJob(
  persistKey?: string,
  options?: { onDone?: (status: AiJobStatus) => void | Promise<void> },
) {
  const router = useRouter();
  const onDone = options?.onDone;
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invalida i poll in volo quando parte una nuova richiesta o si smonta.
  const runIdRef = useRef(0);
  useEffect(() => () => {
    runIdRef.current += 1;
  }, []);

  // Job che il polling sta seguendo adesso (null a polling finito).
  const pollingJobRef = useRef<string | null>(null);

  // Ciclo di polling riusato sia all'avvio sia alla ripresa post-reload.
  const runPoll = useCallback(
    (jobId: string, deadline: number, runId: number) => {
      pollingJobRef.current = jobId;
      const finish = () => {
        if (persistKey) clearPersisted(persistKey);
        if (pollingJobRef.current === jobId) pollingJobRef.current = null;
      };
      const poll = async () => {
        if (runId !== runIdRef.current) return;
        if (Date.now() > deadline) {
          finish();
          setError("L'AI ci sta mettendo troppo. Riprova tra poco.");
          setPending(false);
          return;
        }
        try {
          const status = await pollAiJob(jobId);
          if (runId !== runIdRef.current) return;
          clientLog("aijob:poll", { key: persistKey, status: status.status });
          if (status.status === "done") {
            finish();
            try {
              if (onDone) await onDone(status);
              else router.refresh();
              setDone(true);
              setPending(false);
            } catch {
              setError("Risposta ricevuta, ma non è stato possibile mostrarla. Riprova.");
              setPending(false);
            }
            return;
          }
          if (status.status === "error") {
            finish();
            setError(status.error ?? "Richiesta AI non riuscita. Riprova.");
            setPending(false);
            return;
          }
          if (status.status === "missing") {
            finish();
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
    [onDone, persistKey, router],
  );

  // Dopo il trascina-giù: se c'è un job salvato che questo hook non sta già
  // seguendo (polling scaduto o fermato), riprende a interrogarlo.
  useEffect(() => {
    if (!persistKey) return;
    const resume = () => {
      const saved = readPersisted(persistKey);
      if (!saved || pollingJobRef.current === saved.jobId) return;
      const runId = ++runIdRef.current;
      setError(null);
      setDone(false);
      setPending(true);
      runPoll(saved.jobId, saved.deadline, runId);
    };
    window.addEventListener(APP_REFRESH_EVENT, resume);
    return () => window.removeEventListener(APP_REFRESH_EVENT, resume);
  }, [persistKey, runPoll]);

  // Ripresa al montaggio: se c'è un job persistito ancora valido (es. dopo un
  // reload della PWA su iOS), riattacca il polling e mostra di nuovo l'overlay.
  useEffect(() => {
    if (!persistKey) return;
    const saved = readPersisted(persistKey);
    if (!saved) return;
    const timer = window.setTimeout(() => {
      const runId = ++runIdRef.current;
      setError(null);
      setDone(false);
      setPending(true);
      runPoll(saved.jobId, saved.deadline, runId);
    }, 0);
    return () => window.clearTimeout(timer);
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
