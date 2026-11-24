"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-sheet";
import type { IntervalsConnectionView } from "@/lib/intervals/credentials";
import type { IntervalsTargetPreference } from "@/lib/intervals/workout-text";
import { IntegrationCard, IntegrationHelp } from "./integration-card";
import { deleteIntervalsKey, saveIntervalsKey, saveIntervalsOptions, syncIntervalsNow } from "./intervals-actions";

function formatDate(value: string | null, never: string): string {
  if (!value) return never;
  return new Date(value).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

const TARGETS: IntervalsTargetPreference[] = ["auto", "pace", "hr"];

export function IntervalsSection({
  initial,
}: {
  /** null = non collegato; undefined = database senza migrazione 0025. */
  initial: IntervalsConnectionView | null | undefined;
}) {
  const t = useTranslations("settingsLinks.intervals");
  const [connection, setConnection] = useState(initial ?? null);
  const [key, setKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { confirm, element: confirmSheet } = useConfirm();

  if (initial === undefined) {
    return (
      <IntegrationCard description={t("notMigrated.description")}>
        <p className="text-sm text-muted-foreground">{t("notMigrated.text")}</p>
      </IntegrationCard>
    );
  }

  const save = () => startTransition(async () => {
    setError(null);
    setMessage(null);
    const result = await saveIntervalsKey(key);
    if (result.error || !result.athlete) return setError(result.error ?? t("errors.keyNotSaved"));
    setConnection((current) => ({
      last_four: key.trim().slice(-4),
      athlete_id: result.athlete!.id,
      athlete_name: result.athlete!.name,
      import_activities: current?.import_activities ?? true,
      import_wellness: current?.import_wellness ?? true,
      publish_plan: current?.publish_plan ?? true,
      target_preference: current?.target_preference ?? "auto",
      last_import_at: current?.last_import_at ?? null,
      last_publish_at: current?.last_publish_at ?? null,
      last_error: null,
      verified_at: new Date().toISOString(),
    }));
    setKey("");
    setEditing(false);
    setMessage(t("keySaved"));
  });

  const remove = async () => {
    const confirmed = await confirm({
      title: t("confirmDisconnect.title"),
      description: t("confirmDisconnect.description"),
      action: t("confirmDisconnect.action"),
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteIntervalsKey();
      if (result.error) return setError(result.error);
      setConnection(null);
      setMessage(null);
    });
  };

  const setOption = (patch: Partial<Pick<IntervalsConnectionView, "import_activities" | "import_wellness" | "publish_plan" | "target_preference">>) => {
    if (!connection) return;
    const previous = connection;
    setConnection({ ...connection, ...patch });
    startTransition(async () => {
      const result = await saveIntervalsOptions(patch);
      if (result.error) {
        setConnection(previous);
        setError(result.error);
      }
    });
  };

  const sync = () => startTransition(async () => {
    setError(null);
    setMessage(null);
    const response = await syncIntervalsNow();
    if (response.error || !response.result) return setError(response.error ?? t("errors.syncNotCompleted"));
    const { import: imported, publish, error: syncError } = response.result;
    const parts: string[] = [];
    if (imported) {
      parts.push(t("sync.activitiesImported", { count: imported.activities.imported }));
      parts.push(t("sync.wellnessDays", { days: imported.wellness.days }));
    }
    if (publish) parts.push(t("sync.plan", { created: publish.created, updated: publish.updated, deleted: publish.deleted }));
    setMessage(parts.join(" · ") || t("sync.nothing"));
    const now = new Date().toISOString();
    setConnection((current) => current ? {
      ...current,
      last_import_at: imported && !imported.errors.length ? now : current.last_import_at,
      last_publish_at: publish && !publish.errors.length ? now : current.last_publish_at,
      last_error: syncError,
    } : current);
  });

  return (
    <IntegrationCard
      id="intervals-integration"
      description={t("description")}
    >
      <div className="space-y-4">
        {connection && !editing ? (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Check size={16} className="shrink-0 text-emerald-500" />
                <span className="truncate">{connection.athlete_name ?? connection.athlete_id} · ••••{connection.last_four}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(true)}>{t("replace")}</Button>
                <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={remove} title={t("disconnect")}><Trash2 size={15} /></Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm">{t("importActivities")}</p>
                <Switch checked={connection.import_activities} disabled={pending} onCheckedChange={(value) => setOption({ import_activities: value })} aria-label={t("importActivities")} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm">{t("importWellness")}</p>
                <Switch checked={connection.import_wellness} disabled={pending} onCheckedChange={(value) => setOption({ import_wellness: value })} aria-label={t("importWellnessAria")} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm">{t("publishPlan")}</p>
                <Switch checked={connection.publish_plan} disabled={pending} onCheckedChange={(value) => setOption({ publish_plan: value })} aria-label={t("publishPlan")} />
              </div>
              {connection.publish_plan && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t("targetLabel")}</p>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                    {TARGETS.map((target) => (
                      <button
                        key={target}
                        type="button"
                        disabled={pending}
                        onClick={() => setOption({ target_preference: target })}
                        className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${connection.target_preference === target ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                      >
                        {t(`targets.${target}`)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {t("targetHint")}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{t("lastImport", { date: formatDate(connection.last_import_at, t("never")) })}</p>
              <p>{t("lastPublish", { date: formatDate(connection.last_publish_at, t("never")) })}</p>
              {connection.last_error && <p className="text-destructive">{t("lastError", { error: connection.last_error })}</p>}
            </div>

            <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={sync}>
              <RefreshCw size={15} className={pending ? "animate-spin" : undefined} /> {pending ? t("syncing") : t("syncNow")}
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="intervals-key">{t("keyLabel")}</Label>
              <Input id="intervals-key" type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" value={key} onChange={(event) => setKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !pending && key.trim().length >= 8) save(); }} placeholder={t("keyPlaceholder")} />
            </div>
            <div className="flex gap-2">
              <Button type="button" className="flex-1" disabled={pending || key.trim().length < 8} onClick={save}>
                {pending ? t("verifying") : t("verifyAndSave")}
              </Button>
              {connection && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setKey(""); }}>{t("cancel")}</Button>}
            </div>
          </div>
        )}

        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

        <IntegrationHelp title={t("help.title")}>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>{t("help.step1")}</li>
            <li>{t("help.step2")}</li>
            <li>{t("help.step3")}</li>
            <li>{t("help.step4")}</li>
          </ol>
          <p className="mt-3">{t("help.note")}</p>
          <a href="https://intervals.icu/settings" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-medium text-primary">
            {t("help.open")} <ExternalLink size={12} />
          </a>
        </IntegrationHelp>
        {confirmSheet}
      </div>
    </IntegrationCard>
  );
}
