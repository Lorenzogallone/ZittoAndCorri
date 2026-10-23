"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { IntervalsConnectionView } from "@/lib/intervals/credentials";
import type { IntervalsTargetPreference } from "@/lib/intervals/workout-text";
import { IntegrationCard, IntegrationHelp } from "./integration-card";
import { deleteIntervalsKey, saveIntervalsKey, saveIntervalsOptions, syncIntervalsNow } from "./intervals-actions";

function formatDate(value: string | null): string {
  if (!value) return "mai";
  return new Date(value).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

const TARGETS: Array<{ value: IntervalsTargetPreference; label: string }> = [
  { value: "auto", label: "Automatico" },
  { value: "pace", label: "Passo" },
  { value: "hr", label: "Frequenza" },
];

export function IntervalsSection({
  initial,
}: {
  /** null = non collegato; undefined = database senza migrazione 0025. */
  initial: IntervalsConnectionView | null | undefined;
}) {
  const [connection, setConnection] = useState(initial ?? null);
  const [key, setKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (initial === undefined) {
    return (
      <IntegrationCard description="Importa corse e dati salute dall'orologio e manda il piano all'orologio, tramite Intervals.icu.">
        <p className="text-sm text-muted-foreground">Per attivarla serve aggiornare il database con la migrazione 0025.</p>
      </IntegrationCard>
    );
  }

  const save = () => startTransition(async () => {
    setError(null);
    setMessage(null);
    const result = await saveIntervalsKey(key);
    if (result.error || !result.athlete) return setError(result.error ?? "Chiave non salvata.");
    setConnection((current) => ({
      last_four: key.trim().slice(-4),
      athlete_id: result.athlete!.id,
      athlete_name: result.athlete!.name,
      import_activities: current?.import_activities ?? true,
      import_wellness: current?.import_wellness ?? true,
      publish_plan: current?.publish_plan ?? true,
      target_preference: current?.target_preference ?? "auto",
      last_import_at: current?.last_import_at ?? null,
      last_publish_at: current?.last_publish_at ?? null,
      last_error: null,
      verified_at: new Date().toISOString(),
    }));
    setKey("");
    setEditing(false);
    setMessage("Chiave salvata. Tocca “Sincronizza ora” per il primo import.");
  });

  const remove = () => {
    if (!window.confirm("Scollegare Intervals.icu? Le corse già importate restano.")) return;
    startTransition(async () => {
      const result = await deleteIntervalsKey();
      if (result.error) return setError(result.error);
      setConnection(null);
      setMessage(null);
    });
  };

  const setOption = (patch: Partial<Pick<IntervalsConnectionView, "import_activities" | "import_wellness" | "publish_plan" | "target_preference">>) => {
    if (!connection) return;
    const previous = connection;
    setConnection({ ...connection, ...patch });
    startTransition(async () => {
      const result = await saveIntervalsOptions(patch);
      if (result.error) {
        setConnection(previous);
        setError(result.error);
      }
    });
  };

  const sync = () => startTransition(async () => {
    setError(null);
    setMessage(null);
    const response = await syncIntervalsNow();
    if (response.error || !response.result) return setError(response.error ?? "Sincronizzazione non riuscita.");
    const { import: imported, publish, error: syncError } = response.result;
    const parts: string[] = [];
    if (imported) {
      parts.push(`${imported.activities.imported} ${imported.activities.imported === 1 ? "corsa importata" : "corse importate"}`);
      parts.push(`${imported.wellness.days} giorni di dati salute`);
    }
    if (publish) parts.push(`piano: ${publish.created} nuove, ${publish.updated} aggiornate, ${publish.deleted} tolte`);
    setMessage(parts.join(" · ") || "Niente da sincronizzare.");
    const now = new Date().toISOString();
    setConnection((current) => current ? {
      ...current,
      last_import_at: imported ? now : current.last_import_at,
      last_publish_at: publish ? now : current.last_publish_at,
      last_error: syncError,
    } : current);
  });

  return (
    <IntegrationCard
      id="intervals-integration"
      description="Il ponte ufficiale con l'orologio: Zepp manda corse e dati salute a Intervals.icu, e Intervals porta il tuo piano sull'orologio come allenamenti guidati."
    >
      <div className="space-y-4">
        {connection && !editing ? (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Check size={16} className="shrink-0 text-emerald-500" />
                <span className="truncate">{connection.athlete_name ?? connection.athlete_id} · ••••{connection.last_four}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(true)}>Sostituisci</Button>
                <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={remove} title="Scollega"><Trash2 size={15} /></Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm">Importa le corse</p>
                <Switch checked={connection.import_activities} disabled={pending} onCheckedChange={(value) => setOption({ import_activities: value })} aria-label="Importa le corse" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm">Importa sonno, FC a riposo e HRV</p>
                <Switch checked={connection.import_wellness} disabled={pending} onCheckedChange={(value) => setOption({ import_wellness: value })} aria-label="Importa i dati salute" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm">Manda il piano all&apos;orologio</p>
                <Switch checked={connection.publish_plan} disabled={pending} onCheckedChange={(value) => setOption({ publish_plan: value })} aria-label="Manda il piano all'orologio" />
              </div>
              {connection.publish_plan && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Target delle fasi sull&apos;orologio</p>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                    {TARGETS.map((target) => (
                      <button
                        key={target.value}
                        type="button"
                        disabled={pending}
                        onClick={() => setOption({ target_preference: target.value })}
                        className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${connection.target_preference === target.value ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                      >
                        {target.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Automatico usa il passo nelle ripetute e la frequenza nel resto. Se l&apos;orologio non mostra i passi, scegli Frequenza.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Ultimo import: {formatDate(connection.last_import_at)}</p>
              <p>Ultimo invio del piano: {formatDate(connection.last_publish_at)}</p>
              {connection.last_error && <p className="text-destructive">Ultimo errore: {connection.last_error}</p>}
            </div>

            <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={sync}>
              <RefreshCw size={15} className={pending ? "animate-spin" : undefined} /> {pending ? "Sincronizzo…" : "Sincronizza ora"}
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="intervals-key">Chiave API Intervals.icu</Label>
              <Input id="intervals-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder="La trovi in Settings → Developer" />
            </div>
            <div className="flex gap-2">
              <Button type="button" className="flex-1" disabled={pending || key.trim().length < 8} onClick={save}>
                {pending ? "Verifico…" : "Verifica e salva"}
              </Button>
              {connection && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setKey(""); }}>Annulla</Button>}
            </div>
          </div>
        )}

        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

        <IntegrationHelp title="Come collegarlo">
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>Crea un account gratuito su Intervals.icu.</li>
            <li>Nell&apos;app Zepp: Profilo → Collegamento account di terze parti → Intervals.icu.</li>
            <li>Su Intervals.icu, Settings → riquadro Amazfit: attiva il download del wellness e dell&apos;HRV.</li>
            <li>Sempre in Settings, in fondo (Developer): copia la API key e incollala qui.</li>
          </ol>
          <p className="mt-3">
            Le corse arrivano due volte al giorno, dopo che l&apos;app Zepp ha sincronizzato l&apos;orologio. Il piano dei prossimi 7 giorni compare
            sull&apos;orologio in Allenamento → Il mio piano.
          </p>
          <a href="https://intervals.icu/settings" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-medium text-primary">
            Apri Intervals.icu <ExternalLink size={12} />
          </a>
        </IntegrationHelp>
      </div>
    </IntegrationCard>
  );
}
