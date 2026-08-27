"use client";

import { useState, useTransition } from "react";
import { Check, Link2, Trash2, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntegrationCard, IntegrationHelp } from "./integration-card";
import {
  deleteZeppConnectionData,
  disableZeppConnection,
  generateZeppPairingCode,
} from "./zepp-actions";
import type { ZeppConnectionView } from "@/lib/zepp/types";

interface Props {
  initialConnection: ZeppConnectionView | null;
}

function formatDate(value: string | null): string {
  if (!value) return "Mai";
  return new Date(value).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

export function ZeppIntegrationSection({ initialConnection }: Props) {
  const [connection, setConnection] = useState(initialConnection);
  const [enabled, setEnabled] = useState(Boolean(initialConnection?.enabled));
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () => startTransition(async () => {
    setError(null);
    const result = await generateZeppPairingCode();
    if (result.error || !result.code) return setError(result.error ?? "Codice non disponibile.");
    setCode(result.code);
    setExpiresAt(result.expiresAt ?? null);
  });

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  const disable = () => {
    if (connection?.enabled && !window.confirm("Disattivare Zepp? Il token verrà revocato e per ricollegarlo servirà un nuovo codice.")) return;
    startTransition(async () => {
      const result = await disableZeppConnection();
      if (result.error) return setError(result.error);
      setConnection((current) => current ? { ...current, enabled: false } : null);
      setEnabled(false);
      setCode(null);
      setExpiresAt(null);
      setError(null);
    });
  };

  const toggle = () => {
    if (enabled) {
      disable();
      return;
    }
    setEnabled(true);
    generate();
  };

  const remove = () => {
    if (!window.confirm("Eliminare definitivamente collegamento e storico Zepp? Questa operazione non è reversibile.")) return;
    startTransition(async () => {
      const result = await deleteZeppConnectionData();
      if (result.error) return setError(result.error);
      setConnection(null);
      setEnabled(false);
      setCode(null);
      setExpiresAt(null);
      setError(null);
    });
  };

  return (
    <IntegrationCard
      id="zepp-os-integration"
      icon={<Watch size={18} />}
      title="Zepp OS"
      description="Opzionale: se non la attivi, ZittoAndCorri continua a usare esattamente il calcolo interno precedente."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Usa i dati Zepp OS</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {enabled ? "Attiva per questo account" : "Disattivata: viene usato solo il calcolo interno"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Usa i dati Zepp OS"
            disabled={pending}
            onClick={toggle}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? "left-6" : "left-1"}`} />
          </button>
        </div>

        {!enabled ? (
          <p className="rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Nessun dispositivo richiesto. Attiva lo switch solo se vuoi collegare un orologio Zepp OS compatibile.
          </p>
        ) : connection?.enabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
              <Check size={16} />
              <span className="font-medium">{connection.device_name ?? "Orologio Zepp"} collegato</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-muted-foreground">Ultima sync</dt><dd className="mt-1 font-medium">{formatDate(connection.last_sync_at)}</dd></div>
              <div><dt className="text-muted-foreground">API level</dt><dd className="mt-1 font-medium">{connection.api_level ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Zepp OS</dt><dd className="mt-1 font-medium">{connection.os_version ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Automatica</dt><dd className="mt-1 font-medium">08:00 · 23:00</dd></div>
            </dl>
            {connection.last_error && <p className="text-xs text-destructive">Ultimo errore: {connection.last_error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={remove}>
                <Trash2 size={14} /> Scollega e cancella
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {code ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-center">
                <p className="text-xs text-muted-foreground">Codice ZittoAndCorri</p>
                <button type="button" onClick={copy} className="mt-2 font-mono text-3xl font-bold tracking-[0.3em] text-primary">
                  {code}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {copied ? "Copiato" : `Valido fino alle ${expiresAt ? new Date(expiresAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "prossime 10 min"}`}
                </p>
                <p className="mt-1 text-xs font-medium text-primary/80">
                  Usalo per collegare sia l&apos;app Salute che il Coach.
                </p>
              </div>
            ) : (
              <Button type="button" className="w-full" disabled={pending} onClick={generate}>
                <Link2 size={16} /> {pending ? "Generazione…" : "Genera codice di collegamento"}
              </Button>
            )}
            {code && <Button type="button" variant="outline" size="sm" className="w-full" disabled={pending} onClick={generate}>Genera un nuovo codice</Button>}
          </div>
        )}

        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

        <IntegrationHelp title="Come collegare le due app con lo stesso codice">
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>Genera il codice qui sopra (valido 10 minuti).</li>
            <li>
              <strong>App Salute (sync dati):</strong> apri Zepp sul telefono → Active 3 Premium → App → Zitto e Corri → Impostazioni → incolla il codice → <em>Collega</em>.
            </li>
            <li>
              <strong>App Coach (allenamenti):</strong> sempre in Zepp → App → Zitto e Corri Coach → Impostazioni → incolla lo <strong>stesso codice</strong> → <em>Collega</em>.
            </li>
            <li>Apri il Mini Program sull&apos;orologio per la prima sincronizzazione.</li>
          </ol>
          <p className="mt-3 text-muted-foreground">Il codice può essere usato una volta per ciascuna app nello stesso intervallo di validità. Se scade prima di collegare la seconda app, genera un nuovo codice.</p>
        </IntegrationHelp>
      </div>
    </IntegrationCard>
  );
}
