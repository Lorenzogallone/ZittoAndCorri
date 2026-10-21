"use client";

import { useState } from "react";
import { Check, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OpenRouterModel } from "@/lib/ai/openrouter";
import { deleteOpenRouterKey, saveOpenRouterKey, saveOpenRouterModel } from "./actions";
import { IntegrationCard, IntegrationHelp } from "./integration-card";

const price = (m: OpenRouterModel) =>
  m.prompt_per_m === 0 && m.completion_per_m === 0
    ? "gratis"
    : m.prompt_per_m != null && m.completion_per_m != null
      ? `$${m.prompt_per_m} / $${m.completion_per_m} per M token`
      : null;

function ModelField({ value, onChange, models, suggested }: { value: string; onChange: (v: string) => void; models: OpenRouterModel[]; suggested: OpenRouterModel[] }) {
  const selected = models.find((m) => m.id === value);
  return (
    <div className="space-y-2">
      <Label htmlFor="openrouter-model">Modello</Label>
      <Input
        id="openrouter-model"
        list="openrouter-models"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
        placeholder="es. openai/gpt-5-mini"
      />
      <datalist id="openrouter-models">
        {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </datalist>
      {selected && <p className="text-xs text-muted-foreground">{[selected.name, price(selected)].filter(Boolean).join(" · ")}</p>}
      {suggested.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggested.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={`rounded-full border px-2.5 py-1 text-xs ${m.id === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {m.id.split("/").pop()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OpenRouterSection({
  initial,
  models,
  suggested,
}: {
  /** null = configurazione assente; undefined = database da aggiornare. */
  initial: { lastFour: string | null; model: string | null } | null | undefined;
  models: OpenRouterModel[];
  suggested: OpenRouterModel[];
}) {
  const [configured, setConfigured] = useState(initial?.lastFour ? initial : null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(initial?.model ?? suggested[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
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
    const result = await saveOpenRouterKey(key, model);
    if (result.error) setError(result.error);
    else {
      setConfigured({ lastFour: key.trim().slice(-4), model });
      setKey("");
      setEditing(false);
    }
    setPending(false);
  }

  async function saveModel() {
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await saveOpenRouterModel(model);
    if (result.error) setError(result.error);
    else {
      setConfigured((current) => (current ? { ...current, model } : current));
      setSaved(true);
    }
    setPending(false);
  }

  async function remove() {
    if (!window.confirm("Rimuovere la chiave OpenRouter? Il coach tornerà a usare Gemini.")) return;
    setPending(true);
    const result = await deleteOpenRouterKey();
    if (result.error) setError(result.error);
    else setConfigured(null);
    setPending(false);
  }

  return (
    <IntegrationCard id="openrouter-integration" description="Alternativa a Gemini: centinaia di modelli (Claude, GPT, DeepSeek…) con una sola chiave, a consumo.">
      <div className="space-y-4">
        {configured && !editing ? (
          <>
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
            <ModelField value={model} onChange={(v) => { setModel(v); setSaved(false); }} models={models} suggested={suggested} />
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-xs text-emerald-600">Salvato</span>}
              <Button type="button" size="sm" disabled={pending || !model || model === configured.model} onClick={saveModel}>Usa questo modello</Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="openrouter-key">Chiave OpenRouter</Label>
              <Input id="openrouter-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder="sk-or-…" />
            </div>
            <ModelField value={model} onChange={setModel} models={models} suggested={suggested} />
            <div className="flex gap-2">
              <Button type="button" className="flex-1" disabled={pending || key.trim().length < 16 || !model} onClick={saveKey}>
                {pending ? "Verifico…" : "Verifica e salva"}
              </Button>
              {configured && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setKey(""); }}>Annulla</Button>}
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <IntegrationHelp title="Come ottenere la chiave">
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Crea un account su OpenRouter e aggiungi un po&apos; di credito (i modelli “free” non lo consumano).</li>
            <li>Da “Keys” crea una chiave e incollala qui. Trattala come una password.</li>
            <li>Scegli un modello: scrivine il nome per cercarlo nel catalogo.</li>
          </ol>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-medium text-primary">
            Apri OpenRouter <ExternalLink size={12} />
          </a>
        </IntegrationHelp>
      </div>
    </IntegrationCard>
  );
}
