// Expiry of plan proposals left pending. App logic only:
// in the database the status stays "pending", but an old proposal, superseded by
// a newer one on the same days or with all days already past is no
// longer shown as awaiting confirmation and cannot be applied. Pure module.

import type { Translator } from "../../i18n/config.ts";

/** After how many days an unconfirmed proposal expires. */
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

/** Days touched by a proposal (new sessions + cleared days). */
export function proposalDayList(proposal: Pick<ProposalLike, "workouts" | "remove_dates">): string[] {
  return [...new Set([...(proposal.workouts ?? []).map((w) => w.date.slice(0, 10)), ...(proposal.remove_dates ?? [])])].sort();
}

/**
 * Why a pending proposal is no longer valid, null if it is still valid.
 * `today` is the Rome date (YYYY-MM-DD), `now` the current instant in ms.
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

/** User-facing explanation of an expired proposal (`t` bound to the "labels" namespace). */
export const proposalExpiryText = (t: Translator, reason: ProposalExpiry): string =>
  t(`expiry.${reason}`, { days: PROPOSAL_MAX_AGE_DAYS });

/**
 * Status to show: "expired" instead of "pending" when the proposal has
 * expired, with the reason. Valid proposals stay identical (same object).
 */
export function withProposalExpiry<P extends ProposalLike>(proposals: P[], today: string, now = Date.now()): P[] {
  return proposals.map((proposal) => {
    const reason = proposalExpiry(proposal, proposals, today, now);
    return reason ? ({ ...proposal, status: "expired", expired_reason: reason } as P) : proposal;
  });
}
