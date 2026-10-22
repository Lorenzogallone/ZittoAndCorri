"use client";

import { useState, useTransition } from "react";
import { Check, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

/** Oltre questo limite i dati giornalieri dell'orologio vengono ignorati (vedi lib/zepp/data). */
const STALE_MS = 3 * 86_400_000;

export function ZeppIntegrationSection({ initialConnection }: Props) {
  const [connection, setConnection] = useState(initialConnection);
  const [enabled, setEnabled] = useState(Boolean(initialConnection?.enabled));
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now] = useState(() => Date.now());
  const stale = Boolean(connection?.last_sync_at) && now - new Date(connection!.last_sync_at!).getTime() > STALE_MS;

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
      description="Facoltativo: porta sonno, recupero e zone cardiache dall'orologio."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium">Usa i dati dell&apos;orologio</p>
          <Switch checked={enabled} onCheckedChange={toggle} disabled={pending} aria-label="Usa i dati dell'orologio" />
        </div>

        {!enabled ? null : connection?.enabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Check size={16} className="text-emerald-500" />
              <span className="font-medium">{connection.device_name ?? "Orologio Zepp"} collegato</span>
            </div>
            <p className={`text-xs ${stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
              Ultima sincronizzazione: {formatDate(connection.last_sync_at)}
              {stale && " · i dati vecchi non vengono usati finché non risincronizzi"}
            </p>
            {connection.last_error && <p className="text-xs text-destructive">Ultimo errore: {connection.last_error}</p>}
            <Button type="button" variant="ghost" size="sm" className="-ml-3 text-destructive hover:text-destructive" disabled={pending} onClick={remove}>
              <Trash2 size={14} /> Scollega e cancella i dati
            </Button>
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

        <IntegrationHelp title="Come collegare l'orologio">
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>Genera il codice qui sopra (valido 10 minuti).</li>
            <li>
              <strong>App Salute (sync dati):</strong> apri Zepp sul telefono → il tuo orologio → App → Zitto e Corri → Impostazioni → incolla il codice → <em>Collega</em>.
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
