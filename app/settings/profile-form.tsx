"use client";

import { useActionState, useState } from "react";
import { updateProfile, type ProfileFormState } from "./actions";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit2 } from "lucide-react";

const initialState: ProfileFormState = {};

export function ProfileForm({ profile }: { profile: Partial<Profile> | null }) {
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState,
  );
  const [isOpen, setIsOpen] = useState(false);

  // Chiudi il modal quando il salvataggio va a buon fine: adattamento dello
  // stato durante il render (pattern React per derivare da props/state),
  // senza passare da un effect.
  const [prevOk, setPrevOk] = useState(state.ok);
  if (state.ok !== prevOk) {
    setPrevOk(state.ok);
    if (state.ok) setIsOpen(false);
  }

  return (
    <div>
      {/* Visualizzazione sola lettura — il nome è già nell'header in alto,
          qui restano solo i dati fisiologici usati per i calcoli. */}
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">HR Max</span>
            <span className="font-semibold text-sm text-foreground block">
              {profile?.max_hr ? `${profile.max_hr} bpm` : "Non imp."}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">HR Riposo</span>
            <span className="font-semibold text-sm text-foreground block">
              {profile?.resting_hr ? `${profile.resting_hr} bpm` : "Non imp."}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Nascita</span>
            <span className="font-semibold text-sm text-foreground block">
              {profile?.birthdate
                ? new Date(profile.birthdate).toLocaleDateString("it-IT", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "Non imp."}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="text-xs h-8 flex items-center gap-1.5 hover:bg-white/[0.05]"
          >
            <Edit2 size={12} />
            Modifica
          </Button>
        </div>
      </div>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          {/* Backdrop click to close */}
          <div className="absolute inset-0" onClick={() => setIsOpen(false)} />

          <div className="bg-card border border-white/[0.08] rounded-2xl w-full max-w-md p-6 relative shadow-2xl flex flex-col gap-5 animate-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-base font-semibold text-foreground">Modifica parametri atleta</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Questi dati vengono usati per calcolare le zone di frequenza cardiaca ed i carichi.
              </p>
            </div>

            <form action={formAction} className="flex flex-col gap-4">
              <div className="grid gap-2.5">
                <Label htmlFor="display_name">Nome</Label>
                <Input
                  id="display_name"
                  name="display_name"
                  type="text"
                  defaultValue={profile?.display_name ?? ""}
                  autoFocus
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

              <div className="flex gap-2 justify-end mt-2">
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
