"use client";

import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clearCoachHistory } from "@/app/coach/actions";
import type { CoachMemory } from "@/lib/types";

export function CoachMemorySection({ memories }: { memories: CoachMemory[] }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
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
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="coach-memory-content"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/20"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <Brain size={18} />
          </span>
          <span className="text-sm font-semibold text-foreground">Memoria del coach</span>
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div id="coach-memory-content" className="border-t border-border/60 p-4">
          {memories.length ? (
            <div className="space-y-2">
              {memories.map((memory) => (
                <div key={memory.id} className="rounded-xl bg-muted/30 px-3 py-2.5">
                  <p className="text-xs font-medium capitalize text-primary">{memory.category}</p>
                  <p className="mt-0.5 text-sm">{memory.content}</p>
                  {memory.valid_until && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Valido fino al {new Date(`${memory.valid_until}T12:00:00`).toLocaleDateString("it-IT")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Il coach non ha ancora salvato preferenze o vincoli.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
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
              className="text-destructive"
              onClick={() => clear(true)}
            >
              Cancella chat e memoria
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
