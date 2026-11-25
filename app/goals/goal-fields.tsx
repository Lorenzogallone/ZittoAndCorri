"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { TextField } from "@/components/ui/text-field";
import { Label } from "@/components/ui/label";
import { generalGoalName, type GoalKind } from "@/lib/goals";
import { DECIMAL_PATTERN, DURATION_PATTERN, parseDecimal } from "@/lib/format";

// Without `key` the label is just "<km> km"; with `key` it comes from the messages.
const DISTANCE_PRESETS: { km: number; key?: "half" | "marathon" }[] = [
  { km: 5 },
  { km: 10 },
  { km: 21.0975, key: "half" },
  { km: 42.195, key: "marathon" },
];

const KIND_OPTIONS: GoalKind[] = ["race", "general"];

interface Props {
  defaultKind?: GoalKind;
  defaultName?: string;
  defaultDate?: string;
  defaultDistanceKm?: string;
  defaultTargetTime?: string;
}

/** Shared fields of the goal forms: race with date or generic goal. */
export function GoalFields({
  defaultKind = "race",
  defaultName = "",
  defaultDate = "",
  defaultDistanceKm = "",
  defaultTargetTime = "",
}: Props) {
  const t = useTranslations("goals.fields");
  const [kind, setKind] = useState<GoalKind>(defaultKind);
  const [distanceKm, setDistanceKm] = useState(defaultDistanceKm);
  const general = kind === "general";
  const distance = parseDecimal(distanceKm);
  const namePlaceholder = general
    ? Number.isFinite(distance) && distance > 0
      ? generalGoalName(Math.round(distance * 1000))
      : t("namePlaceholderGeneral")
    : t("namePlaceholderRace");

  return (
    <>
      <input type="hidden" name="goal_kind" value={kind} />
      <div className="grid gap-2.5">
        <Label>{t("kindLabel")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
              className={`pressable rounded-xl border px-3 py-2.5 text-left ${
                kind === option
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-white/[0.08] bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="block text-sm font-semibold">{t(`kinds.${option}.label`)}</span>
              <span className="mt-0.5 block text-micro leading-snug">{t(`kinds.${option}.hint`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="distance_km">{general ? t("distanceGeneral") : t("distanceRace")}</Label>
        <div className="grid grid-cols-2 gap-2 mb-1">
          {DISTANCE_PRESETS.map((p) => (
            <button
              key={p.km}
              type="button"
              className="pressable rounded-xl border border-white/[0.08] bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40"
              onClick={() => setDistanceKm(String(p.km))}
            >
              {p.key ? t(`presets.${p.key}`) : `${p.km} km`}
            </button>
          ))}
        </div>
        <Input
          id="distance_km"
          name="distance_km"
          type="text"
          inputMode="decimal"
          pattern={DECIMAL_PATTERN}
          enterKeyHint="next"
          autoComplete="off"
          placeholder="21.0975"
          value={distanceKm}
          onChange={(e) => setDistanceKm(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-2.5">
        <Label id="race_name-label" htmlFor="race_name">{general ? t("nameGeneral") : t("nameRace")}</Label>
        {/* Not an input: Safari suggested the contact card name. */}
        <TextField
          id="race_name"
          aria-labelledby="race_name-label"
          name="race_name"
          singleLine
          enterKeyHint="next"
          placeholder={namePlaceholder}
          defaultValue={defaultName}
        />
        {general && (
          <p className="text-xs text-muted-foreground">{t("nameOptional", { name: namePlaceholder })}</p>
        )}
      </div>

      {!general && (
        <div className="grid gap-2.5">
          <Label htmlFor="race_date">{t("raceDate")}</Label>
          <Input id="race_date" name="race_date" type="date" defaultValue={defaultDate} required />
        </div>
      )}

      <div className="grid gap-2.5">
        <Label htmlFor="target_time">{general ? t("targetGeneral") : t("targetRace")}</Label>
        <Input
          id="target_time"
          name="target_time"
          type="text"
          inputMode="decimal"
          pattern={DURATION_PATTERN}
          enterKeyHint="done"
          autoComplete="off"
          placeholder="1:45:00"
          defaultValue={defaultTargetTime}
        />
        <p className="text-xs text-muted-foreground">{t("targetHint")}</p>
      </div>
    </>
  );
}
