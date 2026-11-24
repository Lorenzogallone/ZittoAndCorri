"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-sheet";
import { IntegrationCard, IntegrationHelp } from "./integration-card";
import {
  deleteZeppConnectionData,
  disableZeppConnection,
  generateZeppPairingCode,
} from "./zepp-actions";
import type { ZeppConnectionView } from "@/lib/zepp/types";

interface Props {
  initialConnection: ZeppConnectionView | null;
}

function formatDate(value: string | null, never: string): string {
  if (!value) return never;
  return new Date(value).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

const richTags = {
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
  em: (chunks: ReactNode) => <em>{chunks}</em>,
};

/** Oltre questo limite i dati giornalieri dell'orologio vengono ignorati (vedi lib/zepp/data). */
const STALE_MS = 3 * 86_400_000;

export function ZeppIntegrationSection({ initialConnection }: Props) {
  const t = useTranslations("settingsLinks.zepp");
  const [connection, setConnection] = useState(initialConnection);
  const [enabled, setEnabled] = useState(Boolean(initialConnection?.enabled));
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { confirm, element: confirmSheet } = useConfirm();
  const [now] = useState(() => Date.now());
  const stale = Boolean(connection?.last_sync_at) && now - new Date(connection!.last_sync_at!).getTime() > STALE_MS;

  const generate = () => startTransition(async () => {
    setError(null);
    const result = await generateZeppPairingCode();
    if (result.error || !result.code) return setError(result.error ?? t("codeUnavailable"));
    setCode(result.code);
    setExpiresAt(result.expiresAt ?? null);
  });

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  const disable = async () => {
    if (
      connection?.enabled &&
      !(await confirm({
        title: t("confirm.disable.title"),
        description: t("confirm.disable.description"),
        action: t("confirm.disable.action"),
      }))
    )
      return;
    startTransition(async () => {
      const result = await disableZeppConnection();
      if (result.error) return setError(result.error);
      setConnection((current) => current ? { ...current, enabled: false } : null);
      setEnabled(false);
      setCode(null);
      setExpiresAt(null);
      setError(null);
    });
  };

  const toggle = () => {
    if (enabled) {
      void disable();
      return;
    }
    setEnabled(true);
    generate();
  };

  const remove = async () => {
    const confirmed = await confirm({
      title: t("confirm.delete.title"),
      description: t("confirm.delete.description"),
      action: t("confirm.delete.action"),
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteZeppConnectionData();
      if (result.error) return setError(result.error);
      setConnection(null);
      setEnabled(false);
      setCode(null);
      setExpiresAt(null);
      setError(null);
    });
  };

  return (
    <IntegrationCard
      id="zepp-os-integration"
      description={t("description")}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium">{t("useWatchData")}</p>
          <Switch checked={enabled} onCheckedChange={toggle} disabled={pending} aria-label={t("useWatchDataAria")} />
        </div>

        {!enabled ? null : connection?.enabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Check size={16} className="text-emerald-500" />
              <span className="font-medium">{t("connected", { device: connection.device_name ?? t("defaultDevice") })}</span>
            </div>
            <p className={`text-xs ${stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
              {t("lastSync", { date: formatDate(connection.last_sync_at, t("never")) })}
              {stale && ` · ${t("staleNote")}`}
            </p>
            {connection.last_error && <p className="text-xs text-destructive">{t("lastError", { error: connection.last_error })}</p>}
            <Button type="button" variant="ghost" size="sm" className="-ml-3 text-destructive hover:text-destructive" disabled={pending} onClick={remove}>
              <Trash2 size={14} /> {t("disconnectAndDelete")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {code ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-center">
                <p className="text-xs text-muted-foreground">{t("codeTitle")}</p>
                <button type="button" onClick={copy} className="mt-2 font-mono text-3xl font-bold tracking-[0.3em] text-primary">
                  {code}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {copied ? t("copied") : expiresAt ? t("validUntil", { time: new Date(expiresAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) }) : t("validFallback")}
                </p>
                <p className="mt-1 text-xs font-medium text-primary/80">
                  {t("codeHint")}
                </p>
              </div>
            ) : (
              <Button type="button" className="w-full" disabled={pending} onClick={generate}>
                <Link2 size={16} /> {pending ? t("generating") : t("generate")}
              </Button>
            )}
            {code && <Button type="button" variant="outline" size="sm" className="w-full" disabled={pending} onClick={generate}>{t("generateNew")}</Button>}
          </div>
        )}

        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

        <IntegrationHelp title={t("help.title")}>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>{t("help.step1")}</li>
            <li>{t.rich("help.step2", richTags)}</li>
            <li>{t.rich("help.step3", richTags)}</li>
            <li>{t("help.step4")}</li>
          </ol>
          <p className="mt-3 text-muted-foreground">{t("help.note")}</p>
        </IntegrationHelp>
        {confirmSheet}
      </div>
    </IntegrationCard>
  );
}
