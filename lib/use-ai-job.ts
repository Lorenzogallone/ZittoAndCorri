"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pollAiJob } from "@/app/actions/ai-jobs";

const POLL_INTERVAL_MS = 2_000;
// Oltre questo tempo smettiamo di interrogare il job: la chiamata AI ha un
// deadline interno < 60s, quindi un job ancora 'pending' qui è bloccato.
const MAX_POLL_MS = 75_000;

interface StartResult {
  jobId?: string;
  error?: string;
}

/**
 * Gestisce il ciclo di una richiesta AI asincrona: lancia la server action di
 * avvio (che ritorna subito un `jobId`) e poi fa polling di `ai_jobs` finché il
 * job non è 'done' o 'error'. `pending` resta true per tutta l'attesa, così
 * l'overlay di "pensiero" del coach copre i ~50s medi. Su 'done' fa
 * `router.refresh()` per mostrare il risultato server-rendered.
 */
export function useAiJob() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invalida i poll in volo quando parte una nuova richiesta o si smonta.
  const runIdRef = useRef(0);
  useEffect(() => () => {
    runIdRef.current += 1;
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

      const poll = async () => {
        if (runId !== runIdRef.current) return;
        if (Date.now() > deadline) {
          setError("L'AI ci sta mettendo troppo. Riprova tra poco.");
          setPending(false);
          return;
        }
        try {
          const status = await pollAiJob(jobId);
          if (runId !== runIdRef.current) return;
          if (status.status === "done") {
            setDone(true);
            setPending(false);
            router.refresh();
            return;
          }
          if (status.status === "error") {
            setError(status.error ?? "Richiesta AI non riuscita. Riprova.");
            setPending(false);
            return;
          }
          if (status.status === "missing") {
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
    [router],
  );

  return { pending, done, error, start };
}
