import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";
import {
  resolveEffectiveHrConfig,
  type EffectiveHrConfig,
  type ZeppHrMetric,
} from "@/lib/zepp/hr-values";

export type { EffectiveHrConfig, HrValueSource } from "@/lib/zepp/hr-values";

export async function getEffectiveHrConfig(
  supabase: SupabaseClient,
  userId: string,
  manual: Pick<Profile, "max_hr" | "resting_hr"> | null,
): Promise<EffectiveHrConfig> {
  const { data: connection } = await supabase
    .from("zepp_connections")
    .select("enabled")
    .eq("user_id", userId)
    .eq("client_kind", "health")
    .maybeSingle<{ enabled: boolean }>();
  if (!connection?.enabled) return resolveEffectiveHrConfig(manual, [], false);

  const { data: metrics } = await supabase
    .from("zepp_daily_metrics")
    .select("resting_hr, hr_zone_rest, hr_zone_ranges")
    .eq("user_id", userId)
    .order("captured_at", { ascending: false })
    .limit(42)
    .returns<ZeppHrMetric[]>();

  return resolveEffectiveHrConfig(manual, metrics ?? [], true);
}
