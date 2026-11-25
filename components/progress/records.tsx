import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { intlLocale, type Locale } from "@/i18n/config";
import { formatDuration } from "@/lib/format";
import { effortLabel, type PersonalRecord } from "@/lib/metrics/best-efforts";

/** Personal records by distance, with a link to the run that holds them. */
export function Records({ records }: { records: PersonalRecord[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("metrics");
  return (
    <ul className="divide-y divide-border/60">
      {records.map((record) => (
        <li key={record.key}>
          <Link href={`/activities/${record.activity_id}`} className="flex items-center gap-3 py-2.5">
            <span className="w-20 text-sm text-muted-foreground">{effortLabel(record.key, t)}</span>
            <span className="flex-1 text-base font-semibold tabular-nums">{formatDuration(record.time_s)}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(record.date).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", year: "2-digit" })}
            </span>
            <ChevronRight size={15} className="text-muted-foreground/60" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
