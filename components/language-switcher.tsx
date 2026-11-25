"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { LOCALES, isLocale, type Locale } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

// Names in their own language: whoever does not understand the current language must be able to
// find theirs. They are not translated.
const NAMES: Record<Locale, string> = { it: "Italiano", en: "English" };

/** App language selector: saves the cookie and refreshes the page. */
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
