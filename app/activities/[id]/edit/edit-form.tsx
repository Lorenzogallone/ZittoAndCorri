"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { updateActivity, deleteActivity, type EditActivityFormState } from "../../actions";
import { WORKOUT_TYPES } from "@/lib/types";
import type { Activity } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_LABELS: Record<string, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross",
};

function formatDateTimeLocal(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  activity: Activity;
}

export function EditActivityForm({ activity }: Props) {
  const initialState: EditActivityFormState = {};
  const [state, formAction, pending] = useActionState(updateActivity, initialState);
  const isImported = activity.source !== "manual";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const deleteFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-5">
        {/* Hidden input to pass activity ID to Server Action */}
        <input type="hidden" name="id" value={activity.id} />

        <div className="grid gap-2.5">
          <Label htmlFor="started_at">
            Data e ora {isImported && <span className="text-xs text-muted-foreground">(da GPX)</span>}
          </Label>
          <Input
            id="started_at"
            name="started_at"
            type="datetime-local"
            defaultValue={formatDateTimeLocal(activity.started_at)}
            readOnly={isImported}
            className={isImported ? "bg-muted/40 cursor-not-allowed opacity-80" : ""}
            required
          />
        </div>

        <div className="grid gap-2.5">
          <Label htmlFor="type">Tipo (Tag)</Label>
          <Select name="type" defaultValue={activity.type}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKOUT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2.5">
            <Label htmlFor="distance_km">
              Distanza (km) {isImported && <span className="text-xs text-muted-foreground">(da GPX)</span>}
            </Label>
            <Input
              id="distance_km"
              name="distance_km"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={(activity.distance_m / 1000).toFixed(2)}
              readOnly={isImported}
              className={isImported ? "bg-muted/40 cursor-not-allowed opacity-80" : ""}
              required
            />
          </div>
          <div className="grid gap-2.5">
            <Label htmlFor="duration">
              Durata {isImported && <span className="text-xs text-muted-foreground">(da GPX)</span>}
            </Label>
            <Input
              id="duration"
              name="duration"
              type="text"
              inputMode="text"
              defaultValue={formatDuration(activity.duration_s)}
              readOnly={isImported}
              className={isImported ? "bg-muted/40 cursor-not-allowed opacity-80" : ""}
              required
            />
          </div>
        </div>

        <div className="separator my-1" />
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          Metodi & Cardio {isImported && <span className="text-[10px] lowercase text-muted-foreground">(non modificabili per GPX)</span>}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2.5">
            <Label htmlFor="avg_hr">HR media</Label>
            <Input
              id="avg_hr"
              name="avg_hr"
              type="number"
              min="0"
              defaultValue={activity.avg_hr ?? ""}
              placeholder={isImported ? "—" : "150"}
              readOnly={isImported}
              className={isImported ? "bg-muted/40 cursor-not-allowed opacity-80" : ""}
            />
          </div>
          <div className="grid gap-2.5">
            <Label htmlFor="max_hr">HR max</Label>
            <Input
              id="max_hr"
              name="max_hr"
              type="number"
              min="0"
              defaultValue={activity.max_hr ?? ""}
              placeholder={isImported ? "—" : "175"}
              readOnly={isImported}
              className={isImported ? "bg-muted/40 cursor-not-allowed opacity-80" : ""}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2.5">
            <Label htmlFor="elevation_gain_m">Dislivello + (m)</Label>
            <Input
              id="elevation_gain_m"
              name="elevation_gain_m"
              type="number"
              min="0"
              defaultValue={activity.elevation_gain_m ?? ""}
              placeholder={isImported ? "—" : "120"}
              readOnly={isImported}
              className={isImported ? "bg-muted/40 cursor-not-allowed opacity-80" : ""}
            />
          </div>
          <div className="grid gap-2.5">
            <Label htmlFor="rpe">RPE 1–10 (Fatica)</Label>
            <Input
              id="rpe"
              name="rpe"
              type="number"
              min="1"
              max="10"
              defaultValue={activity.rpe ?? ""}
              placeholder="4"
            />
          </div>
        </div>

        <div className="grid gap-2.5">
          <Label htmlFor="notes">Note / Nome corsa</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={activity.notes ?? ""}
            placeholder="Come è andata?"
          />
        </div>

        {state.error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
            <p className="text-destructive text-sm" role="alert">{state.error}</p>
          </div>
        )}

        <Button type="submit" disabled={pending} size="lg" className="w-full mt-2">
          {pending ? "Salvataggio in corso..." : "Salva modifiche"}
        </Button>
      </form>

      <div className="border-b border-white/[0.06] my-1" />

      {!confirmDelete ? (
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => setConfirmDelete(true)}
        >
          Elimina corsa
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-center text-muted-foreground">
            Sei sicuro di voler eliminare questa corsa? L&apos;operazione non è reversibile.
          </p>
          {deleteError && (
            <p className="text-destructive text-sm text-center">{deleteError}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={isDeleting}
              onClick={() => setConfirmDelete(false)}
            >
              Annulla
            </Button>
            <form
              ref={deleteFormRef}
              action={async (fd) => {
                startDeleteTransition(async () => {
                  try {
                    await deleteActivity(fd);
                  } catch {
                    setDeleteError("Errore durante l'eliminazione. Riprova.");
                    setConfirmDelete(false);
                  }
                });
              }}
              className="flex-1"
            >
              <input type="hidden" name="id" value={activity.id} />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={isDeleting}
              >
                {isDeleting ? "Eliminazione..." : "Sì, elimina"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
