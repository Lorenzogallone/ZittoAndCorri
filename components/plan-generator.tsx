"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { generatePlan, type GeneratePlanState } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: GeneratePlanState = {};

export function PlanGenerator() {
  const [state, formAction, pending] = useActionState(
    generatePlan,
    initialState,
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] to-transparent" />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles size={18} className="text-primary" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Coach AI
            </h2>
            <p className="text-xs text-muted-foreground">
              Genera il piano delle prossime 2 settimane
            </p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Crea gli allenamenti in base a obiettivo, corse fatte e aderenza.
          Sovrascrive solo i workout ancora pianificati. Aggiungi qui i tuoi
          vincoli: verranno rispettati.
        </p>

        <form action={formAction} className="flex flex-col gap-2.5">
          <Textarea
            name="comments"
            rows={3}
            placeholder="Vincoli o preferenze, es. nel weekend non posso correre; max 4 uscite a settimana…"
          />

          {state.error && (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          )}
          {state.ok && !pending && (
            <p className="text-emerald-600 dark:text-emerald-400 text-sm">
              Piano aggiornato! La review è qui sotto.
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Genero il piano…" : "Genera piano 2 settimane"}
          </Button>
        </form>
      </div>
    </div>
  );
}
