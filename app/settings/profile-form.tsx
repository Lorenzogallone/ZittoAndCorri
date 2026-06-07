"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileFormState } from "./actions";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

const initialState: ProfileFormState = {};

export function ProfileForm({ profile }: { profile: Partial<Profile> | null }) {
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-2.5">
        <Label htmlFor="display_name">Nome</Label>
        <Input
          id="display_name"
          name="display_name"
          type="text"
          defaultValue={profile?.display_name ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="max_hr">HR max</Label>
          <Input
            id="max_hr"
            name="max_hr"
            type="number"
            min="0"
            placeholder="190"
            defaultValue={profile?.max_hr ?? ""}
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="resting_hr">HR a riposo</Label>
          <Input
            id="resting_hr"
            name="resting_hr"
            type="number"
            min="0"
            placeholder="50"
            defaultValue={profile?.resting_hr ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="birthdate">Data di nascita</Label>
        <Input
          id="birthdate"
          name="birthdate"
          type="date"
          defaultValue={profile?.birthdate ?? ""}
        />
      </div>

      {state.error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">
            {state.error}
          </p>
        </div>
      )}
      {state.ok && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center gap-2">
          <Check size={14} className="text-emerald-400" />
          <p className="text-sm text-emerald-400">Profilo salvato.</p>
        </div>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? "Salvo…" : "Salva profilo"}
      </Button>
    </form>
  );
}
