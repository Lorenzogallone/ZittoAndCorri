import {
  Battery,
  BloodOxygen,
  BodyTemperature,
  Calorie,
  HeartRate,
  Pai,
  Sleep,
  Stand,
  Step,
  Stress,
  Workout,
} from "@zos/sensor"
import { getDeviceInfo } from "@zos/device"
import { getSystemInfo } from "@zos/settings"
import { getProfile } from "@zos/user"

function safe(read, fallback = null) {
  try {
    const value = read()
    return value === undefined ? fallback : value
  } catch (error) {
    console.log("Zepp dataset unavailable", String(error))
    return fallback
  }
}

function pad(value) {
  return String(value).padStart(2, "0")
}

function localDate(now) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function normalizeTemperatureCurrent(value) {
  if (!value) return null
  return { value: value.current, time: value.time }
}

function normalizeSpo2Samples(values) {
  return (values || []).slice(-500).map((item) => ({ value: item.spo2, time: item.time }))
}

function limited(values, maximum) {
  return Array.isArray(values) ? values.slice(-maximum) : []
}

export function collectHealthPayload(trigger = "manual") {
  const now = new Date()
  const workout = safe(() => new Workout())
  const heartRate = safe(() => new HeartRate())
  const sleep = safe(() => new Sleep())
  const stress = safe(() => new Stress())
  const spo2 = safe(() => new BloodOxygen())
  const temperature = safe(() => new BodyTemperature())
  const pai = safe(() => new Pai())
  const steps = safe(() => new Step())
  const calories = safe(() => new Calorie())
  const stand = safe(() => new Stand())
  const battery = safe(() => new Battery())
  const device = safe(() => getDeviceInfo(), {})
  const system = safe(() => getSystemInfo(), {})
  const profile = safe(() => getProfile(), null)
  const workoutStatus = workout ? safe(() => workout.getStatus(), {}) : {}
  const hrSummary = heartRate ? safe(() => heartRate.getDailySummary(), {}) : {}

  return {
    schemaVersion: 1,
    clientSyncId: `zc:${now.getTime()}:${Math.floor(Math.random() * 1000000)}`,
    trigger,
    capturedAt: now.toISOString(),
    localDate: localDate(now),
    timezoneOffsetMinutes: -now.getTimezoneOffset(),
    device: {
      deviceName: device.deviceName ? String(device.deviceName) : "Active 3 Premium",
      deviceSource: device.deviceSource,
      osVersion: system.osVersion,
      firmwareVersion: system.firmwareVersion,
      apiLevel: system.minAPI,
      appVersion: "1.0.1",
      batteryPercent: battery ? safe(() => battery.getCurrent()) : null,
    },
    data: {
      workout: workout ? {
        trainingLoad: workoutStatus.trainingLoad,
        vo2Max: workoutStatus.vo2Max,
        fullRecoveryTime: workoutStatus.fullRecoveryTime,
        hrZones: safe(() => workout.getUserHrZoneSettings()),
        history: limited(safe(() => workout.getHistory(), []), 200),
      } : null,
      heartRate: heartRate ? {
        resting: safe(() => heartRate.getResting()),
        last: safe(() => heartRate.getLast()),
        maximum: hrSummary.maximum ? {
          value: hrSummary.maximum.hr_value,
          time: hrSummary.maximum.time,
        } : null,
        today: limited(safe(() => heartRate.getToday(), []), 1440),
      } : null,
      sleep: sleep ? {
        ...safe(() => sleep.getInfo(), {}),
        stages: limited(safe(() => sleep.getStage(), []), 200),
        naps: limited(safe(() => sleep.getNap(), []), 50),
      } : null,
      stress: stress ? {
        current: safe(() => stress.getCurrent()),
        todayByHour: limited(safe(() => stress.getTodayByHour(), []), 24),
        lastWeek: limited(safe(() => stress.getLastWeek(), []), 7),
        lastWeekByHour: limited(safe(() => stress.getLastWeekByHour(), []), 168),
      } : null,
      spo2: spo2 ? {
        current: safe(() => spo2.getCurrent()),
        lastDay: limited(safe(() => spo2.getLastDay(), []), 24),
        samples: normalizeSpo2Samples(safe(() => spo2.getLastFewHour(24), [])),
      } : null,
      bodyTemperature: temperature ? {
        current: normalizeTemperatureCurrent(safe(() => temperature.getCurrent())),
        today: limited(safe(() => temperature.getToday(), []), 288),
      } : null,
      pai: pai ? {
        total: safe(() => pai.getTotal()),
        today: safe(() => pai.getToday()),
        lastWeek: limited(safe(() => pai.getLastWeek(), []), 7),
      } : null,
      activity: {
        steps: steps ? safe(() => steps.getCurrent()) : null,
        stepTarget: steps ? safe(() => steps.getTarget()) : null,
        calories: calories ? safe(() => calories.getCurrent()) : null,
        calorieTarget: calories ? safe(() => calories.getTarget()) : null,
        standHours: stand ? safe(() => stand.getCurrent()) : null,
        standTarget: stand ? safe(() => stand.getTarget()) : null,
      },
      userProfile: profile ? {
        age: profile.age,
        heightCm: profile.height,
        weightKg: profile.weight,
        gender: profile.gender,
        nickName: profile.nickName,
        region: profile.region,
      } : null,
    },
  }
}
