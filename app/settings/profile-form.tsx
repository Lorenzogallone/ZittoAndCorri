"use client";

import { useState, useTransition } from "react";
import { Check, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { updateProfile, type ProfileFormState } from "./actions";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ProfileFormState = {};

interface EffectiveHrView {
  max_hr: number | null;
  resting_hr: number | null;
  hr_zone_ranges: number[] | null;
  max_hr_source: "zepp" | "user" | null;
  resting_hr_source: "zepp" | "user" | null;
  zones_source: "zepp" | "derived" | null;
}

export function ProfileForm({
  profile,
  effectiveHr,
}: {
  profile: Partial<Profile> | null;
  effectiveHr: EffectiveHrView;
}) {
  const [state, setState] = useState<ProfileFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const zeppActive = effectiveHr.max_hr_source === "zepp" || effectiveHr.resting_hr_source === "zepp";

  const save = (formData: FormData) => startTransition(async () => {
    const result = await updateProfile(initialState, formData);
    setState(result);
    if (result.ok) {
      setEditing(false);
      router.refresh();
    }
  });

  const birthdate = profile?.birthdate
    ? new Date(`${profile.birthdate}T12:00:00`).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Non impostata";

  const sourceLabel = (source: EffectiveHrView["max_hr_source"]) =>
    source === "zepp" ? "Zepp" : source === "user" ? "Manuale" : "Non impostata";

  return (
    <section className="py-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-normal text-foreground">Dati atleta</h2>
        {!editing && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setState(initialState); setEditing(true); }}>
            <Pencil size={14} /> Modifica
          </Button>
        )}
      </div>

      {!editing ? (
        <div className="mt-4 border-t border-border/60 pt-4">
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">FC massima</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                {effectiveHr.max_hr == null ? "—" : `${effectiveHr.max_hr} bpm`}
              </dd>
              <p className={`mt-0.5 text-xs ${effectiveHr.max_hr_source === "zepp" ? "text-primary" : "text-muted-foreground"}`}>
                {sourceLabel(effectiveHr.max_hr_source)}
              </p>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">FC a riposo</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                {effectiveHr.resting_hr == null ? "—" : `${effectiveHr.resting_hr} bpm`}
              </dd>
              <p className={`mt-0.5 text-xs ${effectiveHr.resting_hr_source === "zepp" ? "text-primary" : "text-muted-foreground"}`}>
                {sourceLabel(effectiveHr.resting_hr_source)}
              </p>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Data di nascita</dt>
              <dd className="mt-1 text-sm font-medium">{birthdate}</dd>
            </div>
          </dl>
          {effectiveHr.hr_zone_ranges && (
            <details className="mt-4 border-t border-border/60 pt-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Zone cardiache Zepp</summary>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {effectiveHr.hr_zone_ranges.slice(0, 5).map((value, index) => `Z${index + 1} ${value}`).join(" · ")} bpm
              </p>
            </details>
          )}
          {state.ok && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400" aria-live="polite">
              <Check size={14} /> Dati salvati
            </p>
          )}
        </div>
      ) : (
        <form action={save} className="mt-4 space-y-4 border-t border-border/60 pt-4">
          {zeppActive && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Stai modificando i valori manuali di fallback. Finché Zepp resta collegato, l&apos;app continuerà a usare i valori provenienti dall&apos;orologio.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="max_hr">FC massima manuale</Label>
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
              <Label htmlFor="resting_hr">FC a riposo manuale</Label>
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
            <span />
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { setState(initialState); setEditing(false); }}>
                Annulla
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Salvataggio…" : "Salva"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
