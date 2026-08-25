import type { ZeppSyncPayload } from "@/lib/zepp/schema";

export interface ZeppDailyMetricWrite {
  user_id: string;
  connection_id: string;
  date: string;
  captured_at: string;
  training_load?: number;
  vo2_max?: number;
  recovery_raw?: number;
  sleep_score?: number;
  sleep_total_min?: number;
  sleep_deep_min?: number;
  sleep_start_min?: number;
  sleep_end_min?: number;
  nap_total_min?: number;
  nap_count?: number;
  resting_hr?: number;
  max_hr?: number;
  stress_avg?: number;
  stress_last_week?: number[];
  spo2_avg?: number;
  spo2_min?: number;
  pai_total?: number;
  pai_today?: number;
  steps?: number;
  step_target?: number;
  calories?: number;
  calorie_target?: number;
  stand_hours?: number;
  stand_target?: number;
  hr_zone_type?: number;
  hr_zone_rest?: number;
  hr_zone_ranges?: number[];
  device_profile?: Record<string, unknown>;
  completeness: Record<string, boolean>;
  updated_at: string;
}

function valid(value: number | null | undefined, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;
}

function validList(values: number[] | null | undefined, min: number, max: number): number[] {
  return (values ?? []).filter((value) => valid(value, min, max) != null);
}

function average(values: number[]): number | undefined {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function rounded(value: number | undefined, decimals = 1): number | undefined {
  if (value == null) return undefined;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

export function normalizeZeppPayload(
  payload: ZeppSyncPayload,
  userId: string,
  connectionId: string,
): ZeppDailyMetricWrite {
  const { data } = payload;
  const stressHourly = validList(data.stress?.todayByHour, 1, 100);
  const spo2Values = validList(data.spo2?.lastDay, 50, 100);
  const currentSpo2 = valid(data.spo2?.current?.value, 50, 100);
  if (currentSpo2 != null) spo2Values.push(currentSpo2);
  const naps = (data.sleep?.naps ?? [])
    .map((nap) => valid(nap.length, 0, 1_440))
    .filter((length): length is number => length != null);

  const row: ZeppDailyMetricWrite = {
    user_id: userId,
    connection_id: connectionId,
    date: payload.localDate,
    captured_at: payload.capturedAt,
    completeness: {},
    updated_at: new Date().toISOString(),
  };

  const assign = <K extends keyof ZeppDailyMetricWrite>(key: K, value: ZeppDailyMetricWrite[K] | undefined) => {
    if (value !== undefined) row[key] = value;
  };

  assign("training_load", valid(data.workout?.trainingLoad, 0, 100_000));
  assign("vo2_max", valid(data.workout?.vo2Max, 10, 100));
  assign("recovery_raw", valid(data.workout?.fullRecoveryTime, 0, 10_000));
  assign("sleep_score", valid(data.sleep?.score, 0, 100));
  assign("sleep_total_min", valid(data.sleep?.totalTime, 0, 1_440));
  assign("sleep_deep_min", valid(data.sleep?.deepTime, 0, 1_440));
  assign("sleep_start_min", valid(data.sleep?.startTime, 0, 1_439));
  assign("sleep_end_min", valid(data.sleep?.endTime, 0, 1_439));
  if (naps.length) {
    row.nap_total_min = Math.round(naps.reduce((sum, length) => sum + length, 0));
    row.nap_count = naps.length;
  }
  assign("resting_hr", valid(data.heartRate?.resting, 25, 220));
  assign("max_hr", valid(data.heartRate?.maximum?.value, 25, 240));
  assign("stress_avg", rounded(average(stressHourly)));
  const stressWeek = validList(data.stress?.lastWeek, 1, 100);
  if (stressWeek.length) row.stress_last_week = stressWeek;
  assign("spo2_avg", rounded(average(spo2Values)));
  assign("spo2_min", spo2Values.length ? Math.min(...spo2Values) : undefined);
  assign("pai_total", valid(data.pai?.total, 0, 10_000));
  assign("pai_today", valid(data.pai?.today, 0, 10_000));
  assign("steps", valid(data.activity?.steps, 0, 500_000));
  assign("step_target", valid(data.activity?.stepTarget, 0, 500_000));
  assign("calories", valid(data.activity?.calories, 0, 50_000));
  assign("calorie_target", valid(data.activity?.calorieTarget, 0, 50_000));
  assign("stand_hours", valid(data.activity?.standHours, 0, 24));
  assign("stand_target", valid(data.activity?.standTarget, 0, 24));

  if (data.workout?.hrZones) {
    assign("hr_zone_type", valid(data.workout.hrZones.type, 0, 1));
    assign("hr_zone_rest", valid(data.workout.hrZones.rest, 25, 220));
    const ranges = validList(data.workout.hrZones.range, 25, 240);
    if (ranges.length >= 6) row.hr_zone_ranges = ranges;
  }

  const profile = data.userProfile;
  const deviceProfile: Record<string, unknown> = {};
  if (profile) {
    const age = valid(profile.age, 1, 120);
    const rawHeight = profile.heightCm != null && profile.heightCm > 0 && profile.heightCm < 3
      ? profile.heightCm * 100
      : profile.heightCm;
    const height = valid(rawHeight, 50, 260);
    const weight = valid(profile.weightKg, 20, 400);
    if (age != null) deviceProfile.age = age;
    if (height != null) deviceProfile.height_cm = height;
    if (weight != null) deviceProfile.weight_kg = weight;
    if (profile.gender != null) deviceProfile.gender = profile.gender;
  }
  if (Object.keys(deviceProfile).length) row.device_profile = deviceProfile;

  row.completeness = {
    workout: row.training_load != null || row.recovery_raw != null,
    sleep: row.sleep_score != null || row.sleep_total_min != null,
    heart_rate: row.resting_hr != null || row.max_hr != null || row.hr_zone_ranges != null,
    stress: row.stress_avg != null,
    spo2: row.spo2_avg != null,
    activity: row.steps != null || row.calories != null,
  };
  return row;
}

/**
 * Copia di audit deliberatamente compatta: contiene solo dati utili a diagnosi,
 * riepiloghi e ricalcolo. Esclude serie minuto-per-minuto, temperatura e PII.
 */
export function compactZeppPayloadForAudit(payload: ZeppSyncPayload): Record<string, unknown> {
  const normalized = normalizeZeppPayload(payload, "audit", "audit");
  const metrics: Record<string, unknown> = { ...normalized };
  delete metrics.user_id;
  delete metrics.connection_id;
  delete metrics.updated_at;
  return {
    schemaVersion: payload.schemaVersion,
    clientSyncId: payload.clientSyncId,
    trigger: payload.trigger,
    capturedAt: payload.capturedAt,
    localDate: payload.localDate,
    timezoneOffsetMinutes: payload.timezoneOffsetMinutes,
    device: {
      deviceName: payload.device.deviceName ?? null,
      deviceSource: payload.device.deviceSource ?? null,
      osVersion: payload.device.osVersion ?? null,
      firmwareVersion: payload.device.firmwareVersion ?? null,
      apiLevel: payload.device.apiLevel ?? null,
      appVersion: payload.device.appVersion ?? null,
    },
    metrics,
  };
}
