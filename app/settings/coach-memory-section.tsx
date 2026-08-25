"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
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
    <section className="py-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-2 text-primary">
          <Brain size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Memoria del coach</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {memories.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Preferenze e vincoli che il coach terrà presenti nelle prossime conversazioni.
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-border/60">
        {memories.length ? (
          <div className="divide-y divide-border/60">
            {memories.map((memory) => (
              <div key={memory.id} className="py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  {memory.category}
                </p>
                <p className="mt-1 text-sm leading-relaxed">{memory.content}</p>
                {memory.valid_until && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
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

      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
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
    </section>
  );
}
