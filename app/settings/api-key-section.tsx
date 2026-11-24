"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-sheet";
import { Eye, EyeOff, Copy, Check, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { regenerateApiKey } from "./actions";
import { IntegrationCard, IntegrationHelp } from "./integration-card";

interface ApiKeySectionProps {
  initialApiKey: string | null;
}

export function ApiKeySection({ initialApiKey }: ApiKeySectionProps) {
  const t = useTranslations("settings.apiKey");
  const [apiKey, setApiKey] = useState<string | null>(initialApiKey);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, element: confirmSheet } = useConfirm();
  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy API key:", err);
    }
  };

  const handleRegenerate = async () => {
    // Conferma solo se esiste già una chiave: generare la prima non rompe nulla.
    if (
      apiKey &&
      !(await confirm({
        title: t("confirmRegenerate.title"),
        description: t("confirmRegenerate.description"),
        action: t("confirmRegenerate.action"),
      }))
    )
      return;

    setLoading(true);
    setError(null);
    try {
      const res = await regenerateApiKey();
      if (res.error) {
        setError(t("errorRegenerate", { error: res.error }));
      } else if (res.key) {
        setApiKey(res.key);
      }
    } catch {
      setError(t("errorUnexpected"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <IntegrationCard
      id="external-import-integration"
      description={t("description")}
    >
    <div className="flex flex-col gap-4">
      <div className="grid gap-2.5">
        <Label htmlFor="api_key">{t("label")}</Label>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Input
              id="api_key"
              type={showKey ? "text" : "password"}
              readOnly
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={apiKey ?? t("empty")}
              className="pr-10 font-mono text-xs text-muted-foreground bg-muted/20"
            />
            {apiKey && (
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                title={showKey ? t("hide") : t("show")}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </div>
          {apiKey && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopy}
              title={t("copy")}
            >
              {copied ? (
                <Check size={16} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy size={16} />
              )}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">{error}</p>
        </div>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={handleRegenerate}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {apiKey ? t("regenerate") : t("generate")}
        </Button>
      </div>
      <IntegrationHelp title={t("help.title")}>
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>{t("help.step1")}</li>
          <li>{t.rich("help.step2", { code: (chunks) => <code className="rounded bg-muted px-1 py-0.5 text-foreground">{chunks}</code> })}</li>
          <li>{t("help.step3")}</li>
        </ol>
        <div className="mt-3 space-y-1.5 rounded-lg bg-background/60 p-3 font-mono text-xs text-foreground">
          <p>POST /api/import <span className="font-sans text-muted-foreground">{t("help.endpointJson")}</span></p>
          <p>POST /api/import/gpx <span className="font-sans text-muted-foreground">{t("help.endpointGpx")}</span></p>
          <p>POST /api/import/file <span className="font-sans text-muted-foreground">{t("help.endpointFile")}</span></p>
        </div>
        <p className="mt-3">{t("help.regenerateNote")}</p>
      </IntegrationHelp>
      {confirmSheet}
    </div>
    </IntegrationCard>
  );
}
