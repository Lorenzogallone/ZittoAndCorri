import { cancel, getAllAlarms, set, REPEAT_DAY } from "@zos/alarm"
import { getAlarmHour, getAlarmId, setAlarmHour, setAlarmId } from "./storage"

const SERVICE_PATH = "app-service/sync"
const HOURS = { morning: 6, evening: 18 }

function nextLocalOccurrence(hour) {
  const now = new Date()
  const next = new Date(now.getTime())
  next.setHours(hour, 0, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return Math.floor(next.getTime() / 1000)
}

// Elenco degli alarm di questa app; null se l'API non risponde.
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

function ensureAlarm(trigger, existing) {
  const hour = HOURS[trigger]
  const previous = getAlarmId(trigger)
  // Alarm già presente, persistente e all'ora giusta: non lo tocchiamo.
  if (previous > 0 && existing?.includes(previous) && getAlarmHour(trigger) === hour) return previous
  safeCancel(previous)
  const id = set({
    url: SERVICE_PATH,
    time: nextLocalOccurrence(hour),
    repeat_type: REPEAT_DAY,
    store: true,
    param: `trigger=${trigger}`,
  })
  setAlarmId(trigger, id > 0 ? id : 0)
  setAlarmHour(trigger, id > 0 ? hour : -1)
  return id
}

export function schedulePlanSyncs() {
  const existing = existingAlarms()
  const kept = Object.keys(HOURS).map((trigger) => ensureAlarm(trigger, existing))
  // Gli unici alarm di questa app sono i due giornalieri: il resto va cancellato.
  for (const id of existing || []) {
    if (!kept.includes(id)) safeCancel(id)
  }
}
