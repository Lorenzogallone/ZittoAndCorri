"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Copy, Check, RefreshCw } from "lucide-react";
import { regenerateApiKey } from "./actions";

interface ApiKeySectionProps {
  initialApiKey: string | null;
}

export function ApiKeySection({ initialApiKey }: ApiKeySectionProps) {
  const [apiKey, setApiKey] = useState<string | null>(initialApiKey);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy API key:", err);
    }
  };

  const handleRegenerate = async () => {
    const confirmRegen = window.confirm(
      "Sei sicuro di voler rigenerare la tua chiave API? I Comandi Rapidi configurati con la vecchia chiave smetteranno di funzionare."
    );
    if (!confirmRegen) return;

    setLoading(true);
    setError(null);
    try {
      const res = await regenerateApiKey();
      if (res.error) {
        setError("Errore durante la rigenerazione: " + res.error);
      } else if (res.key) {
        setApiKey(res.key);
      }
    } catch {
      setError("Errore imprevisto. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2.5">
        <Label htmlFor="api_key">La tua chiave API personale</Label>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Input
              id="api_key"
              type={showKey ? "text" : "password"}
              readOnly
              value={apiKey ?? "Nessuna chiave configurata. Generala per iniziare."}
              className="pr-10 font-mono text-xs text-muted-foreground bg-muted/20"
            />
            {apiKey && (
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                title={showKey ? "Nascondi chiave" : "Mostra chiave"}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </div>
          {apiKey && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopy}
              title="Copia negli appunti"
            >
              {copied ? (
                <Check size={16} className="text-emerald-400" />
              ) : (
                <Copy size={16} />
              )}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">{error}</p>
        </div>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={handleRegenerate}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {apiKey ? "Rigenera chiave" : "Genera nuova chiave"}
        </Button>
      </div>
    </div>
  );
}
