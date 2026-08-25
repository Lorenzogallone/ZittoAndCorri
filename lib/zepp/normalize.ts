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
  sleep_stages?: unknown[];
  naps?: unknown[];
  resting_hr?: number;
  max_hr?: number;
  hr_series?: number[];
  stress_avg?: number;
  stress_hourly?: number[];
  stress_last_week?: number[];
  spo2_avg?: number;
  spo2_min?: number;
  spo2_samples?: unknown[];
  skin_temp_avg_c?: number;
  skin_temp_min_c?: number;
  skin_temp_max_c?: number;
  skin_temp_samples?: number[];
  pai_total?: number;
  pai_today?: number;
  pai_last_week?: number[];
  steps?: number;
  calories?: number;
  stand_hours?: number;
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
  const heartRates = validList(data.heartRate?.today, 25, 240);
  const stressHourly = validList(data.stress?.todayByHour, 1, 100);
  const spo2Values = validList(data.spo2?.lastDay, 50, 100);
  const spo2Samples = (data.spo2?.samples ?? []).filter((sample) => valid(sample.value, 50, 100) != null);
  const allSpo2 = [...spo2Values, ...spo2Samples.map((sample) => sample.value)];
  const temperatures = validList(data.bodyTemperature?.today, 20, 45);
  const currentTemperature = valid(data.bodyTemperature?.current?.value, 20, 45);
  if (currentTemperature != null) temperatures.push(currentTemperature);

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
  if (data.sleep?.stages?.length) row.sleep_stages = data.sleep.stages;
  if (data.sleep?.naps?.length) row.naps = data.sleep.naps;
  assign("resting_hr", valid(data.heartRate?.resting, 25, 220));
  assign("max_hr", valid(data.heartRate?.maximum?.value, 25, 240));
  if (heartRates.length) row.hr_series = heartRates;
  assign("stress_avg", rounded(average(stressHourly)));
  if (stressHourly.length) row.stress_hourly = stressHourly;
  const stressWeek = validList(data.stress?.lastWeek, 1, 100);
  if (stressWeek.length) row.stress_last_week = stressWeek;
  assign("spo2_avg", rounded(average(allSpo2)));
  assign("spo2_min", allSpo2.length ? Math.min(...allSpo2) : undefined);
  if (spo2Samples.length) row.spo2_samples = spo2Samples;
  assign("skin_temp_avg_c", rounded(average(temperatures), 2));
  assign("skin_temp_min_c", temperatures.length ? Math.min(...temperatures) : undefined);
  assign("skin_temp_max_c", temperatures.length ? Math.max(...temperatures) : undefined);
  if (temperatures.length) row.skin_temp_samples = temperatures;
  assign("pai_total", valid(data.pai?.total, 0, 10_000));
  assign("pai_today", valid(data.pai?.today, 0, 10_000));
  const paiWeek = validList(data.pai?.lastWeek, 0, 10_000);
  if (paiWeek.length) row.pai_last_week = paiWeek;
  assign("steps", valid(data.activity?.steps, 0, 500_000));
  assign("calories", valid(data.activity?.calories, 0, 50_000));
  assign("stand_hours", valid(data.activity?.standHours, 0, 24));

  if (data.workout?.hrZones) {
    row.hr_zone_type = data.workout.hrZones.type;
    assign("hr_zone_rest", valid(data.workout.hrZones.rest, 25, 220));
    const ranges = validList(data.workout.hrZones.range, 25, 240);
    if (ranges.length >= 5) row.hr_zone_ranges = ranges;
  }

  const profile = data.userProfile;
  const deviceProfile: Record<string, unknown> = {};
  if (profile) {
    const age = valid(profile.age, 1, 120);
    const height = valid(profile.heightCm, 50, 260);
    const weight = valid(profile.weightKg, 20, 400);
    if (age != null) deviceProfile.age = age;
    if (height != null) deviceProfile.height_cm = height;
    if (weight != null) deviceProfile.weight_kg = weight;
    if (profile.gender != null) deviceProfile.gender = profile.gender;
    if (profile.region) deviceProfile.region = profile.region;
  }
  if (payload.device.batteryPercent != null) deviceProfile.battery_percent = payload.device.batteryPercent;
  if (Object.keys(deviceProfile).length) row.device_profile = deviceProfile;

  row.completeness = {
    workout: row.training_load != null || row.recovery_raw != null,
    sleep: row.sleep_score != null || row.sleep_total_min != null,
    heart_rate: row.resting_hr != null || heartRates.length > 0,
    stress: row.stress_avg != null,
    spo2: row.spo2_avg != null,
    temperature: row.skin_temp_avg_c != null,
    activity: row.steps != null || row.calories != null,
  };
  return row;
}
