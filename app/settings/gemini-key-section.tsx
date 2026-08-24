"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteGeminiApiKey, saveGeminiApiKey } from "./actions";
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
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setKey("");
      setEditing(false);
    }
    setPending(false);
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
      title="Coach AI con Gemini"
      description="Abilita chat, adattamento del piano e feedback automatici sulle attività. Usa la tua chiave Google personale."
      defaultOpen={focusRequested}
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
          <p className="mt-1 pl-6 text-[10px] text-muted-foreground">Verificata il {new Date(configured.verified_at).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}. Il valore completo non viene più mostrato.</p>
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
