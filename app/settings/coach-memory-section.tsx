"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextField } from "@/components/ui/text-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-sheet";
import { clearCoachHistory } from "@/app/coach/actions";
import { deleteCoachMemory, saveCoachMemory } from "./memory-actions";
import type { CoachMemory, CoachMemoryCategory } from "@/lib/types";

// Il valore salvato sul database è la chiave; l'etichetta viene da messages/.
const CATEGORIES: CoachMemoryCategory[] = [
  "guideline", "preference", "availability", "vacation", "weather",
  "fatigue", "limitation", "pace_hr", "long_term",
];

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
  const t = useTranslations("settingsLinks.memory");
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
        <Label htmlFor={`memory-category-${fieldId}`}>{t("editor.typeLabel")}</Label>
        <Select value={draft.category} onValueChange={(value) => setDraft({ ...draft, category: value as CoachMemoryCategory })}>
          <SelectTrigger id={`memory-category-${fieldId}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>{t(`categories.${category}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label id={`memory-content-${fieldId}-label`} htmlFor={`memory-content-${fieldId}`}>{t("editor.contentLabel")}</Label>
        <TextField
          id={`memory-content-${fieldId}`}
          aria-labelledby={`memory-content-${fieldId}-label`}
          value={draft.content}
          onValueChange={(content) => setDraft({ ...draft, content })}
          rows={3}
          maxLength={600}
          placeholder={t("editor.contentPlaceholder")}
          className="min-h-24"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`memory-until-${fieldId}`}>{t("editor.validUntilLabel")}</Label>
        <Input
          id={`memory-until-${fieldId}`}
          type="date"
          value={draft.valid_until}
          min={todayIso()}
          onChange={(event) => setDraft({ ...draft, valid_until: event.target.value })}
        />
        <p className="text-micro text-muted-foreground">{t("editor.validUntilHint")}</p>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || draft.content.trim().length < 3}>
          {pending ? t("editor.saving") : t("editor.save")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
          {t("editor.cancel")}
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
            {t("editor.delete")}
          </Button>
        )}
      </div>
    </form>
  );
}

export function CoachMemorySection({ memories }: { memories: CoachMemory[] }) {
  const router = useRouter();
  const t = useTranslations("settingsLinks.memory");
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
      title: t("confirm.delete.title"),
      description: t("confirm.delete.description"),
      action: t("confirm.delete.action"),
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
            title: t("confirm.clearAll.title"),
            description: t("confirm.clearAll.description"),
            action: t("confirm.clearAll.action"),
          }
        : {
            title: t("confirm.clearChat.title"),
            description: t("confirm.clearChat.description"),
            action: t("confirm.clearChat.action"),
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
                      {t.has(`categories.${memory.category}`) ? t(`categories.${memory.category}`) : memory.category}
                      {memory.valid_until && (expired(memory)
                        ? ` · ${t("expiredOn", { date: shortDate(memory.valid_until) })}`
                        : ` · ${t("validUntil", { date: shortDate(memory.valid_until) })}`)}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed">{memory.content}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="-mr-2 -mt-1 shrink-0 text-muted-foreground"
                    aria-label={t("list.editAria")}
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
        <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
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
            <Plus /> {t("list.add")}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => clear(false)}>
          {t("list.clearChat")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          className="text-destructive hover:text-destructive"
          onClick={() => clear(true)}
        >
          {t("list.clearAll")}
        </Button>
      </div>
      {confirmSheet}
    </div>
  );
}
