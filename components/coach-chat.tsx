"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAiJob } from "@/lib/use-ai-job";
import { applyPlanProposal, rejectPlanProposal, sendCoachMessage } from "@/app/coach/actions";
import { TYPE_LABELS } from "@/lib/activity-meta";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import type { CoachMessage, PlanProposal } from "@/lib/types";

function ProposalCard({ proposal }: { proposal: PlanProposal }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (proposal.status !== "pending") {
    return <p className="mt-3 text-xs text-muted-foreground">Proposta {proposal.status === "applied" ? "applicata" : "annullata"}.</p>;
  }

  async function decide(apply: boolean) {
    setPending(true);
    setError(null);
    const result = apply ? await applyPlanProposal(proposal.id) : await rejectPlanProposal(proposal.id);
    if (result?.error) setError(result.error);
    else router.refresh();
    setPending(false);
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
            {workout.description && <p className="mt-1">{workout.description}</p>}
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
  const endRef = useRef<HTMLDivElement>(null);
  const { pending, error, start } = useAiJob("coach");
  const proposalsById = new Map(proposals.map((proposal) => [proposal.id, proposal]));

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages.length, pending]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || pending) return;
    setMessage("");
    start(() => sendCoachMessage(text));
  }

  return (
    <section className="flex min-h-[54svh] flex-col overflow-hidden rounded-[1.75rem] border border-primary/15 bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary"><Sparkles size={18} /></span>
        <div><h2 className="text-sm font-semibold">Il tuo coach</h2><p className="text-xs text-muted-foreground">Conosce piano, storico e feedback</p></div>
      </header>
      {analyzingActivities > 0 && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          <LoaderCircle size={13} className="animate-spin text-primary" />
          {analyzingActivities === 1 ? "Sto analizzando una nuova attività…" : `Sto analizzando ${analyzingActivities} attività…`}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 && <div className="mx-auto max-w-sm py-8 text-center"><p className="text-lg font-semibold">Parlami della tua settimana</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Posso adattare il piano a vacanze, caldo, escursioni, fatica o battiti troppo alti.</p></div>}
        {messages.map((item) => {
          const proposal = item.plan_proposal_id ? proposalsById.get(item.plan_proposal_id) : null;
          return (
            <div key={item.id} className={item.role === "user" ? "ml-10" : "mr-3"}>
              <div className={item.role === "user" ? "rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground" : "rounded-2xl rounded-bl-md bg-muted/55 px-4 py-3 text-sm leading-relaxed"}>
                <p className="whitespace-pre-wrap">{item.content}</p>{proposal && <ProposalCard proposal={proposal} />}
              </div>
              <p className={`mt-1 text-[10px] text-muted-foreground ${item.role === "user" ? "text-right" : ""}`}>{new Date(item.created_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          );
        })}
        {pending && <div className="mr-16 flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted/55 px-4 py-3 text-sm text-muted-foreground"><LoaderCircle size={15} className="animate-spin" /> Sto ragionando sul tuo contesto…</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="border-t border-border/60 bg-card p-3">
        {!keyConfigured ? <Link href="/settings?focus=gemini#gemini-integration" onClick={() => window.sessionStorage.setItem("settings-focus", "gemini")} className="block rounded-xl bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">Configura la chiave Gemini per parlare con il coach</Link> : <div className="flex items-end gap-2"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} disabled={pending} placeholder="Es. questa settimana fa molto caldo…" className="max-h-32 min-h-12 resize-none" /><Button type="submit" size="icon" disabled={pending || !message.trim()} aria-label="Invia"><Send size={17} /></Button></div>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </form>
    </section>
  );
}
