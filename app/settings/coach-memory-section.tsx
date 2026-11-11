"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-sheet";
import { clearCoachHistory } from "@/app/coach/actions";
import { deleteCoachMemory, saveCoachMemory } from "./memory-actions";
import type { CoachMemory, CoachMemoryCategory } from "@/lib/types";

const CATEGORY_LABELS: Record<CoachMemoryCategory, string> = {
  guideline: "Linea guida",
  preference: "Preferenza",
  availability: "Disponibilità",
  vacation: "Vacanza",
  weather: "Meteo",
  fatigue: "Fatica",
  limitation: "Limite",
  pace_hr: "Passo e cuore",
  long_term: "Percorso",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as CoachMemoryCategory[];

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

interface Draft {
  category: CoachMemoryCategory;
  content: string;
  valid_until: string;
}

/** Modifica di un ricordo esistente (memory) o nuovo (memory = null). */
function MemoryEditor({
  memory,
  onClose,
  onDelete,
}: {
  memory: CoachMemory | null;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({
    category: memory?.category ?? "preference",
    content: memory?.content ?? "",
    valid_until: memory?.valid_until ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = memory?.id ?? "new";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await saveCoachMemory(memory?.id ?? null, {
      category: draft.category,
      content: draft.content,
      valid_until: draft.valid_until || null,
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-2xl bg-muted/45 p-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`memory-category-${fieldId}`}>Tipo</Label>
        <Select value={draft.category} onValueChange={(value) => setDraft({ ...draft, category: value as CoachMemoryCategory })}>
          <SelectTrigger id={`memory-category-${fieldId}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>{CATEGORY_LABELS[category]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`memory-content-${fieldId}`}>Cosa deve ricordare</Label>
        <Textarea
          id={`memory-content-${fieldId}`}
          value={draft.content}
          onChange={(event) => setDraft({ ...draft, content: event.target.value })}
          rows={3}
          maxLength={600}
          autoCapitalize="sentences"
          placeholder="Es. Riscaldamento e defaticamento al passo easy, oppure camminando…"
          className="min-h-24"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`memory-until-${fieldId}`}>Vale fino al</Label>
        <Input
          id={`memory-until-${fieldId}`}
          type="date"
          value={draft.valid_until}
          min={todayIso()}
          onChange={(event) => setDraft({ ...draft, valid_until: event.target.value })}
        />
        <p className="text-micro text-muted-foreground">Lascia vuoto se vale sempre.</p>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || draft.content.trim().length < 3}>
          {pending ? "Salvo…" : "Salva"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
          Annulla
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            className="ml-auto text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            Elimina
          </Button>
        )}
      </div>
    </form>
  );
}

export function CoachMemorySection({ memories }: { memories: CoachMemory[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // Id del ricordo aperto in modifica, "new" per uno nuovo.
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, element: confirmSheet } = useConfirm();
  const today = todayIso();
  // Le linee guida dicono come ci si allena adesso: in cima. Gli scaduti in fondo.
  const expired = (memory: CoachMemory) => memory.valid_until != null && memory.valid_until < today;
  const sorted = [...memories].sort(
    (a, b) => Number(expired(a)) - Number(expired(b))
      || Number(b.category === "guideline") - Number(a.category === "guideline"),
  );

  async function remove(memory: CoachMemory) {
    const confirmed = await confirm({
      title: "Eliminare questo ricordo?",
      description: "Il coach non ne terrà più conto. Non si può annullare.",
      action: "Elimina",
    });
    if (!confirmed) return;
    const result = await deleteCoachMemory(memory.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setEditing(null);
    router.refresh();
  }

  async function clear(includeMemories: boolean) {
    const confirmed = await confirm(
      includeMemories
        ? {
            title: "Cancellare chat e ricordi?",
            description: "Il coach dimentica anche quello che ha imparato su di te. Non si può annullare.",
            action: "Cancella tutto",
          }
        : {
            title: "Cancellare la cronologia della chat?",
            description: "I ricordi del coach restano.",
            action: "Cancella chat",
          },
    );
    if (!confirmed) return;
    setPending(true);
    await clearCoachHistory(includeMemories);
    router.refresh();
    setPending(false);
  }

  return (
    <div className="py-4">
      {memories.length ? (
        <ul className="space-y-3">
          {sorted.map((memory) => (
            <li key={memory.id}>
              {editing === memory.id ? (
                <MemoryEditor memory={memory} onClose={() => setEditing(null)} onDelete={() => remove(memory)} />
              ) : (
                <div className={`flex items-start gap-2 ${expired(memory) ? "opacity-55" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-micro font-medium uppercase tracking-wide text-muted-foreground">
                      {CATEGORY_LABELS[memory.category] ?? memory.category}
                      {memory.valid_until && (expired(memory)
                        ? ` · scaduto il ${shortDate(memory.valid_until)}`
                        : ` · fino al ${shortDate(memory.valid_until)}`)}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed">{memory.content}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="-mr-2 -mt-1 shrink-0 text-muted-foreground"
                    aria-label="Modifica ricordo"
                    onClick={() => setEditing(memory.id)}
                  >
                    <Pencil />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Ancora niente: impara dalle tue conversazioni, oppure aggiungi tu un ricordo.</p>
      )}
      {editing === "new" && (
        <div className="mt-3">
          <MemoryEditor memory={null} onClose={() => setEditing(null)} />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {editing !== "new" && (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing("new")}>
            <Plus /> Aggiungi ricordo
          </Button>
        )}
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
      {confirmSheet}
    </div>
  );
}
