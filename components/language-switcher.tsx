"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { LOCALES, isLocale, type Locale } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

// Nomi nella propria lingua: chi non capisce la lingua attuale deve poter
// trovare la sua. Non si traducono.
const NAMES: Record<Locale, string> = { it: "Italiano", en: "English" };

/** Selettore della lingua dell'app: salva il cookie e rinfresca la pagina. */
export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2" aria-busy={pending}>
      <Label id="language-label">{t("language")}</Label>
      <Segmented<Locale>
        ariaLabel={t("language")}
        value={isLocale(locale) ? locale : "it"}
        onChange={(next) =>
          startTransition(async () => {
            await setLocale(next);
            router.refresh();
          })
        }
        options={LOCALES.map((key) => ({ key, label: NAMES[key] }))}
      />
    </div>
  );
}
