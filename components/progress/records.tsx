import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { PersonalRecord } from "@/lib/metrics/best-efforts";

/** Record personali per distanza, con link alla corsa che li detiene. */
export function Records({ records }: { records: PersonalRecord[] }) {
  return (
    <ul className="divide-y divide-border/60">
      {records.map((record) => (
        <li key={record.key}>
          <Link href={`/activities/${record.activity_id}`} className="flex items-center gap-3 py-2.5">
            <span className="w-20 text-sm text-muted-foreground">{record.label}</span>
            <span className="flex-1 text-base font-semibold tabular-nums">{formatDuration(record.time_s)}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(record.date).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" })}
            </span>
            <ChevronRight size={15} className="text-muted-foreground/60" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
