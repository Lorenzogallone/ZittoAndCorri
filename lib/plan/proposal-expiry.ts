// Scadenza delle proposte di piano rimaste in attesa. Solo logica dell'app:
// nel database lo stato resta "pending", ma una proposta vecchia, superata da
// una più recente sugli stessi giorni o con tutti i giorni già passati non si
// mostra più come da confermare e non si può applicare. Modulo puro.

import type { Translator } from "../../i18n/config.ts";

/** Dopo quanti giorni una proposta non confermata scade. */
export const PROPOSAL_MAX_AGE_DAYS = 7;

export type ProposalExpiry = "too_old" | "superseded" | "past";

interface ProposalLike {
  id: string;
  status: string;
  created_at: string;
  range_end?: string | null;
  workouts?: Array<{ date: string }> | null;
  remove_dates?: string[] | null;
}

/** Giorni toccati da una proposta (nuove sedute + giorni svuotati). */
export function proposalDayList(proposal: Pick<ProposalLike, "workouts" | "remove_dates">): string[] {
  return [...new Set([...(proposal.workouts ?? []).map((w) => w.date.slice(0, 10)), ...(proposal.remove_dates ?? [])])].sort();
}

/**
 * Perché una proposta in attesa non vale più, null se è ancora valida.
 * `today` è la data di Roma (YYYY-MM-DD), `now` l'istante attuale in ms.
 */
export function proposalExpiry(
  proposal: ProposalLike,
  others: ProposalLike[],
  today: string,
  now: number,
  maxAgeDays = PROPOSAL_MAX_AGE_DAYS,
): ProposalExpiry | null {
  if (proposal.status !== "pending") return null;
  const created = Date.parse(proposal.created_at);
  if (Number.isFinite(created) && now - created > maxAgeDays * 86_400_000) return "too_old";
  const days = proposalDayList(proposal);
  const lastDay = days[days.length - 1] ?? proposal.range_end ?? null;
  if (lastDay && lastDay < today) return "past";
  const mine = new Set(days);
  const superseded = others.some((other) =>
    other.id !== proposal.id &&
    other.created_at > proposal.created_at &&
    other.status !== "rejected" &&
    (mine.size === 0 || proposalDayList(other).some((day) => mine.has(day))));
  return superseded ? "superseded" : null;
}

/** Spiegazione per l'utente di una proposta scaduta (`t` legato al namespace "labels"). */
export const proposalExpiryText = (t: Translator, reason: ProposalExpiry): string =>
  t(`expiry.${reason}`, { days: PROPOSAL_MAX_AGE_DAYS });

/**
 * Stato da mostrare: "expired" al posto di "pending" quando la proposta è
 * scaduta, con il motivo. Le proposte valide restano identiche (stesso oggetto).
 */
export function withProposalExpiry<P extends ProposalLike>(proposals: P[], today: string, now = Date.now()): P[] {
  return proposals.map((proposal) => {
    const reason = proposalExpiry(proposal, proposals, today, now);
    return reason ? ({ ...proposal, status: "expired", expired_reason: reason } as P) : proposal;
  });
}
