import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PaceCheck } from "@/lib/metrics/pace-check";

export interface PaceSession {
  id: string;
  started_at: string;
  check: PaceCheck;
}

const STATUS = {
  on_target: { label: "In linea", tone: "bg-emerald-500" },
  fast: { label: "Più veloce", tone: "bg-sky-500" },
  slow: { label: "Più lento", tone: "bg-amber-500" },
} as const;

const PROMPT = {
  fast: "Nelle ultime sedute veloci sono sempre più veloce dei passi previsti: puoi aggiornare i passi del piano?",
  slow: "Nelle ultime sedute veloci faccio fatica a tenere i passi previsti: puoi rivederli?",
} as const;

function deviationText(seconds: number): string {
  if (seconds === 0) return "ok";
  return `${seconds > 0 ? "+" : "−"}${Math.abs(seconds)}″`;
}

/**
 * Le ultime sedute con passo target: se lo scarto si ripete nella stessa
 * direzione, suggerisce di chiedere al coach di aggiornare i passi.
 */
export function PaceHistory({ sessions }: { sessions: PaceSession[] }) {
  const ordered = [...sessions].reverse();
  const latest = sessions.slice(0, 3).map((session) => session.check.status);
  const trend = latest.length === 3 && latest.every((status) => status === latest[0]) && latest[0] !== "on_target"
    ? latest[0]
    : null;
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {ordered.map((session) => {
          const status = STATUS[session.check.status];
          return (
            <Link key={session.id} href={`/activities/${session.id}`} className="flex flex-col items-center gap-1.5 rounded-xl py-2 hover:bg-muted/40">
              <span className={cn("h-2.5 w-2.5 rounded-full", status.tone)} title={status.label} />
              <span className="text-sm font-semibold tabular-nums">{deviationText(session.check.avg_deviation_s)}</span>
              <span className="text-micro text-muted-foreground">
                {new Date(session.started_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-micro text-muted-foreground">
        Secondi al km rispetto al passo previsto: − più veloce, + più lento.
      </p>
      {trend && (
        <div className="mt-4 rounded-2xl bg-muted/50 px-4 py-3">
          <p className="text-sm">
            {trend === "fast"
              ? "Nelle ultime sedute sei sempre più veloce del previsto: forse è ora di aggiornare i passi."
              : "Nelle ultime sedute fatichi a tenere i passi previsti: meglio rivederli."}
          </p>
          <Link href={`/?prompt=${encodeURIComponent(PROMPT[trend])}`} className="mt-2 inline-block text-sm font-medium text-primary">
            Chiedi al coach →
          </Link>
        </div>
      )}
    </div>
  );
}
