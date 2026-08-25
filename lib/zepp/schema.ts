import { z } from "zod";

const finite = z.number().finite();
const positiveOrZero = finite.min(0);
const optionalNumber = finite.nullish();
const shortString = z.string().trim().max(120);

const DeviceSchema = z.object({
  deviceName: shortString.nullish(),
  deviceSource: z.number().int().min(0).nullish(),
  osVersion: shortString.nullish(),
  firmwareVersion: shortString.nullish(),
  apiLevel: shortString.nullish(),
  appVersion: shortString.nullish(),
  batteryPercent: z.number().int().min(0).max(100).nullish(),
});

const WorkoutSchema = z.object({
  trainingLoad: optionalNumber,
  vo2Max: optionalNumber,
  fullRecoveryTime: optionalNumber,
  hrZones: z.object({
    type: z.number().int().min(0).max(1),
    rest: z.number().int(),
    range: z.array(finite).max(8),
  }).nullish(),
  history: z.array(z.object({
    startTime: finite,
    duration: positiveOrZero,
  })).max(200).nullish(),
}).nullish();

const HeartRateSchema = z.object({
  resting: optionalNumber,
  last: optionalNumber,
  maximum: z.object({ value: finite, time: finite.nullish() }).nullish(),
  today: z.array(finite).max(1_440).nullish(),
}).nullish();

const SleepSchema = z.object({
  score: optionalNumber,
  deepTime: optionalNumber,
  startTime: optionalNumber,
  endTime: optionalNumber,
  totalTime: optionalNumber,
  stages: z.array(z.object({
    model: z.number().int(),
    start: finite,
    stop: finite,
  })).max(200).nullish(),
  naps: z.array(z.object({
    length: positiveOrZero,
    start: finite,
    stop: finite,
  })).max(50).nullish(),
}).nullish();

const StressSchema = z.object({
  current: z.object({ value: finite, time: finite.nullish() }).nullish(),
  todayByHour: z.array(finite).max(24).nullish(),
  lastWeek: z.array(finite).max(7).nullish(),
  lastWeekByHour: z.array(z.object({ second: finite, stress: finite })).max(168).nullish(),
}).nullish();

const Spo2Schema = z.object({
  current: z.object({ value: finite, time: finite.nullish(), retCode: z.number().int().nullish() }).nullish(),
  lastDay: z.array(finite).max(24).nullish(),
  samples: z.array(z.object({ value: finite, time: finite })).max(500).nullish(),
}).nullish();

const BodyTemperatureSchema = z.object({
  current: z.object({ value: finite, time: finite.nullish() }).nullish(),
  today: z.array(finite).max(288).nullish(),
}).nullish();

const PaiSchema = z.object({
  total: optionalNumber,
  today: optionalNumber,
  lastWeek: z.array(finite).max(7).nullish(),
}).nullish();

const ActivitySummarySchema = z.object({
  steps: optionalNumber,
  stepTarget: optionalNumber,
  calories: optionalNumber,
  calorieTarget: optionalNumber,
  standHours: optionalNumber,
  standTarget: optionalNumber,
}).nullish();

const UserProfileSchema = z.object({
  age: optionalNumber,
  heightCm: optionalNumber,
  weightKg: optionalNumber,
  gender: optionalNumber,
  nickName: z.string().trim().max(100).nullish(),
  region: z.string().trim().max(20).nullish(),
}).nullish();

export const ZeppSyncPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  clientSyncId: z.string().trim().min(4).max(120).regex(/^[a-zA-Z0-9._:-]+$/),
  trigger: z.enum(["morning", "evening", "manual", "retry"]),
  capturedAt: z.iso.datetime({ offset: true }),
  localDate: z.iso.date(),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840),
  device: DeviceSchema,
  data: z.object({
    workout: WorkoutSchema,
    heartRate: HeartRateSchema,
    sleep: SleepSchema,
    stress: StressSchema,
    spo2: Spo2Schema,
    bodyTemperature: BodyTemperatureSchema,
    pai: PaiSchema,
    activity: ActivitySummarySchema,
    userProfile: UserProfileSchema,
  }),
});

export const ZeppSyncBatchSchema = z.union([
  ZeppSyncPayloadSchema,
  z.array(ZeppSyncPayloadSchema).min(1).max(14),
]);

export const ZeppPairRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  clientId: z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9._:-]+$/),
  device: DeviceSchema,
});

export type ZeppSyncPayload = z.infer<typeof ZeppSyncPayloadSchema>;
export type ZeppPairRequest = z.infer<typeof ZeppPairRequestSchema>;
