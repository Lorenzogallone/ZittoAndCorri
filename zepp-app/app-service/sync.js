// Servizio "single execution" svegliato dagli alarm giornalieri e dall'evento
// di sistema del sonno. Il sistema lo termina dopo 600 ms e non concede timer:
// qui niente BLE, niente zml, niente codice asincrono. Si raccoglie, si accoda
// e si esce; l'invio avviene quando si apre la pagina o il widget.
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

// Se il parametro dell'alarm non arriva, scegliamo l'orario programmato più vicino.
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

// L'evento del sonno scatta a ogni cambio di stato (anche quando ci si
// addormenta): teniamo solo il primo risveglio della mattina.
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
