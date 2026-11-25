"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale, type Translator } from "@/i18n/config";
import { useSearchParams } from "next/navigation";
import { CircleAlert, Check, LoaderCircle, Maximize2, Minimize2, RotateCw, Send, Sparkles, SquarePen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { MarkdownMessage } from "@/components/markdown-message";
import { cn } from "@/lib/utils";
import { tap } from "@/lib/haptics";
import { useAiJob } from "@/lib/use-ai-job";
import { useRefreshWhile } from "@/lib/use-app-refresh";
import type { AiJobStatus } from "@/app/actions/ai-jobs";
import { applyPlanProposal, rejectPlanProposal, retryCoachMessage, sendCoachMessage, startNewCoachChat, type CoachActionResult } from "@/app/coach/actions";
import { isSessionMarker, splitSessions } from "@/lib/coach-session";
import { typeLabel } from "@/lib/activity-meta";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import type { CoachMessage, PlanProposal, ProposedWorkout } from "@/lib/types";
import type { WorkoutBrief } from "@/lib/plan/proposal-diff";
import { dayPartLabel } from "@/lib/plan/day-sessions";
import { WorkoutSteps } from "@/components/workout-steps";
import { AiModelLine, type AiSwitchState } from "@/components/ai-provider-switch";
import { workoutHeadline } from "@/lib/workout-guide";
import { AiCost } from "@/components/ai-cost";
import { readUsage } from "@/lib/ai/usage";
import { markSendError, sendErrorOf } from "@/lib/coach-failures";
import { proposalExpiryText, withProposalExpiry } from "@/lib/plan/proposal-expiry";
import { romeDay } from "@/lib/local-date";

const dayLabel = (iso: string, locale: Locale) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { weekday: "short", day: "numeric", timeZone: "UTC" });

/** "10 km" se tondi, altrimenti "8,50 km" (it) / "8.50 km" (en). */
const briefDistance = (meters: number, locale: Locale) =>
  Math.round(meters / 10) % 100 === 0 ? `${Math.round(meters / 1000)} km` : formatDistance(meters, locale);

function briefText(brief: WorkoutBrief, tl: Translator, locale: Locale): string {
  const amount = brief.headline ?? (brief.meters ? briefDistance(brief.meters, locale) : brief.minutes ? `${brief.minutes} min` : null);
  const part = brief.day_part && !brief.chained ? dayPartLabel(tl, brief.day_part).toLowerCase() : null;
  return [typeLabel(tl, brief.type), amount, part].filter(Boolean).join(" · ");
}

/** Sedute di un giorno: quelle concatenate (un'unica uscita) unite da "+". */
function briefsText(briefs: WorkoutBrief[], tl: Translator, locale: Locale): string {
  return briefs.reduce((text, brief, index) =>
    index === 0 ? briefText(brief, tl, locale) : `${text}${brief.chained ? " + " : ", "}${briefText(brief, tl, locale)}`, "");
}

