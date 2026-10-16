import { ThermometerSun } from "lucide-react";
import type { HeatInfo } from "@/lib/weather";
import { HUMID_DEW_POINT_C, heatDeltaSeconds } from "@/lib/metrics/heat";

/** Avviso di caldo previsto, con il rallentamento già applicato ai passi. */
export function HeatNote({ heat, referencePace }: { heat: HeatInfo; referencePace: number | null }) {
  const delta = referencePace ? heatDeltaSeconds(referencePace, heat.pct) : null;
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      <ThermometerSun size={18} className="mt-0.5 shrink-0" />
      <span>
        {heat.temp_c}°{heat.dew_point_c >= HUMID_DEW_POINT_C ? " e umido" : ""} previsti alle {heat.hour}.{" "}
        {delta
          ? <>Passi già rallentati di circa {delta}″/km: corri a sensazione e bevi.</>
          : <>Rallenta un po&apos; e bevi più del solito.</>}
      </span>
    </p>
  );
}
