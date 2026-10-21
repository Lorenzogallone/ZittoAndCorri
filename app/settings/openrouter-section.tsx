"use client";

import { useState } from "react";
import { Check, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteOpenRouterKey, saveOpenRouterKey } from "./actions";
import { IntegrationCard, IntegrationHelp } from "./integration-card";

export function OpenRouterSection({
  initial,
}: {
  /** null = chiave assente; undefined = database da aggiornare. */
  initial: { lastFour: string } | null | undefined;
}) {
  const [configured, setConfigured] = useState(initial ?? null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initial === undefined) {
    return (
      <IntegrationCard description="Alternativa a Gemini: centinaia di modelli (Claude, GPT, DeepSeek…) con una sola chiave.">
        <p className="text-sm text-muted-foreground">Per attivarla serve aggiornare il database con la migrazione 0023.</p>
      </IntegrationCard>
    );
  }

  async function saveKey() {
    setPending(true);
    setError(null);
    const result = await saveOpenRouterKey(key);
    if (result.error) setError(result.error);
    else {
      setConfigured({ lastFour: key.trim().slice(-4) });
      setKey("");
      setEditing(false);
      setJustSaved(true);
    }
    setPending(false);
  }

  async function remove() {
    if (!window.confirm("Rimuovere la chiave OpenRouter? Chat e analisi useranno Gemini.")) return;
    setPending(true);
    const result = await deleteOpenRouterKey();
    if (result.error) setError(result.error);
    else setConfigured(null);
    setPending(false);
  }

  return (
    <IntegrationCard id="openrouter-integration" description="Alternativa a Gemini: centinaia di modelli (Claude, GPT, DeepSeek…) con una sola chiave, a consumo. Il modello si sceglie sopra, per la chat e per le analisi.">
      <div className="space-y-4">
        {configured && !editing ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Check size={16} className="text-emerald-500" />
              <span>Configurata · ••••{configured.lastFour}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(true)}>Sostituisci</Button>
              <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={remove} title="Rimuovi chiave"><Trash2 size={15} /></Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="openrouter-key">Chiave OpenRouter</Label>
              <Input id="openrouter-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder="sk-or-…" />
            </div>
            <div className="flex gap-2">
              <Button type="button" className="flex-1" disabled={pending || key.trim().length < 16} onClick={saveKey}>
                {pending ? "Verifico…" : "Verifica e salva"}
              </Button>
              {configured && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setKey(""); }}>Annulla</Button>}
            </div>
          </div>
        )}

        {justSaved && <p className="text-sm text-emerald-600">Chiave salvata. Ora scegli OpenRouter e un modello per la chat o per le analisi, qui sopra.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <IntegrationHelp title="Come ottenere la chiave">
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Crea un account su OpenRouter e aggiungi un po&apos; di credito (i modelli “free” non lo consumano).</li>
            <li>Da “Keys” crea una chiave e incollala qui. Trattala come una password.</li>
            <li>Sopra, in “Modelli”, scegli OpenRouter e tocca il modello per vedere l&apos;elenco con i prezzi.</li>
          </ol>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-medium text-primary">
            Apri OpenRouter <ExternalLink size={12} />
          </a>
        </IntegrationHelp>
      </div>
    </IntegrationCard>
  );
}
