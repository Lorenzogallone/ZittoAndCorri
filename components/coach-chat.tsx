"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Check, LoaderCircle, Maximize2, Minimize2, Send, Sparkles, SquarePen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownMessage } from "@/components/markdown-message";
import { cn } from "@/lib/utils";
import { useAiJob } from "@/lib/use-ai-job";
import type { AiJobStatus } from "@/app/actions/ai-jobs";
import { applyPlanProposal, rejectPlanProposal, sendCoachMessage, startNewCoachChat } from "@/app/coach/actions";
import { isSessionMarker, splitSessions } from "@/lib/coach-session";
import { TYPE_LABELS } from "@/lib/activity-meta";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import type { CoachMessage, PlanProposal, ProposedWorkout } from "@/lib/types";
import type { WorkoutBrief } from "@/lib/plan/proposal-diff";
import { WorkoutSteps } from "@/components/workout-steps";
import { AiModelLine, AiProviderToggle, useAiSwitch, type AiSwitchState } from "@/components/ai-provider-switch";
import { workoutHeadline } from "@/lib/workout-guide";
import { AiCost } from "@/components/ai-cost";
import { readUsage } from "@/lib/ai/usage";

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", timeZone: "UTC" });

function briefText(brief: WorkoutBrief): string {
  const amount = brief.headline ?? (brief.meters ? formatDistance(brief.meters).replace(",00", "") : brief.minutes ? `${brief.minutes} min` : null);
  return [TYPE_LABELS[brief.type], amount].filter(Boolean).join(" · ");
}

const messageTime = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Data e costo sotto il messaggio: sotto la domanda il costo del prompt (tutto
 * il contesto inviato), sotto la risposta quello della risposta; tocca per il
 * dettaglio. Analisi e riepiloghi, senza domanda, mostrano il totale.
 */
function MessageFooter({ item, replyUsage }: { item: CoachMessage; replyUsage: ReturnType<typeof readUsage> }) {
  const time = messageTime(item.created_at);
  const own = item.role === "assistant" ? readUsage(item.metadata?.ai_usage) : null;
  const usage = item.role === "user" ? replyUsage : own;
  if (!usage) {
    return <p className={`mt-1 text-micro text-muted-foreground ${item.role === "user" ? "text-right" : ""}`}>{time}</p>;
  }
  const part = item.role === "user" ? "prompt" : item.metadata?.reply_to ? "reply" : "total";
  return <AiCost usage={usage} part={part} prefix={time} className={cn("mt-1", item.role === "user" && "text-right")} />;
}

const STATUS_TEXT: Record<Exclude<PlanProposal["status"], "pending">, string> = {
  applied: "Modifiche applicate al piano.",
  rejected: "Proposta annullata.",
  stale: "Proposta superata: il piano di quei giorni è cambiato o sono già passati.",
};

