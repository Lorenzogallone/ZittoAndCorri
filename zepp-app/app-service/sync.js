// "Single execution" service woken by the daily alarms and by the system
// sleep event. The system kills it after 600 ms and grants no timers: no BLE,
// no zml, no async code here. It collects, enqueues and exits; the send
// happens when the page or the widget is opened.
import { exit } from "@zos/app-service"
import { collectHealthPayload } from "../shared/collect"
import {
  enqueueSync,
  getIntegrationEnabled,
  getLastWakeCaptureDate,
  getScheduleHours,
  setLastCapture,
  setLastWakeCaptureDate,
} from "../shared/storage"

const SLEEP_EVENT = "os.health.sleep_status"

function pad(value) {
  return String(value).padStart(2, "0")
}

function localDate(now) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function hourDistance(a, b) {
  const diff = Math.abs(a - b) % 24
  return Math.min(diff, 24 - diff)
}

// If the alarm parameter does not arrive, pick the nearest scheduled time.
function triggerFromClock(now) {
  const hours = getScheduleHours()
  const hour = now.getHours()
  return hourDistance(hour, hours.evening) < hourDistance(hour, hours.morning) ? "evening" : "morning"
}

function readTrigger(param, now) {
  const text = String(param || "")
  if (text.includes(SLEEP_EVENT)) return { trigger: "morning", wake: true }
  if (text.includes("trigger=evening")) return { trigger: "evening", wake: false }
  if (text.includes("trigger=morning")) return { trigger: "morning", wake: false }
  return { trigger: triggerFromClock(now), wake: false }
}

// The sleep event fires on every state change (also when falling asleep):
// keep only the first wake-up of the morning.
function shouldCaptureWake(now) {
  const hour = now.getHours()
  if (hour < 4 || hour >= 14) return false
  return getLastWakeCaptureDate() !== localDate(now)
}

AppService({
  onInit(param) {
    try {
      if (!getIntegrationEnabled()) return
      const now = new Date()
      const { trigger, wake } = readTrigger(param, now)
      if (wake) {
        if (!shouldCaptureWake(now)) return
        setLastWakeCaptureDate(localDate(now))
      }
      enqueueSync(collectHealthPayload(trigger))
      setLastCapture({ at: now.toISOString(), trigger, source: wake ? "wake" : "alarm" })
    } catch (error) {
      console.log("Zepp capture failed", String(error))
    } finally {
      exit()
    }
  },
})
