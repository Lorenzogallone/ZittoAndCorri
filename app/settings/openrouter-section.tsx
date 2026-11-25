"use client";

import { useState } from "react";
import { Check, ExternalLink, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-sheet";
import { deleteOpenRouterKey, saveOpenRouterKey } from "./actions";
import { IntegrationCard, IntegrationHelp } from "./integration-card";

export function OpenRouterSection({
  initial,
}: {
  /** null = chiave assente; undefined = database da aggiornare. */
  initial: { lastFour: string } | null | undefined;
}) {
  const t = useTranslations("settings.openrouter");
  const [configured, setConfigured] = useState(initial ?? null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, element: confirmSheet } = useConfirm();

  if (initial === undefined) {
    return (
      <IntegrationCard description={t("descriptionShort")}>
        <p className="text-sm text-muted-foreground">{t("migrationNeeded")}</p>
      </IntegrationCard>
    );
  }

  async function saveKey() {
    setPending(true);
    setError(null);
    const result = await saveOpenRouterKey(key);
    if (result.error) setError(result.error);
    else {
      setConfigured({ lastFour: key.trim().slice(-4) });
      setKey("");
      setEditing(false);
      setJustSaved(true);
    }
    setPending(false);
  }

  async function remove() {
    const confirmed = await confirm({
      title: t("confirmRemove.title"),
      description: t("confirmRemove.description"),
      action: t("confirmRemove.action"),
    });
    if (!confirmed) return;
    setPending(true);
    const result = await deleteOpenRouterKey();
    if (result.error) setError(result.error);
    else setConfigured(null);
    setPending(false);
  }

  return (
    <IntegrationCard id="openrouter-integration" description={t("descriptionFull")}>
      <div className="space-y-4">
        {configured && !editing ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Check size={16} className="text-emerald-500" />
              <span>{t("configured", { lastFour: configured.lastFour })}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(true)}>{t("replace")}</Button>
              <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={remove} title={t("removeTitle")}><Trash2 size={15} /></Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="openrouter-key">{t("keyLabel")}</Label>
              <Input id="openrouter-key" type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" value={key} onChange={(event) => setKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !pending && key.trim().length >= 16) void saveKey(); }} placeholder="sk-or-…" />
            </div>
            <div className="flex gap-2">
              <Button type="button" className="flex-1" disabled={pending || key.trim().length < 16} onClick={saveKey}>
                {pending ? t("verifying") : t("verifySave")}
              </Button>
              {configured && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setKey(""); }}>{t("cancel")}</Button>}
            </div>
          </div>
        )}

        {justSaved && <p className="text-sm text-emerald-600">{t("justSaved")}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <IntegrationHelp title={t("help.title")}>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>{t("help.step1")}</li>
            <li>{t("help.step2")}</li>
            <li>{t("help.step3")}</li>
          </ol>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-medium text-primary">
            {t("help.open")} <ExternalLink size={12} />
          </a>
        </IntegrationHelp>
        {confirmSheet}
      </div>
    </IntegrationCard>
  );
}
