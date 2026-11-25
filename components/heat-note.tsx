import { ThermometerSun } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HeatInfo } from "@/lib/weather";
import { HUMID_DEW_POINT_C, heatDeltaSeconds } from "@/lib/metrics/heat";

/** Forecast heat warning, with the slowdown already applied to the paces. */
export function HeatNote({ heat, referencePace }: { heat: HeatInfo; referencePace: number | null }) {
  const t = useTranslations("plan.heat");
  const delta = referencePace ? heatDeltaSeconds(referencePace, heat.pct) : null;
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      <ThermometerSun size={18} className="mt-0.5 shrink-0" />
      <span>
        {t("forecast", { temp: heat.temp_c, humid: String(heat.dew_point_c >= HUMID_DEW_POINT_C), hour: heat.hour })}{" "}
        {delta ? t("slowed", { delta }) : t("generic")}
      </span>
    </p>
  );
}
