"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CloudOff, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { syncIssueText, type SyncIssue } from "@/lib/sync-health";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "zc:sync-banner-dismissed";
const CHANGE_EVENT = "zc:sync-banner-change";

/** Signature of the problems: if it changes (new problem or new date) the banner returns. */
const signature = (issues: SyncIssue[]) => issues.map((issue) => `${issue.kind}:${issue.since ?? ""}`).join("|");

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Compact "data stalled" notice: one line with the most important problem, the
 * link to the integration settings and the X to dismiss it. Once dismissed it stays
 * hidden as long as the problems are the same. Does not appear when all is well.
 */
export function SyncHealthBanner({ issues, className }: { issues: SyncIssue[]; className?: string }) {
  // undefined on the server: shown only after reading whether it was dismissed,
  // so an already dismissed notice does not flash on open.
  const t = useTranslations("home.syncBanner");
  const tStatus = useTranslations("status");
  const locale = useLocale() as Locale;
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => undefined);
  const [issue] = issues;
  const current = signature(issues);
  if (!issue || dismissed === undefined || dismissed === current) return null;
  const others = issues.length - 1;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, current);
    } catch {
      // Without storage (private browsing) it is dismissed only until the next load.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <div role="status" className={cn("flex items-center gap-3 rounded-2xl bg-muted/50 py-1.5 pl-4 pr-1", className)}>
      <CloudOff size={18} aria-hidden className="shrink-0 text-destructive" />
      <p className="min-w-0 flex-1 py-1.5 text-sm leading-snug" title={issues.map((item) => syncIssueText(item, tStatus, locale)).join("\n")}>
        {syncIssueText(issue, tStatus, locale)}
        {others > 0 && <span className="text-muted-foreground"> · +{others}</span>}
      </p>
      <Link href={issue.href} className="shrink-0 text-sm font-medium text-primary">
        {t("check")}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="pressable grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
