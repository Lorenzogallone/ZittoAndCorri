"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Check, ChevronRight, MessageCircle, Upload, Watch, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "zc:getting-started-hidden";
const PLAN_PROMPT = "/?prompt=Mi+prepari+il+piano+delle+prossime+due+settimane%3F";

// Flag "Nascondi" in localStorage, letto come store esterno: sul server e al
// primo render del client vale "sconosciuto" e la card non appare, così chi
// l'ha nascosta non la vede lampeggiare a ogni apertura.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readHidden(): "hidden" | "shown" {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1" ? "hidden" : "shown";
  } catch {
    return "shown";
  }
}
function hide() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage bloccato (navigazione privata): la card resta, nessun errore.
  }
  listeners.forEach((listener) => listener());
}

interface Step {
  key: string;
  title: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  done: boolean;
}

function StepRow({ step }: { step: Step }) {
  const Icon = step.icon;
  return (
    <li>
      <Link
        href={step.href}
        className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-0.5 transition-colors active:bg-muted/60"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
            step.done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
          )}
        >
          {step.done ? <Check size={16} strokeWidth={2.6} /> : <Icon size={16} strokeWidth={2.2} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-body font-semibold", step.done && "font-medium text-muted-foreground line-through decoration-muted-foreground/50")}>
            {step.title}
          </span>
          {!step.done && <span className="block truncate text-caption text-muted-foreground">{step.hint}</span>}
        </span>
        <span className="sr-only">{step.done ? "Fatto" : "Da fare"}</span>
        <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * "Inizia da qui": tre passi del primo uso con stato fatto/da fare. Sparisce
 * quando sono fatti tutti e tre, o con "Nascondi" (per sempre, su questo
 * dispositivo). Compatta: con nessun passo fatto sta sotto i 180px, così la
 * chat sotto resta usabile su iPhone.
 */
export function GettingStarted({
  hasActivity,
  watchLinked,
  hasPlan,
  aiReady,
  className,
}: {
  hasActivity: boolean;
  watchLinked: boolean;
  hasPlan: boolean;
  aiReady: boolean;
  className?: string;
}) {
  const visibility = useSyncExternalStore(subscribe, readHidden, () => null);
  const steps: Step[] = [
    {
      key: "activity",
      title: "Importa la prima corsa",
      hint: "Un file dall'orologio o una corsa a mano",
      href: "/activities/new",
      icon: Upload,
      done: hasActivity,
    },
    {
      key: "watch",
      title: "Collega l'orologio",
      hint: "Intervals.icu o Zepp: le corse arrivano da sole",
      href: "/settings?tab=links",
      icon: Watch,
      done: watchLinked,
    },
    {
      key: "plan",
      title: "Chiedi un piano al coach",
      hint: aiReady ? "Le prossime due settimane, sul tuo livello" : "Serve una chiave AI",
      href: aiReady ? PLAN_PROMPT : "/settings?tab=coach",
      icon: MessageCircle,
      done: hasPlan,
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  if (visibility !== "shown" || doneCount === steps.length) return null;

  return (
    <section aria-labelledby="getting-started-title" className={cn("surface animate-enter px-4 pb-1.5 pt-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow truncate">
          <span id="getting-started-title">Inizia da qui</span>
          <span className="font-medium normal-case tracking-normal tabular-nums"> · {doneCount} di {steps.length} fatto</span>
        </p>
        <button
          type="button"
          onClick={hide}
          className="-my-2 -mr-2 shrink-0 rounded-full px-2 py-2 text-caption font-medium text-muted-foreground transition-colors active:text-foreground"
        >
          Nascondi
        </button>
      </div>
      <ol className="mt-1 divide-y divide-border/60">
        {steps.map((step) => <StepRow key={step.key} step={step} />)}
      </ol>
    </section>
  );
}
