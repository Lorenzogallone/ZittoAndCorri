"use client";

import { useActionState, useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { generatePlan, type GeneratePlanState } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: GeneratePlanState = {};

export function PlanGenerator() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    generatePlan,
    initialState,
  );

  return (
    <div className="mb-4 rounded-2xl border border-primary/15 bg-primary/[0.04] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <span className="text-sm font-semibold text-primary">
            Pianifica con il coach AI
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`text-primary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <form action={formAction} className="flex flex-col gap-2.5 px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            Genera gli allenamenti delle prossime 2 settimane in base a obiettivo,
            corse fatte e aderenza. Sovrascrive solo i workout ancora pianificati.
          </p>
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
      )}
    </div>
  );
}
