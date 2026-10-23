import { LocalStorage } from "@zos/storage"

const storage = new LocalStorage("zitto-and-corri.json")
const QUEUE_KEY = "pending_syncs"
const MAX_PENDING = 14

export function getPendingSyncs() {
  const value = storage.getItem(QUEUE_KEY, [])
  return Array.isArray(value) ? value : []
}

export function enqueueSync(payload) {
  const withoutDuplicate = getPendingSyncs().filter(
    (item) => item.clientSyncId !== payload.clientSyncId,
  )
  storage.setItem(QUEUE_KEY, [...withoutDuplicate, payload].slice(-MAX_PENDING))
}

export function acknowledgeSync(clientSyncId) {
  storage.setItem(
    QUEUE_KEY,
    getPendingSyncs().filter((item) => item.clientSyncId !== clientSyncId),
  )
}

export function clearPendingSyncs() {
  storage.setItem(QUEUE_KEY, [])
}

export function setIntegrationEnabled(enabled) {
  storage.setItem("integration_enabled", enabled === true)
}

export function getIntegrationEnabled() {
  return storage.getItem("integration_enabled", false) === true
}

export function setLastResult(result) {
  storage.setItem("last_result", result)
}

export function getLastResult() {
  return storage.getItem("last_result", null)
}

export function getClientId() {
  let value = storage.getItem("client_id", "")
  if (!value) {
    value = `zepp-${Date.now()}-${Math.floor(Math.random() * 1000000000)}`
    storage.setItem("client_id", value)
  }
  return value
}

export function setAlarmId(trigger, id) {
  storage.setItem(`alarm_${trigger}`, id)
}

export function getAlarmId(trigger) {
  return storage.getItem(`alarm_${trigger}`, 0)
}

export function setAlarmHour(trigger, hour) {
  storage.setItem(`alarm_${trigger}_hour`, hour)
}

export function getAlarmHour(trigger) {
  return storage.getItem(`alarm_${trigger}_hour`, -1)
}

const DEFAULT_HOURS = { morning: 8, evening: 23 }

function validHour(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback
  const hour = Number(value)
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback
}

export function getScheduleHours() {
  return {
    morning: validHour(storage.getItem("schedule_morning_hour", DEFAULT_HOURS.morning), DEFAULT_HOURS.morning),
    evening: validHour(storage.getItem("schedule_evening_hour", DEFAULT_HOURS.evening), DEFAULT_HOURS.evening),
  }
}

export function setScheduleHours(hours) {
  const current = getScheduleHours()
  storage.setItem("schedule_morning_hour", validHour(hours?.morning, current.morning))
  storage.setItem("schedule_evening_hour", validHour(hours?.evening, current.evening))
}

export function setLastCapture(value) {
  storage.setItem("last_capture", value)
}

export function getLastCapture() {
  const value = storage.getItem("last_capture", null)
  return value && typeof value === "object" ? value : null
}

export function getPlan() {
  const value = storage.getItem("plan", null)
  return value && typeof value === "object" ? value : null
}

export function setPlan(value) {
  storage.setItem("plan", value)
}

export function getLastWakeCaptureDate() {
  return storage.getItem("last_wake_capture_date", "")
}

export function setLastWakeCaptureDate(value) {
  storage.setItem("last_wake_capture_date", value)
}
