import { z } from "zod";

const finite = z.number().finite();
const optionalNumber = finite.nullish();
const shortString = z.string().trim().max(120);

function finiteArray(maximum: number) {
  return z.array(z.unknown()).max(maximum).transform((values) =>
    values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
}

function validObjectArray<T extends z.ZodType>(schema: T, maximum: number) {
  return z.array(z.unknown()).max(maximum).transform((values): Array<z.output<T>> => {
    const result: Array<z.output<T>> = [];
    for (const value of values) {
      const parsed = schema.safeParse(value);
      if (parsed.success) result.push(parsed.data);
    }
    return result;
  });
}

const DeviceSchema = z.object({
  deviceName: shortString.nullish(),
  deviceSource: z.number().int().min(0).nullish(),
  osVersion: shortString.nullish(),
  firmwareVersion: shortString.nullish(),
  apiLevel: shortString.nullish(),
  appVersion: shortString.nullish(),
  batteryPercent: optionalNumber,
});

const HrZoneSchema = z.object({
  type: finite,
  rest: finite,
  range: finiteArray(8),
});

const WorkoutHistorySchema = z.object({
  startTime: finite,
  duration: finite,
});

const WorkoutSchema = z.object({
  trainingLoad: optionalNumber,
  vo2Max: optionalNumber,
  fullRecoveryTime: optionalNumber,
  hrZones: HrZoneSchema.nullish(),
  history: validObjectArray(WorkoutHistorySchema, 200).nullish(),
}).nullish();

const HeartRateSchema = z.object({
  resting: optionalNumber,
  last: optionalNumber,
  maximum: z.object({ value: finite, time: finite.nullish() }).nullish(),
  today: finiteArray(1_440).nullish(),
}).nullish();

const SleepStageSchema = z.object({
  model: finite,
  start: finite,
  stop: finite,
});

const NapSchema = z.object({
  length: finite,
  start: finite,
  stop: finite,
});

const SleepSchema = z.object({
  score: optionalNumber,
  deepTime: optionalNumber,
  startTime: optionalNumber,
  endTime: optionalNumber,
  totalTime: optionalNumber,
  stages: validObjectArray(SleepStageSchema, 200).nullish(),
  naps: validObjectArray(NapSchema, 50).nullish(),
}).nullish();

const StressHourSchema = z.object({ second: finite, stress: finite });

const StressSchema = z.object({
  current: z.object({ value: finite, time: finite.nullish() }).nullish(),
  todayByHour: finiteArray(24).nullish(),
  lastWeek: finiteArray(7).nullish(),
  lastWeekByHour: validObjectArray(StressHourSchema, 168).nullish(),
}).nullish();

const Spo2SampleSchema = z.object({ value: finite, time: finite });

const Spo2Schema = z.object({
  current: z.object({ value: finite, time: finite.nullish(), retCode: z.number().int().nullish() }).nullish(),
  lastDay: finiteArray(24).nullish(),
  samples: validObjectArray(Spo2SampleSchema, 500).nullish(),
}).nullish();

const BodyTemperatureSchema = z.object({
  current: z.object({ value: finite, time: finite.nullish() }).nullish(),
  today: finiteArray(288).nullish(),
}).nullish();

const PaiSchema = z.object({
  total: optionalNumber,
  today: optionalNumber,
  lastWeek: finiteArray(7).nullish(),
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
