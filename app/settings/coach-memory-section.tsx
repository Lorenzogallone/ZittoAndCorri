"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clearCoachHistory } from "@/app/coach/actions";
import type { CoachMemory, CoachMemoryCategory } from "@/lib/types";

const CATEGORY_LABELS: Record<CoachMemoryCategory, string> = {
  availability: "Disponibilità",
  vacation: "Vacanza",
  weather: "Meteo",
  preference: "Preferenza",
  fatigue: "Fatica",
  limitation: "Limite",
  pace_hr: "Passo e cuore",
  long_term: "Percorso",
};

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
    <div className="py-4">
      {memories.length ? (
        <ul className="space-y-3">
          {memories.map((memory) => (
            <li key={memory.id}>
              <p className="text-micro font-medium uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABELS[memory.category] ?? memory.category}
                {memory.valid_until && ` · fino al ${new Date(`${memory.valid_until}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed">{memory.content}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Ancora niente: impara dalle tue conversazioni.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => clear(false)}>
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
          Cancella tutto
        </Button>
      </div>
    </div>
  );
}
