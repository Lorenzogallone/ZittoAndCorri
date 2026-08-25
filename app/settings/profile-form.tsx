"use client";

import { useActionState } from "react";
import { Check, HeartPulse } from "lucide-react";
import { updateProfile, type ProfileFormState } from "./actions";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ProfileFormState = {};

export function ProfileForm({ profile }: { profile: Partial<Profile> | null }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-2 text-primary">
          <HeartPulse size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Dati atleta</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Mantieni aggiornati i dati che aiutano il coach a personalizzare le indicazioni.
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-4 border-t border-border/60 pt-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="max_hr">Frequenza massima</Label>
            <Input
              id="max_hr"
              name="max_hr"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="190 bpm"
              defaultValue={profile?.max_hr ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="resting_hr">A riposo</Label>
            <Input
              id="resting_hr"
              name="resting_hr"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="50 bpm"
              defaultValue={profile?.resting_hr ?? ""}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="birthdate">Data di nascita</Label>
          <Input
            id="birthdate"
            name="birthdate"
            type="date"
            defaultValue={profile?.birthdate ?? ""}
          />
        </div>

        {state.error && (
          <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <span aria-live="polite" className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            {state.ok && <><Check size={14} /> Dati salvati</>}
          </span>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Salvataggio…" : "Salva dati"}
          </Button>
        </div>
      </form>
    </section>
  );
}
