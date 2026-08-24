"use client";

import { useActionState, useState } from "react";
import { ChevronRight, HeartPulse } from "lucide-react";
import { updateProfile, type ProfileFormState } from "./actions";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ProfileFormState = {};

export function ProfileForm({ profile }: { profile: Partial<Profile> | null }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [isOpen, setIsOpen] = useState(false);

  const [prevOk, setPrevOk] = useState(state.ok);
  if (state.ok !== prevOk) {
    setPrevOk(state.ok);
    if (state.ok) setIsOpen(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/20"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <HeartPulse size={18} />
          </span>
          <span className="text-sm font-semibold text-foreground">Parametri atleta</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsOpen(false)} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="athlete-parameters-title"
            className="relative flex w-full max-w-md animate-in flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-2xl zoom-in-95"
          >
            <div>
              <h3 id="athlete-parameters-title" className="text-base font-semibold text-foreground">
                Parametri atleta
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Usati per calcolare zone cardiache e carico di allenamento.
              </p>
            </div>

            <form action={formAction} className="flex flex-col gap-4">
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
                    autoFocus
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
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3">
                  <p className="text-sm text-destructive" role="alert">{state.error}</p>
                </div>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  disabled={pending}
                >
                  Annulla
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Salvo…" : "Salva"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
