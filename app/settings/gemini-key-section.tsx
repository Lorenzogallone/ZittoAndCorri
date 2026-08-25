"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteGeminiApiKey, saveGeminiApiKey, saveGeminiModel } from "./actions";
import {
  GEMINI_MODELS,
  isGeminiModelId,
  normalizeGeminiModel,
} from "@/lib/ai/models";
import type { AiCredentialMetadata } from "@/lib/types";
import { IntegrationCard, IntegrationHelp } from "./integration-card";

export function GeminiKeySection({
  credential,
  focusRequested = false,
}: {
  credential: AiCredentialMetadata | null;
  focusRequested?: boolean;
}) {
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [configured, setConfigured] = useState(credential);
  const [selectedModel, setSelectedModel] = useState(normalizeGeminiModel(credential?.model));
  const [modelPending, setModelPending] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!focusRequested) return;
    const target = configured && !editing ? replaceRef.current : inputRef.current;
    target?.focus({ preventScroll: true });
  }, [configured, editing, focusRequested]);

  async function save() {
    setPending(true);
    setError(null);
    const result = await saveGeminiApiKey(key);
    if (result.error) setError(result.error);
    else {
      setConfigured({
        provider: "gemini",
        last_four: key.slice(-4),
        model: selectedModel,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setKey("");
      setEditing(false);
    }
    setPending(false);
  }

  async function selectModel(value: string) {
    if (!isGeminiModelId(value) || value === selectedModel) return;
    const previous = selectedModel;
    setSelectedModel(value);
    setModelPending(true);
    setModelSaved(false);
    setError(null);
    const result = await saveGeminiModel(value);
    if (result.error) {
      setSelectedModel(previous);
      setError(result.error);
    } else {
      setConfigured((current) => current ? {
        ...current,
        model: value,
        updated_at: new Date().toISOString(),
      } : current);
      setModelSaved(true);
    }
    setModelPending(false);
  }

  async function remove() {
    if (!window.confirm("Rimuovere la chiave Gemini? Chat e feedback AI verranno disattivati.")) return;
    setPending(true);
    const result = await deleteGeminiApiKey();
    if (result.error) setError(result.error);
    else setConfigured(null);
    setPending(false);
  }

  return (
    <IntegrationCard
      id="gemini-integration"
      icon={<Sparkles size={18} />}
      title="Coach AI"
      description="Collega Gemini per usare chat, adattamento del piano e feedback sulle attività."
    >
      <div className="space-y-4">
      {configured && !editing ? (
        <div className="rounded-xl bg-muted/30 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Check size={16} className="text-emerald-500" />
              <span>Configurata · ••••{configured.last_four}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button ref={replaceRef} type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(true)}>Sostituisci</Button>
              <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={remove} title="Rimuovi chiave">
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <Label htmlFor="gemini-key">Chiave personale Gemini</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              id="gemini-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="AIza…"
            />
            <Button type="button" disabled={pending || key.trim().length < 16} onClick={save}>
              {pending ? "Verifico…" : "Verifica"}
            </Button>
          </div>
          {configured && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { setEditing(false); setKey(""); }}>Annulla sostituzione</Button>}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {configured && !editing && (
        <div className="space-y-2 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="gemini-model">Modello per coach e analisi</Label>
            {modelSaved && !modelPending && (
              <span className="text-xs text-emerald-600">Salvato</span>
            )}
          </div>
          <Select value={selectedModel} onValueChange={selectModel} disabled={modelPending}>
            <SelectTrigger id="gemini-model" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {GEMINI_MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {modelPending ? "Salvataggio…" : "Il modello selezionato verrà usato per coach e analisi automatiche."}
          </p>
        </div>
      )}

      <IntegrationHelp title="Come creare la chiave Gemini">
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Apri Google AI Studio ed entra con il tuo account Google.</li>
          <li>Seleziona “Create API key” e scegli o crea un progetto.</li>
          <li>Copia la chiave e incollala qui. Trattala come una password.</li>
        </ol>
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 font-medium text-primary"
        >
          Apri Google AI Studio <ExternalLink size={12} />
        </a>
      </IntegrationHelp>
      </div>
    </IntegrationCard>
  );
}
