"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { claimIntervalsImport } from "@/lib/intervals/credentials";
import { runIntervalsSync } from "@/lib/intervals/sync";

export interface RefreshResult {
  /** Corse nuove arrivate dall'orologio (via Intervals.icu). */
  imported: number;
  /** L'import è ancora in corso: le corse arrivano al prossimo aggiornamento. */
  stillSyncing?: boolean;
  error?: string;
}

/** Due ricariche ravvicinate non rifanno l'import. */
const MIN_INTERVAL_MS = 60_000;
/** Oltre questo tempo la pagina si ricarica comunque; l'import finisce dopo. */
const WAIT_MS = 12_000;

/**
 * Trascina-giù e pulsante «Aggiorna»: importa subito corse e wellness
 * dell'orologio (Zepp → Intervals.icu) invece di aspettare il cron o il giro
 * all'apertura, che gira dopo la risposta e quindi non si vede nella pagina
 * appena caricata. Le corse nuove avviano da sole l'analisi AI. Alla fine
 * `refresh()` rifà il fetch dei dati della pagina nella stessa risposta.
 *
 * La sincronizzazione dell'app Zepp sull'orologio non si può avviare da qui:
 * è l'app sul telefono a mandare i dati quando si collega all'orologio.
 */
export async function refreshAppData(): Promise<RefreshResult> {
  const result = await syncFromWatch();
  refresh();
  return result;
}

async function syncFromWatch(): Promise<RefreshResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { imported: 0 };

  try {
    const connection = await claimIntervalsImport(user.id, MIN_INTERVAL_MS);
    if (!connection || !(connection.import_activities || connection.import_wellness)) return { imported: 0 };

    const sync = runIntervalsSync(user.id, connection, { publish: false });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS));
    const result = await Promise.race([sync, timeout]);
    if (!result) {
      after(() => sync.then(() => undefined, (error) => {
        console.error("refreshAppData:", error instanceof Error ? error.message : error);
      }));
      return { imported: 0, stillSyncing: true };
    }
    return {
      imported: result.import?.activities.imported ?? 0,
      error: result.error ? "Sincronizzazione con l'orologio non riuscita." : undefined,
    };
  } catch (error) {
    console.error("refreshAppData:", error instanceof Error ? error.message : error);
    return { imported: 0, error: "Sincronizzazione con l'orologio non riuscita." };
  }
}
