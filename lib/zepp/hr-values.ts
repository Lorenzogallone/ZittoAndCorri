import type { Profile } from "@/lib/types";

export type HrValueSource = "zepp" | "user" | null;

export interface EffectiveHrConfig {
  max_hr: number | null;
  resting_hr: number | null;
  hr_zone_ranges: number[] | null;
  max_hr_source: HrValueSource;
  resting_hr_source: HrValueSource;
  zones_source: "zepp" | "derived" | null;
}

export interface ZeppHrMetric {
  resting_hr: number | null;
  hr_zone_rest: number | null;
  hr_zone_ranges: unknown;
}

function valid(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function validRanges(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ranges = value
    .map((item) => valid(item, 25, 240))
    .filter((item): item is number => item != null);
  if (ranges.length < 6) return null;
  for (let index = 1; index < ranges.length; index++) {
    if (ranges[index] <= ranges[index - 1]) return null;
  }
  return ranges;
}

export function resolveEffectiveHrConfig(
  manual: Pick<Profile, "max_hr" | "resting_hr"> | null,
  zeppMetrics: ZeppHrMetric[],
  zeppEnabled: boolean,
): EffectiveHrConfig {
  const manualMax = valid(manual?.max_hr, 25, 240);
  const manualRest = valid(manual?.resting_hr, 25, 220);
  if (!zeppEnabled) {
    return {
      max_hr: manualMax,
      resting_hr: manualRest,
      hr_zone_ranges: null,
      max_hr_source: manualMax == null ? null : "user",
      resting_hr_source: manualRest == null ? null : "user",
      zones_source: manualMax != null && manualRest != null ? "derived" : null,
    };
  }

  let ranges: number[] | null = null;
  let resting: number | null = null;
  for (const metric of zeppMetrics) {
    if (!ranges) ranges = validRanges(metric.hr_zone_ranges);
    if (resting == null) {
      resting = valid(metric.resting_hr, 25, 220) ?? valid(metric.hr_zone_rest, 25, 220);
    }
    if (ranges && resting != null) break;
  }
  const zeppMax = ranges ? ranges[ranges.length - 1] : null;

  return {
    max_hr: zeppMax ?? manualMax,
    resting_hr: resting ?? manualRest,
    hr_zone_ranges: ranges,
    max_hr_source: zeppMax != null ? "zepp" : manualMax == null ? null : "user",
    resting_hr_source: resting != null ? "zepp" : manualRest == null ? null : "user",
    zones_source: ranges ? "zepp" : (zeppMax ?? manualMax) != null && (resting ?? manualRest) != null
      ? "derived"
      : null,
  };
}
