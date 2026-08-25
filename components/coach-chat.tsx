"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, LoaderCircle, Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownMessage } from "@/components/markdown-message";
import { cn } from "@/lib/utils";
import { useAiJob } from "@/lib/use-ai-job";
import type { AiJobStatus } from "@/app/actions/ai-jobs";
import { applyPlanProposal, rejectPlanProposal, sendCoachMessage } from "@/app/coach/actions";
import { TYPE_LABELS } from "@/lib/activity-meta";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import type { CoachMessage, PlanProposal } from "@/lib/types";

function ProposalCard({ proposal, onStatusChange }: { proposal: PlanProposal; onStatusChange: (status: PlanProposal["status"]) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (proposal.status !== "pending") {
    return <p className="mt-3 text-xs text-muted-foreground">Proposta {proposal.status === "applied" ? "applicata" : "annullata"}.</p>;
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

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-primary/20 bg-background/60">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Proposta piano</p>
        <p className="mt-1 text-sm">{proposal.summary}</p>
      </div>
      <div className="max-h-64 divide-y divide-border/50 overflow-y-auto">
        {proposal.workouts.map((workout, index) => (
          <div key={`${workout.date}-${index}`} className="px-4 py-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{new Date(`${workout.date}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}</span>
              <span className="text-primary">{TYPE_LABELS[workout.type]}</span>
            </div>
            <p className="mt-1 text-muted-foreground">{[
              workout.target_distance_m ? formatDistance(workout.target_distance_m) : null,
              workout.target_duration_s ? formatDuration(workout.target_duration_s) : null,
              workout.target_pace_s_km ? formatPace(workout.target_pace_s_km) : null,
              workout.target_hr_bpm ? `HR ≤ ${workout.target_hr_bpm}` : null,
            ].filter(Boolean).join(" · ")}</p>
            {workout.description && (
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Obiettivo della seduta</p>
                <p className="mt-0.5 leading-relaxed">{workout.description}</p>
              </div>
            )}
            {workout.focus && (
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Su cosa concentrarti</p>
                <p className="mt-0.5 leading-relaxed">{workout.focus}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p className="px-4 pt-3 text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-2 p-3">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => decide(false)}><X size={14} /> Annulla</Button>
        <Button type="button" size="sm" disabled={pending} onClick={() => decide(true)}><Check size={14} /> Conferma</Button>
      </div>
    </div>
  );
}

export function CoachChat({ messages, proposals, keyConfigured, analyzingActivities = 0 }: { messages: CoachMessage[]; proposals: PlanProposal[]; keyConfigured: boolean; analyzingActivities?: number }) {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState(searchParams.get("prompt") ?? "");
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayMessages, setDisplayMessages] = useState(messages);
  const [displayProposals, setDisplayProposals] = useState(proposals);
  const endRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [displayMessages.length, pending]);

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

  return (
    <section className={cn(
      "flex min-h-0 flex-1 basis-0 flex-col overflow-hidden border border-primary/15 bg-card shadow-sm",
      isExpanded ? "fixed inset-0 z-[70] rounded-none border-0" : "rounded-[1.75rem]",
    )}>
      <header
        className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5"
        style={isExpanded ? { paddingTop: "max(env(safe-area-inset-top, 0px), 0.625rem)" } : undefined}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary"><Sparkles size={18} /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Il tuo coach</h2><p className="truncate text-xs text-muted-foreground">Conosce piano, storico e feedback</p></div>
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
      {analyzingActivities > 0 && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          <LoaderCircle size={13} className="animate-spin text-primary" />
          {analyzingActivities === 1 ? "Sto analizzando una nuova attività…" : `Sto analizzando ${analyzingActivities} attività…`}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {displayMessages.length === 0 && <div className="mx-auto max-w-sm py-8 text-center"><p className="text-lg font-semibold">Parlami della tua settimana</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Posso adattare il piano a vacanze, caldo, escursioni, fatica o battiti troppo alti.</p></div>}
        {displayMessages.map((item) => {
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
              <p className={`mt-1 text-[10px] text-muted-foreground ${item.role === "user" ? "text-right" : ""}`}>{new Date(item.created_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          );
        })}
        {pending && <div className="mr-16 flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted/55 px-4 py-3 text-sm text-muted-foreground"><LoaderCircle size={15} className="animate-spin" /> Sto ragionando sul tuo contesto…</div>}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={submit}
        className="border-t border-border/60 bg-card p-3"
        style={isExpanded ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2rem)" } : undefined}
      >
        {!keyConfigured ? <Link href="/settings?focus=gemini#gemini-integration" className="block rounded-xl bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">Configura la chiave Gemini per parlare con il coach</Link> : <div className="flex items-end gap-2"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} disabled={pending} placeholder="Es. Sono in vacanza 2 giorni..." className="max-h-32 min-h-12 resize-none" /><Button type="submit" size="icon" disabled={pending || !message.trim()} aria-label="Invia"><Send size={17} /></Button></div>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </form>
    </section>
  );
}
