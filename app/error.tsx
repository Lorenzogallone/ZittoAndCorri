"use client";

// Error boundary di root (App Router). Cattura gli errori di rendering delle
// pagine e mostra un fallback con retry invece di crashare l'intera app.
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("home.error");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle size={32} className="text-destructive" />
      <div>
        <p className="font-semibold">{t("title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("text")}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => reset()}>
        {t("retry")}
      </Button>
    </div>
  );
}
