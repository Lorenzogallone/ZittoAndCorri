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

export function schedulePlanSync(trigger) {
  const previous = getAlarmId(trigger)
  if (previous > 0) {
    try { cancel(previous) } catch {}
  }
  const hour = trigger === "morning" ? 6 : 18
  const id = set({ url: SERVICE_PATH, time: nextLocalOccurrence(hour), param: `trigger=${trigger}` })
  if (id > 0) setAlarmId(trigger, id)
  return id
}

export function schedulePlanSyncs() {
  schedulePlanSync("morning")
  schedulePlanSync("evening")
}
