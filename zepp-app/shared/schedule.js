import { cancel, set } from "@zos/alarm"
import { getAlarmId, setAlarmId } from "./storage"

const SERVICE_PATH = "app-service/sync"

function nextLocalOccurrence(hour) {
  const now = new Date()
  const next = new Date(now.getTime())
  next.setHours(hour, 0, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return Math.floor(next.getTime() / 1000)
}

export function scheduleSync(trigger) {
  const previous = getAlarmId(trigger)
  if (previous > 0) {
    try { cancel(previous) } catch {}
  }
  const hour = trigger === "morning" ? 8 : 23
  const alarmId = set({
    url: SERVICE_PATH,
    time: nextLocalOccurrence(hour),
    param: `trigger=${trigger}`,
  })
  if (alarmId > 0) setAlarmId(trigger, alarmId)
  return alarmId
}

export function scheduleDailySyncs() {
  scheduleSync("morning")
  scheduleSync("evening")
}

export function cancelDailySyncs() {
  for (const trigger of ["morning", "evening"]) {
    const alarmId = getAlarmId(trigger)
    if (alarmId > 0) {
      try { cancel(alarmId) } catch {}
      setAlarmId(trigger, 0)
    }
  }
}
