"use client";

import { useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  groupByProvider,
  modelTitle,
  priceLabel,
  providerOf,
  suggestedOpenRouterModels,
  topProviders,
  type OpenRouterModel,
} from "@/lib/ai/openrouter-models";

const FREE = "__free__";

const contextLabel = (tokens: number | null) =>
  tokens ? (tokens >= 1_000_000 ? `${+(tokens / 1_000_000).toFixed(1)}M contesto` : `${Math.round(tokens / 1000)}k contesto`).replace(".", ",") : null;

function ModelRow({ model, selected, onPick, withProvider = false }: { model: OpenRouterModel; selected: boolean; onPick: () => void; withProvider?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-muted", selected && "bg-primary/8")}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {withProvider && <span className="text-muted-foreground">{providerOf(model)} · </span>}
          {modelTitle(model)}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[priceLabel(model), contextLabel(model.context)].filter(Boolean).join(" · ")}
        </span>
      </span>
      {selected && <Check size={16} className="shrink-0 text-primary" />}
    </button>
  );
}

/**
 * Elenco dei modelli OpenRouter da scegliere toccando, senza scrivere:
 * filtri per azienda e per i gratuiti, ricerca facoltativa. Se il catalogo non
 * risponde resta il campo per scrivere l'id a mano.
 */
export function OpenRouterModelPicker({
  open,
  onOpenChange,
  models,
  value,
  onSelect,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: OpenRouterModel[];
  value: string | null;
  onSelect: (modelId: string) => void;
  title: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const providers = useMemo(() => topProviders(models, 10), [models]);
  const suggested = useMemo(() => suggestedOpenRouterModels(models), [models]);
  const groups = useMemo(
    () => groupByProvider(models, { query, provider: filter === FREE ? null : filter, freeOnly: filter === FREE }),
    [models, query, filter],
  );
  const pick = (id: string) => {
    onSelect(id);
    onOpenChange(false);
  };
  const browsing = !query && !filter;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/40" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[80] flex flex-col bg-background sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[80vh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-2xl sm:ring-1 sm:ring-border"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-body font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Chiudi"><X /></Button>
            </DialogPrimitive.Close>
          </div>

          {models.length === 0 ? (
            <div className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">Il catalogo di OpenRouter non risponde in questo momento. Scrivi l&apos;id del modello come appare su openrouter.ai.</p>
              <Input value={manual} onChange={(event) => setManual(event.target.value.trim())} placeholder="es. anthropic/claude-sonnet-5-5" autoComplete="off" spellCheck={false} />
              <Button type="button" className="w-full" disabled={!/^[\w.-]+\/[\w.:-]+$/.test(manual)} onClick={() => pick(manual)}>Usa questo modello</Button>
            </div>
          ) : (
            <>
              <div className="space-y-2.5 border-b border-border/60 px-4 py-3">
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca (facoltativo)" className="pl-9" autoComplete="off" spellCheck={false} />
                </div>
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
                  {[null, FREE, ...providers].map((item) => (
                    <button
                      key={item ?? "all"}
                      type="button"
                      onClick={() => setFilter(item)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                        filter === item ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                      )}
                    >
                      {item === null ? "Tutti" : item === FREE ? "Gratis" : item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]">
                {browsing && suggested.length > 0 && (
                  <section>
                    <h3 className="sticky top-0 z-10 bg-background/95 px-4 py-1.5 text-micro font-semibold uppercase tracking-wide text-primary backdrop-blur">Consigliati</h3>
                    {suggested.map((model) => (
                      <ModelRow key={`s-${model.id}`} model={model} withProvider selected={model.id === value} onPick={() => pick(model.id)} />
                    ))}
                  </section>
                )}
                {groups.map((group) => (
                  <section key={group.provider}>
                    <h3 className="sticky top-0 z-10 bg-background/95 px-4 py-1.5 text-micro font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                      {group.provider} <span className="font-normal">· {group.models.length}</span>
                    </h3>
                    {group.models.map((model) => (
                      <ModelRow key={model.id} model={model} selected={model.id === value} onPick={() => pick(model.id)} />
                    ))}
                  </section>
                ))}
                {groups.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nessun modello trovato.</p>}
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
