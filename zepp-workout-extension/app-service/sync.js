// Servizio "single execution" svegliato dagli alarm delle 06:00 e delle 18:00.
// Il sistema lo termina dopo 600 ms e non concede timer: non può fare il giro
// Bluetooth → telefono → server. Registra solo l'ora dell'alarm ed esce; il
// piano si aggiorna in onResume della pagina Coach e da "Aggiorna piano ora".
import { exit } from "@zos/app-service"
import { setLastAlarm } from "../shared/storage"

function triggerFrom(param) {
  const text = String(param || "")
  if (text.includes("trigger=evening")) return "evening"
  if (text.includes("trigger=morning")) return "morning"
  return new Date().getHours() >= 12 ? "evening" : "morning"
}

AppService({
  onInit(param) {
    try {
      setLastAlarm({ at: new Date().toISOString(), trigger: triggerFrom(param) })
    } catch (error) {
      console.log("Workout alarm record failed", String(error))
    } finally {
      exit()
    }
  },
})
