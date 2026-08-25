"use client";

import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clearCoachHistory } from "@/app/coach/actions";
import type { CoachMemory } from "@/lib/types";

export function CoachMemorySection({ memories }: { memories: CoachMemory[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function clear(includeMemories: boolean) {
    const label = includeMemories ? "chat e tutti i ricordi" : "la cronologia della chat";
    if (!window.confirm(`Cancellare ${label}?`)) return;
    setPending(true);
    await clearCoachHistory(includeMemories);
    router.refresh();
    setPending(false);
  }

  return (
    <details className="group/item">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-4">
        <span className="shrink-0 text-muted-foreground">
          <Brain size={18} />
        </span>
        <h2 className="min-w-0 flex-1 text-sm font-normal text-foreground">Memoria del coach</h2>
        <span className="text-xs text-muted-foreground">{memories.length}</span>
        <ChevronDown size={15} className="shrink-0 text-muted-foreground transition-transform group-open/item:rotate-180" />
      </summary>

      <div className="border-t border-border/60">
        <p className="py-4 text-xs leading-relaxed text-muted-foreground">
          Preferenze e vincoli usati nelle prossime conversazioni.
        </p>
        {memories.length ? (
          <div className="divide-y divide-border/60">
            {memories.map((memory) => (
              <div key={memory.id} className="py-3">
                <p className="text-xs font-medium text-primary">
                  {memory.category}
                </p>
                <p className="mt-1 text-sm leading-relaxed">{memory.content}</p>
                {memory.valid_until && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Valido fino al {new Date(`${memory.valid_until}T12:00:00`).toLocaleDateString("it-IT")}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            Nessuna preferenza o vincolo memorizzato.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border/60 py-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => clear(false)}
        >
          Cancella chat
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          className="text-destructive hover:text-destructive"
          onClick={() => clear(true)}
        >
          Cancella chat e memoria
        </Button>
      </div>
    </details>
  );
}
