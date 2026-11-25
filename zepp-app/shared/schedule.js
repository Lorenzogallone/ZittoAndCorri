import { cancel, getAllAlarms, set, REPEAT_DAY } from "@zos/alarm"
import {
  getAlarmHour,
  getAlarmId,
  getScheduleHours,
  setAlarmHour,
  setAlarmId,
} from "./storage"

const SERVICE_PATH = "app-service/sync"
const TRIGGERS = ["morning", "evening"]

function nextLocalOccurrence(hour) {
  const now = new Date()
  const next = new Date(now.getTime())
  next.setHours(hour, 0, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return Math.floor(next.getTime() / 1000)
}

// List of this Mini App's alarms; null if the API does not respond.
function existingAlarms() {
  try {
    const ids = getAllAlarms()
    return Array.isArray(ids) ? ids : null
  } catch {
    return null
  }
}

function safeCancel(id) {
  if (!(id > 0)) return
  try { cancel(id) } catch {}
}

function ensureAlarm(trigger, hour, existing) {
  const previous = getAlarmId(trigger)
  // Alarm already present, persistent and at the right hour: leave it alone.
  if (previous > 0 && existing?.includes(previous) && getAlarmHour(trigger) === hour) return previous
  safeCancel(previous)
  const alarmId = set({
    url: SERVICE_PATH,
    time: nextLocalOccurrence(hour),
    repeat_type: REPEAT_DAY,
    store: true,
    param: `trigger=${trigger}`,
  })
  setAlarmId(trigger, alarmId > 0 ? alarmId : 0)
  setAlarmHour(trigger, alarmId > 0 ? hour : -1)
  return alarmId
}

export function scheduleDailySyncs() {
  const hours = getScheduleHours()
  const existing = existingAlarms()
  const kept = TRIGGERS.map((trigger) => ensureAlarm(trigger, hours[trigger], existing))
  // The only alarms of this app are the two daily ones: everything else
  // (old one-shot alarms, duplicates) gets cancelled.
  for (const id of existing || []) {
    if (!kept.includes(id)) safeCancel(id)
  }
}

export function cancelDailySyncs() {
  for (const trigger of TRIGGERS) {
    safeCancel(getAlarmId(trigger))
    setAlarmId(trigger, 0)
    setAlarmHour(trigger, -1)
  }
  for (const id of existingAlarms() || []) safeCancel(id)
}
