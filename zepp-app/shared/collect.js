import {
  BloodOxygen,
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

function heightInCentimeters(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value > 0 && value < 3 ? value * 100 : value
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
  const pai = safe(() => new Pai())
  const steps = safe(() => new Step())
  const calories = safe(() => new Calorie())
  const stand = safe(() => new Stand())
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
      appVersion: "1.0.4",
    },
    data: {
      workout: workout ? {
        trainingLoad: workoutStatus.trainingLoad,
        vo2Max: workoutStatus.vo2Max,
        fullRecoveryTime: workoutStatus.fullRecoveryTime,
        hrZones: safe(() => workout.getUserHrZoneSettings()),
      } : null,
      heartRate: heartRate ? {
        resting: safe(() => heartRate.getResting()),
        last: safe(() => heartRate.getLast()),
        maximum: hrSummary.maximum ? {
          value: hrSummary.maximum.hr_value,
          time: hrSummary.maximum.time,
        } : null,
      } : null,
      sleep: sleep ? {
        ...safe(() => sleep.getInfo(), {}),
        naps: limited(safe(() => sleep.getNap(), []), 50),
      } : null,
      stress: stress ? {
        current: safe(() => stress.getCurrent()),
        todayByHour: limited(safe(() => stress.getTodayByHour(), []), 24),
        lastWeek: limited(safe(() => stress.getLastWeek(), []), 7),
      } : null,
      spo2: spo2 ? {
        current: safe(() => spo2.getCurrent()),
        lastDay: limited(safe(() => spo2.getLastDay(), []), 24),
      } : null,
      pai: pai ? {
        total: safe(() => pai.getTotal()),
        today: safe(() => pai.getToday()),
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
        heightCm: heightInCentimeters(profile.height),
        weightKg: profile.weight,
        gender: profile.gender,
      } : null,
    },
  }
}
