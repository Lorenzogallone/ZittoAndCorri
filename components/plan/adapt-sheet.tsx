"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BatteryLow, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { adaptPlan } from "@/app/plan/actions";
import { ADAPT_DURATIONS, ADAPT_REASONS, type AdaptReason } from "@/lib/plan/adapt";

function untilLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** "Non mi sento al 100%": motivo + durata, poi il piano si adatta da solo. */
export function AdaptSheet({ variant = "header" }: { variant?: "header" | "inline" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AdaptReason | null>(null);
  const [days, setDays] = useState<number>(7);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setReason(null);
    setResult(null);
    setError(null);
  };

  const confirm = () => {
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const response = await adaptPlan(reason, days);
      if (response.error) return setError(response.error);
      setResult(
        response.count
          ? `${response.count === 1 ? "1 seduta adattata" : `${response.count} sedute adattate`} fino a ${untilLabel(response.until!)}. Puoi annullare dal piano.`
          : "Nessuna seduta da adattare in questi giorni.",
      );
      router.refresh();
    });
  };

  return (
    <>
      {variant === "header" ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="-mr-2">
          <BatteryLow size={16} />
          Non al 100%
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="w-full">
          <BatteryLow size={15} />
          Non me la sento
        </Button>
      )}

      {/* Portal sul body: l'header ha backdrop-filter, che intrappolerebbe il
          pannello fisso sotto la tab bar. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 backdrop-blur-[2px]" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="adapt-title"
            className="w-full max-w-lg rounded-t-[1.75rem] border-t border-border bg-background px-5 pt-4"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1.25rem)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/25" />
            <div className="mb-4 flex items-center justify-between">
              <h2 id="adapt-title" className="text-lg font-semibold">Come ti senti?</h2>
              <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="Chiudi"><X size={18} /></Button>
            </div>

            {result ? (
              <div className="pb-2">
                <p className="flex items-start gap-2 text-sm leading-relaxed">
                  <Check size={18} className="mt-0.5 shrink-0 text-primary" />
                  {result}
                </p>
                <Button type="button" className="mt-5 w-full" onClick={close}>Fatto</Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {(Object.keys(ADAPT_REASONS) as AdaptReason[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setReason(key)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left transition-colors",
                        reason === key ? "border-primary bg-primary/[0.07]" : "border-border hover:bg-muted/40",
                      )}
                      aria-pressed={reason === key}
                    >
                      <p className="text-sm font-medium">{ADAPT_REASONS[key].label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{ADAPT_REASONS[key].hint}</p>
                    </button>
                  ))}
                </div>

                <p className="mb-2 mt-5 text-xs font-medium text-muted-foreground">Per quanto tempo</p>
                <div className="grid grid-cols-3 gap-2">
                  {ADAPT_DURATIONS.map((option) => (
                    <button
                      key={option.days}
                      type="button"
                      onClick={() => setDays(option.days)}
                      className={cn(
                        "h-10 rounded-xl border text-sm transition-colors",
                        days === option.days ? "border-primary bg-primary/[0.07] font-semibold text-primary" : "border-border",
                      )}
                      aria-pressed={days === option.days}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
                <Button type="button" className="mt-5 w-full" disabled={!reason || pending} onClick={confirm}>
                  {pending ? "Adatto il piano…" : "Adatta il piano"}
                </Button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