/** Prima/dopo giorno per giorno: si vede subito cosa cambia e cosa no. */
function ChangeList({ proposal }: { proposal: PlanProposal }) {
  const changes = proposal.changes ?? [];
  if (!changes.length) return null;
  return (
    <ul className="divide-y divide-border/50">
      {changes.map((change) => (
        <li key={change.date} className="flex items-baseline gap-3 px-4 py-2.5 text-xs">
          <span className="w-12 shrink-0 font-semibold capitalize">{dayLabel(change.date)}</span>
          <span className="min-w-0 flex-1">
            {change.before.length > 0 && (
              <span className="text-muted-foreground line-through decoration-muted-foreground/60">{change.before.map(briefText).join(", ")}</span>
            )}
            {change.before.length > 0 && <span className="px-1.5 text-muted-foreground">→</span>}
            <span className="font-medium">{change.after.length ? change.after.map(briefText).join(", ") : "riposo"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function WorkoutDetails({ workout }: { workout: ProposedWorkout }) {
  return (
    <div className="px-4 py-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold capitalize">{dayLabel(workout.date)}</span>
        <span className="text-primary">{TYPE_LABELS[workout.type]}</span>
      </div>
      <p className="mt-1 text-muted-foreground">{[
        workoutHeadline(workout.workout_steps ?? []),
        workout.target_distance_m ? formatDistance(workout.target_distance_m) : null,
        workout.target_duration_s ? formatDuration(workout.target_duration_s) : null,
        workout.target_pace_s_km ? formatPace(workout.target_pace_s_km) : null,
        workout.target_hr_bpm ? `HR ≤ ${workout.target_hr_bpm}` : null,
      ].filter(Boolean).join(" · ")}</p>
      {workout.description && (
        <div className="mt-2">
          <p className="text-micro font-semibold uppercase tracking-wide text-primary">Cosa fare e perché</p>
          <p className="mt-0.5 leading-relaxed">{workout.description}</p>
        </div>
      )}
      {workout.workout_steps?.length > 1 && (
        <div className="mt-2"><WorkoutSteps steps={workout.workout_steps} compact /></div>
      )}
      {workout.focus && (
        <div className="mt-2">
          <p className="text-micro font-semibold uppercase tracking-wide text-primary">Su cosa concentrarti</p>
          <p className="mt-0.5 leading-relaxed">{workout.focus}</p>
        </div>
      )}
    </div>
  );
}

function ProposalCard({ proposal, onStatusChange }: { proposal: PlanProposal; onStatusChange: (status: PlanProposal["status"]) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (proposal.status !== "pending") {
    return <p className="mt-3 text-xs text-muted-foreground">{STATUS_TEXT[proposal.status]}</p>;
  }

  async function decide(apply: boolean) {
    setPending(true);
    setError(null);
    try {
      const result = apply ? await applyPlanProposal(proposal.id) : await rejectPlanProposal(proposal.id);
      if (result?.error) setError(result.error);
      else onStatusChange(apply ? "applied" : "rejected");
    } catch {
      setError("Connessione interrotta. Verifica il piano prima di riprovare.");
    } finally {
      setPending(false);
    }
  }

  const hasChanges = (proposal.changes?.length ?? 0) > 0;
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-primary/20 bg-background/60">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Modifiche al piano</p>
        <p className="mt-1 text-sm">{proposal.summary}</p>
      </div>
      <ChangeList proposal={proposal} />
      {proposal.workouts.length > 0 && (
        hasChanges ? (
          <details className="border-t border-border/60">
            <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-primary">Dettagli delle sedute nuove</summary>
            <div className="max-h-72 divide-y divide-border/50 overflow-y-auto">
              {proposal.workouts.map((workout, index) => <WorkoutDetails key={`${workout.date}-${index}`} workout={workout} />)}
            </div>
          </details>
        ) : (
          <div className="max-h-72 divide-y divide-border/50 overflow-y-auto">
            {proposal.workouts.map((workout, index) => <WorkoutDetails key={`${workout.date}-${index}`} workout={workout} />)}
          </div>
        )
      )}
      {error && <p className="px-4 pt-3 text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-2 p-3">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => decide(false)}><X size={14} /> Annulla</Button>
        <Button type="button" size="sm" disabled={pending} onClick={() => decide(true)}><Check size={14} /> Conferma</Button>
      </div>
    </div>
  );
}

// Area visibile della finestra: su iPhone la tastiera la riduce senza cambiare
// il layout, quindi la chat a tutto schermo ne segue altezza e scostamento.
function subscribeViewport(onChange: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onChange);
  vv?.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    vv?.removeEventListener("resize", onChange);
    vv?.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}
const viewportSnapshot = () => {
  const vv = window.visualViewport;
  return vv ? `${Math.round(vv.height)}:${Math.round(vv.offsetTop)}:${window.innerHeight}` : "";
};

function useVisibleViewport() {
  const snapshot = useSyncExternalStore(subscribeViewport, viewportSnapshot, () => "");
  if (!snapshot) return null;
  const [height, top, layout] = snapshot.split(":").map(Number);
  // La tastiera occupa almeno un quarto dello schermo; sotto è solo la barra di Safari.
  return { height, top, keyboard: layout - height > layout / 4 };
}

function SessionDivider({ item }: { item: CoachMessage }) {
  return (
    <div className="flex items-center gap-3 py-1 text-micro font-medium text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      Nuova chat · {messageTime(item.created_at)}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function CoachChat({ messages, proposals, ai, analyzingActivities = 0 }: { messages: CoachMessage[]; proposals: PlanProposal[]; ai: AiSwitchState; analyzingActivities?: number }) {
  const aiSwitch = useAiSwitch(ai);
  const keyConfigured = aiSwitch.state.active !== null;
  const searchParams = useSearchParams();
  const [message, setMessage] = useState(searchParams.get("prompt") ?? "");
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayMessages, setDisplayMessages] = useState(messages);
  const [displayProposals, setDisplayProposals] = useState(proposals);
  const [showEarlier, setShowEarlier] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const viewport = useVisibleViewport();
  const showCoachResult = useCallback((status: AiJobStatus) => {
    if (!status.coachResult) throw new Error("Risultato chat mancante");
    const { message: coachMessage, proposal } = status.coachResult;
    setDisplayMessages((current) => current.some((item) => item.id === coachMessage.id)
      ? current
      : [...current, coachMessage]);
    if (proposal) {
      setDisplayProposals((current) => current.some((item) => item.id === proposal.id)
        ? current
        : [proposal, ...current]);
    }
  }, []);
  const { pending, error, start } = useAiJob("coach", { onDone: showCoachResult });
  const proposalsById = new Map(displayProposals.map((proposal) => [proposal.id, proposal]));
  // Costo di ogni risposta indicizzato per la domanda a cui risponde.
  const usageByQuestion = new Map(displayMessages.flatMap((item) => {
    const replyTo = item.metadata?.reply_to;
    const usage = readUsage(item.metadata?.ai_usage);
    return typeof replyTo === "string" && usage ? [[replyTo, usage] as const] : [];
  }));
  // Dopo "Nuova chat" si vede solo la conversazione corrente; le precedenti a richiesta.
  const session = splitSessions(displayMessages);
  const shown = showEarlier
    ? displayMessages.filter((item) => item.kind !== "status" || isSessionMarker(item))
    : session.current;
  const freshSession = displayMessages.some(isSessionMarker) && session.current.length === 0;

  // Scorre solo l'elenco dei messaggi (scrollIntoView spostava anche la pagina),
  // anche quando si apre la tastiera: l'ultimo messaggio resta sopra il campo.
  const visibleHeight = isExpanded ? viewport?.height : undefined;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: isExpanded ? "auto" : "smooth" });
  }, [displayMessages.length, pending, isExpanded, visibleHeight, showEarlier]);

  useEffect(() => {
    if (!isExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const collapseOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", collapseOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", collapseOnEscape);
    };
  }, [isExpanded]);

  async function newChat() {
    if (pending || resetting) return;
    setResetting(true);
    setResetError(null);
    try {
      const result = await startNewCoachChat();
      if (result.marker) {
        setDisplayMessages((current) => [...current, result.marker!]);
        setShowEarlier(false);
      } else setResetError(result.error ?? "Impossibile iniziare una nuova chat.");
    } catch {
      setResetError("Connessione interrotta. Riprova.");
    } finally {
      setResetting(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || pending) return;
    setMessage("");
    const optimisticId = `pending-${Date.now()}`;
    const optimisticMessage: CoachMessage = {
      id: optimisticId,
      user_id: "",
      role: "user",
      kind: "chat",
      content: text,
      activity_id: null,
      job_id: null,
      plan_proposal_id: null,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setDisplayMessages((current) => [...current, optimisticMessage]);
    void start(async () => {
      try {
        const result = await sendCoachMessage(text);
        if (result.userMessage) {
          setDisplayMessages((current) => current.map((item) =>
            item.id === optimisticId ? result.userMessage! : item));
        } else if (result.error) {
          setDisplayMessages((current) => current.filter((item) => item.id !== optimisticId));
        }
        return result;
      } catch (requestError) {
        setDisplayMessages((current) => current.filter((item) => item.id !== optimisticId));
        throw requestError;
      }
    });
  }

  const chat = (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        isExpanded
          ? "fixed inset-x-0 top-0 z-[80] h-[100dvh] bg-background"
          : "flex-1 basis-0 rounded-3xl bg-card shadow-[var(--surface-shadow)] ring-1 ring-border/60",
      )}
      style={isExpanded && viewport ? { top: viewport.top, height: viewport.height } : undefined}
      role={isExpanded ? "dialog" : undefined}
      aria-modal={isExpanded || undefined}
      aria-label={isExpanded ? "Chat con il coach" : undefined}
    >
      <header
        className="flex items-center gap-2 border-b border-border/60 py-2 pl-4 pr-2"
        style={isExpanded ? { paddingTop: "max(env(safe-area-inset-top, 0px), 0.625rem)" } : undefined}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"><Sparkles size={16} /></span>
        <div className="ml-1 min-w-0 flex-1">
          <h2 className="text-body font-semibold leading-tight">Coach</h2>
          <AiModelLine state={aiSwitch.state} />
        </div>
        <AiProviderToggle state={aiSwitch.state} choose={aiSwitch.choose} pending={aiSwitch.pending} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={newChat}
          disabled={pending || resetting || freshSession || displayMessages.length === 0}
          aria-label="Nuova chat"
          title="Nuova chat: il coach riparte senza la conversazione precedente"
        >
          {resetting ? <LoaderCircle className="animate-spin" /> : <SquarePen />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-label={isExpanded ? "Riduci la chat" : "Espandi la chat a tutto schermo"}
          aria-pressed={isExpanded}
          title={isExpanded ? "Riduci" : "Espandi a tutto schermo"}
        >
          {isExpanded ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </header>
      {(aiSwitch.error || resetError) && <p className="border-b border-border/50 px-4 py-2 text-xs text-destructive">{aiSwitch.error ?? resetError}</p>}
      {analyzingActivities > 0 && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          <LoaderCircle size={13} className="animate-spin text-primary" />
          {analyzingActivities === 1 ? "Sto analizzando una nuova attività…" : `Sto analizzando ${analyzingActivities} attività…`}
        </div>
      )}
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5">
        {!showEarlier && session.earlier > 0 && (
          <button type="button" onClick={() => setShowEarlier(true)} className="mx-auto block rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Mostra la chat precedente
          </button>
        )}
        {shown.length === 0 && (freshSession ? (
          <div className="mx-auto max-w-sm py-8 text-center">
            <p className="text-heading font-semibold">Nuova chat</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Il coach riparte da zero con la conversazione, ma conosce sempre piano, corse e quello che ha memorizzato di te.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-sm py-8 text-center"><p className="text-heading font-semibold">Parlami della tua settimana</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Posso adattare il piano a vacanze, caldo, escursioni, fatica o battiti troppo alti.</p></div>
        ))}
        {shown.map((item) => {
          if (isSessionMarker(item)) return <SessionDivider key={item.id} item={item} />;
          const proposal = item.plan_proposal_id ? proposalsById.get(item.plan_proposal_id) : null;
          return (
            <div key={item.id} className={item.role === "user" ? "ml-10" : "mr-3"}>
              <div className={item.role === "user" ? "rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground" : "rounded-2xl rounded-bl-md bg-muted/55 px-4 py-3 text-sm leading-relaxed"}>
                {item.role === "assistant"
                  ? <MarkdownMessage>{item.content}</MarkdownMessage>
                  : <p className="whitespace-pre-wrap break-words">{item.content}</p>}
                {proposal && (
                  <ProposalCard
                    proposal={proposal}
                    onStatusChange={(status) => setDisplayProposals((current) => current.map((candidate) =>
                      candidate.id === proposal.id ? { ...candidate, status } : candidate))}
                  />
                )}
              </div>
              <MessageFooter item={item} replyUsage={usageByQuestion.get(item.id) ?? null} />
            </div>
          );
        })}
        {pending && <div className="mr-16 flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted/55 px-4 py-3 text-sm text-muted-foreground"><LoaderCircle size={15} className="animate-spin" /> Sto ragionando sul tuo contesto…</div>}
      </div>
      <form
        onSubmit={submit}
        className={cn("border-t border-border/60 p-3", isExpanded ? "bg-background" : "bg-card")}
        // A tutto schermo: sopra l'indicatore home, o attaccato alla tastiera quando è aperta.
        style={isExpanded ? { paddingBottom: viewport?.keyboard ? "0.5rem" : "max(env(safe-area-inset-bottom, 0px), 0.75rem)" } : undefined}
      >
        {!keyConfigured ? <Link href="/settings?tab=coach" className="block rounded-xl bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">Aggiungi una chiave Gemini o OpenRouter per parlare con il coach</Link> : <div className="flex items-end gap-2"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} disabled={pending} placeholder="Es. Sono in vacanza 2 giorni..." className="max-h-32 min-h-12 resize-none" /><Button type="submit" size="icon" disabled={pending || !message.trim()} aria-label="Invia"><Send size={17} /></Button></div>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </form>
    </section>
  );

  // A tutto schermo la chat va direttamente nel body: fuori dal contenitore che
  // scorre (che su iOS la ritagliava e la lasciava sotto la barra in basso).
  return isExpanded ? (
    <>
      <div className="min-h-0 flex-1 basis-0 rounded-3xl bg-card ring-1 ring-border/60" aria-hidden="true" />
      {createPortal(chat, document.body)}
    </>
  ) : chat;
}