const messageTime = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleString(intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Data e costo sotto il messaggio: sotto la domanda il costo del prompt (tutto
 * il contesto inviato), sotto la risposta quello della risposta; tocca per il
 * dettaglio. Analisi e riepiloghi, senza domanda, mostrano il totale.
 */
function MessageFooter({ item, replyUsage }: { item: CoachMessage; replyUsage: ReturnType<typeof readUsage> }) {
  const locale = useLocale() as Locale;
  const time = messageTime(item.created_at, locale);
  const own = item.role === "assistant" ? readUsage(item.metadata?.ai_usage) : null;
  const usage = item.role === "user" ? replyUsage : own;
  if (!usage) {
    return <p className={`mt-1 text-micro text-muted-foreground ${item.role === "user" ? "text-right" : ""}`}>{time}</p>;
  }
  const part = item.role === "user" ? "prompt" : item.metadata?.reply_to ? "reply" : "total";
  return <AiCost usage={usage} part={part} prefix={time} className={cn("mt-1", item.role === "user" && "text-right")} />;
}

const statusText = (proposal: PlanProposal, t: ReturnType<typeof useTranslations<"coach.chat">>, tl: Translator) => proposal.status === "expired"
  ? proposalExpiryText(tl, proposal.expired_reason ?? "too_old")
  // Il testo di ogni stato è in messages/it/coach.json (chat.proposalStatus.*).
  : t(`proposalStatus.${proposal.status as "applied" | "rejected" | "stale"}`);

/** Prima/dopo giorno per giorno: si vede subito cosa cambia e cosa no. */
function ChangeList({ proposal }: { proposal: PlanProposal }) {
  const t = useTranslations("coach.chat");
  const tl = useTranslations("labels");
  const locale = useLocale() as Locale;
  const changes = proposal.changes ?? [];
  if (!changes.length) return null;
  return (
    <ul className="divide-y divide-border/50">
      {changes.map((change) => (
        <li key={change.date} className="flex items-baseline gap-3 px-4 py-2.5 text-xs">
          <span className="w-12 shrink-0 font-semibold capitalize">{dayLabel(change.date, locale)}</span>
          <span className="min-w-0 flex-1">
            {change.before.length > 0 && (
              <span className="text-muted-foreground line-through decoration-muted-foreground/60">{briefsText(change.before, tl, locale)}</span>
            )}
            {change.before.length > 0 && <span className="px-1.5 text-muted-foreground">→</span>}
            <span className="font-medium">{change.after.length ? briefsText(change.after, tl, locale) : t("rest")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function WorkoutDetails({ workout }: { workout: ProposedWorkout }) {
  const t = useTranslations("coach.chat");
  const tl = useTranslations("labels");
  const locale = useLocale() as Locale;
  return (
    <div className="px-4 py-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold capitalize">{dayLabel(workout.date, locale)}</span>
        <span className="text-primary">{typeLabel(tl, workout.type)}</span>
      </div>
      <p className="mt-1 text-muted-foreground">{[
        workoutHeadline(workout.workout_steps ?? [], locale),
        workout.target_distance_m ? formatDistance(workout.target_distance_m, locale) : null,
        workout.target_duration_s ? formatDuration(workout.target_duration_s) : null,
        workout.target_pace_s_km ? formatPace(workout.target_pace_s_km) : null,
        workout.target_hr_bpm ? t("hrCap", { bpm: workout.target_hr_bpm }) : null,
      ].filter(Boolean).join(" · ")}</p>
      {workout.description && (
        <div className="mt-2">
          <p className="text-micro font-semibold uppercase tracking-wide text-primary">{t("whatAndWhy")}</p>
          <p className="mt-0.5 leading-relaxed">{workout.description}</p>
        </div>
      )}
      {workout.workout_steps?.length > 1 && (
        <div className="mt-2"><WorkoutSteps steps={workout.workout_steps} compact /></div>
      )}
      {workout.focus && (
        <div className="mt-2">
          <p className="text-micro font-semibold uppercase tracking-wide text-primary">{t("focusOn")}</p>
          <p className="mt-0.5 leading-relaxed">{workout.focus}</p>
        </div>
      )}
    </div>
  );
}

function ProposalCard({ proposal, onStatusChange }: { proposal: PlanProposal; onStatusChange: (status: PlanProposal["status"]) => void }) {
  const t = useTranslations("coach.chat");
  const tl = useTranslations("labels");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (proposal.status !== "pending") {
    return <p className="mt-3 text-xs text-muted-foreground">{statusText(proposal, t, tl)}</p>;
  }

  async function decide(apply: boolean) {
    setPending(true);
    setError(null);
    try {
      const result = apply ? await applyPlanProposal(proposal.id) : await rejectPlanProposal(proposal.id);
      if (result?.error) setError(result.error);
      else {
        if (apply) tap();
        onStatusChange(apply ? "applied" : "rejected");
      }
    } catch {
      setError(t("connectionLostCheckPlan"));
    } finally {
      setPending(false);
    }
  }

  const hasChanges = (proposal.changes?.length ?? 0) > 0;
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-primary/20 bg-background/60">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("planChanges")}</p>
        <p className="mt-1 text-sm">{proposal.summary}</p>
      </div>
      <ChangeList proposal={proposal} />
      {proposal.workouts.length > 0 && (
        hasChanges ? (
          <details className="border-t border-border/60">
            <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-primary">{t("newWorkoutsDetails")}</summary>
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
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => decide(false)}><X size={14} /> {t("cancel")}</Button>
        <Button type="button" size="sm" disabled={pending} onClick={() => decide(true)}><Check size={14} /> {t("confirm")}</Button>
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
  const t = useTranslations("coach.chat");
  const locale = useLocale() as Locale;
  return (
    <div className="flex items-center gap-3 py-1 text-micro font-medium text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {t("newChatDivider", { time: messageTime(item.created_at, locale) })}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Sotto un messaggio rimasto senza risposta: cosa è successo e "Riprova", che
 * rimanda lo stesso messaggio senza riscriverlo.
 */
function FailedNotice({ reason, retrying, disabled, onRetry }: { reason: string; retrying: boolean; disabled: boolean; onRetry: () => void }) {
  const t = useTranslations("coach.chat");
  return (
    // Testo lungo e tasto da 44 pt: su schermi stretti il tasto va a capo sotto il testo.
    <div className="mt-1.5 flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5" role="status">
      <p className="flex min-w-0 flex-1 basis-48 items-start justify-end gap-1.5 text-right text-xs text-destructive">
        <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
        <span className="min-w-0"><span className="font-semibold">{t("notSent")}</span> {reason}</span>
      </p>
      <Button type="button" variant="outline" disabled={disabled || retrying} onClick={onRetry} aria-label={t("retryLabel")}>
        {retrying ? <LoaderCircle className="animate-spin" /> : <RotateCw />}
        {retrying ? t("sending") : t("retry")}
      </Button>
    </div>
  );
}

const newClientId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Lista del server più gli elementi locali più recenti che non contiene ancora. */
function mergeServer<T extends { id: string; created_at: string }>(server: T[], local: T[]): T[] {
  const ids = new Set(server.map((item) => item.id));
  const newest = server.reduce((max, item) => (item.created_at > max ? item.created_at : max), "");
  const extra = local.filter((item) => !ids.has(item.id) && (item.id.startsWith("pending-") || item.created_at > newest));
  return extra.length ? [...server, ...extra] : server;
}

export function CoachChat({ messages, proposals, ai, analyzingActivities = 0 }: { messages: CoachMessage[]; proposals: PlanProposal[]; ai: AiSwitchState; analyzingActivities?: number }) {
  const t = useTranslations("coach.chat");
  const keyConfigured = ai.active !== null;
  const searchParams = useSearchParams();
  const [message, setMessage] = useState(searchParams.get("prompt") ?? "");
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayMessages, setDisplayMessages] = useState(messages);
  const [displayProposals, setDisplayProposals] = useState(proposals);
  // Dopo un refresh (trascina-giù, analisi finita) arrivano i dati nuovi dal
  // server: valgono loro, più i messaggi locali che il server non ha ancora.
  const [serverData, setServerData] = useState({ messages, proposals });
  if (serverData.messages !== messages || serverData.proposals !== proposals) {
    setServerData({ messages, proposals });
    setDisplayMessages((current) => mergeServer(messages, current));
    setDisplayProposals((current) => mergeServer(proposals, current));
  }
  const [showEarlier, setShowEarlier] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const viewport = useVisibleViewport();
  // Analisi di corse nuove in corso: la risposta compare da sola in chat.
  useRefreshWhile(analyzingActivities > 0);
  // Messaggio dell'atleta che il coach sta elaborando: se il turno fallisce è lui il "non inviato".
  const [activeId, setActiveId] = useState<string | null>(null);
  // Messaggio per cui "Riprova" sta aspettando il server.
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const showCoachResult = useCallback((status: AiJobStatus) => {
    if (!status.coachResult) throw new Error(t("resultMissing"));
    const { message: coachMessage, proposal } = status.coachResult;
    setDisplayMessages((current) => current.some((item) => item.id === coachMessage.id)
      ? current
      : [...current, coachMessage]);
    if (proposal) {
      // La proposta nuova supera quelle ancora in attesa sugli stessi giorni.
      setDisplayProposals((current) => current.some((item) => item.id === proposal.id)
        ? current
        : withProposalExpiry([proposal, ...current], romeDay()));
    }
    setActiveId(null);
  }, [t]);
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
  // Errore di un turno ripreso dopo il riavvio della PWA (messaggio non noto):
  // va sull'ultima domanda se è rimasta in fondo senza risposta.
  const lastItem = [...shown].reverse().find((item) => item.kind !== "status");
  const failedId = activeId ?? (error && !pending && lastItem?.role === "user" ? lastItem.id : null);

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
      } else setResetError(result.error ?? t("newChatFailed"));
    } catch {
      setResetError(t("connectionLostRetry"));
    } finally {
      setResetting(false);
    }
  }

  /** Sostituisce un messaggio locale con quello del server (o lo aggiorna). */
  const replaceMessage = (id: string, next: CoachMessage) =>
    setDisplayMessages((current) => current.map((item) => (item.id === id ? next : item)));

  /** Avvia il turno del coach; un errore lascia il messaggio in chat con "Riprova". */
  function run(localId: string, request: () => Promise<CoachActionResult>, fallback: CoachMessage) {
    // Il turno precedente fallito resta segnato anche quando ne parte un altro.
    if (error && activeId && activeId !== localId) {
      const failedId = activeId;
      setDisplayMessages((current) => current.map((item) => item.id === failedId && !sendErrorOf(item)
        ? { ...item, metadata: markSendError(item.metadata, { message: error, at: "" }) }
        : item));
    }
    setActiveId(localId);
    void start(async () => {
      try {
        const result = await request();
        if (result.userMessage) {
          replaceMessage(localId, result.userMessage);
          setActiveId(result.userMessage.id);
        }
        if (result.error && !result.userMessage) {
          replaceMessage(localId, { ...fallback, metadata: markSendError(fallback.metadata, { message: result.error, at: "" }) });
        }
        return result;
      } catch (requestError) {
        replaceMessage(localId, { ...fallback, metadata: markSendError(fallback.metadata, { message: t("connectionLost"), at: "" }) });
        throw requestError;
      } finally {
        setRetryingId(null);
      }
    });
  }

  function submit() {
    const text = message.trim();
    if (!text || pending) return;
    setMessage("");
    const clientId = newClientId();
    const optimisticMessage: CoachMessage = {
      id: `pending-${clientId}`,
      user_id: "",
      role: "user",
      kind: "chat",
      content: text,
      activity_id: null,
      job_id: null,
      plan_proposal_id: null,
      metadata: { client_id: clientId },
      created_at: new Date().toISOString(),
    };
    setDisplayMessages((current) => [...current, optimisticMessage]);
    run(optimisticMessage.id, () => sendCoachMessage(text, clientId), optimisticMessage);
  }

  /**
   * "Riprova": lo stesso messaggio torna in fondo alla chat e riparte. Se non
   * era mai arrivato al server si rimanda con lo stesso client_id (niente doppioni).
   */
  function retry(item: CoachMessage) {
    if (pending || retryingId) return;
    setRetryingId(item.id);
    // In fondo alla chat subito; il segno d'errore resta finché il server non risponde.
    const moved: CoachMessage = { ...item, created_at: new Date().toISOString() };
    setDisplayMessages((current) => [...current.filter((candidate) => candidate.id !== item.id), moved]);
    const clientId = typeof item.metadata?.client_id === "string" ? item.metadata.client_id : undefined;
    const resent: CoachMessage = { ...moved, metadata: markSendError(item.metadata, null) };
    run(item.id, () => (item.id.startsWith("pending-") ? sendCoachMessage(item.content, clientId) : retryCoachMessage(item.id)), resent);
  }

  // Su desktop (tastiera fisica) Invio manda e Maiusc+Invio va a capo; sul
  // telefono Invio resta un a capo.
  function sendOnEnter(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    event.preventDefault();
    submit();
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
      aria-label={isExpanded ? t("chatLabel") : undefined}
    >
      <header
        className="flex items-center gap-2 border-b border-border/60 py-2 pl-4 pr-2"
        style={isExpanded ? { paddingTop: "max(env(safe-area-inset-top, 0px), 0.625rem)" } : undefined}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"><Sparkles size={16} /></span>
        <div className="ml-1 min-w-0 flex-1">
          <h2 className="text-body font-semibold leading-tight">{t("title")}</h2>
          <AiModelLine state={ai} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={newChat}
          disabled={pending || resetting || freshSession || displayMessages.length === 0}
          aria-label={t("newChatLabel")}
          title={t("newChatTitle")}
        >
          {resetting ? <LoaderCircle className="animate-spin" /> : <SquarePen />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          // Su desktop la chat è già grande: niente tutto schermo.
          className="lg:hidden"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-label={isExpanded ? t("collapseLabel") : t("expandLabel")}
          aria-pressed={isExpanded}
          title={isExpanded ? t("collapse") : t("expand")}
        >
          {isExpanded ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </header>
      {resetError && <p className="border-b border-border/50 px-4 py-2 text-xs text-destructive">{resetError}</p>}
      {analyzingActivities > 0 && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          <LoaderCircle size={13} className="animate-spin text-primary" />
          {t("analyzingActivities", { count: analyzingActivities })}
        </div>
      )}
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5">
        {!showEarlier && session.earlier > 0 && (
          <button type="button" onClick={() => setShowEarlier(true)} className="mx-auto block rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {t("showEarlier")}
          </button>
        )}
        {shown.length === 0 && (freshSession ? (
          <div className="mx-auto max-w-sm py-8 text-center">
            <p className="text-heading font-semibold">{t("freshTitle")}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("freshIntro")}</p>
          </div>
        ) : (
          <div className="mx-auto max-w-sm py-8 text-center"><p className="text-heading font-semibold">{t("emptyTitle")}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("emptyIntro")}</p></div>
        ))}
        {shown.map((item) => {
          if (isSessionMarker(item)) return <SessionDivider key={item.id} item={item} />;
          const proposal = item.plan_proposal_id ? proposalsById.get(item.plan_proposal_id) : null;
          // Non inviato: segnato dal server, oppure turno appena fallito per questo messaggio.
          const failure = item.role === "user"
            ? sendErrorOf(item)?.message ?? (!pending && error && failedId === item.id ? error : null)
            : null;
          return (
            <div key={item.id} className={item.role === "user" ? "ml-10 lg:ml-[max(2.5rem,calc(100%-42rem))]" : "mr-3 lg:max-w-3xl"}>
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
              {failure
                ? <FailedNotice reason={failure} retrying={retryingId === item.id} disabled={pending} onRetry={() => retry(item)} />
                : <MessageFooter item={item} replyUsage={usageByQuestion.get(item.id) ?? null} />}
            </div>
          );
        })}
        {pending && <div className="mr-16 flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted/55 px-4 py-3 text-sm text-muted-foreground"><LoaderCircle size={15} className="animate-spin" /> {t("reasoning")}</div>}
      </div>
      {/* Il campo è un TextField (contenteditable), non un textarea: il
          riempimento automatico di Safari su iOS ignora autocomplete="off" e
          proponeva l'indirizzo di casa. L'invio passa dal pulsante e, con la
          tastiera fisica, da Invio. */}
      <div
        className={cn("border-t border-border/60 p-3", isExpanded ? "bg-background" : "bg-card")}
        // A tutto schermo: sopra l'indicatore home, o attaccato alla tastiera quando è aperta.
        style={isExpanded ? { paddingBottom: viewport?.keyboard ? "0.5rem" : "max(env(safe-area-inset-bottom, 0px), 0.75rem)" } : undefined}
      >
        {!keyConfigured ? <Link href="/settings?tab=coach" className="pressable block rounded-xl bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">{t("addKey")}</Link> : <div className="flex items-end gap-2"><TextField aria-label={t("writeLabel")} value={message} onValueChange={setMessage} onKeyDown={sendOnEnter} rows={1} disabled={pending} placeholder={t("writePlaceholder")} className="max-h-32" /><Button type="button" size="icon" disabled={pending || !message.trim()} aria-label={t("send")} onClick={submit}><Send size={17} /></Button></div>}
        {/* L'errore di un messaggio sta sotto il messaggio, con "Riprova". */}
        {error && !failedId && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
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
