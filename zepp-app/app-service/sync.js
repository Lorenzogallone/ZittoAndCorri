import { BasePage } from "@zeppos/zml/base-page"
import { exit } from "@zos/app-service"
import { collectAndSync } from "../shared/sync"
import { cancelDailySyncs, scheduleSync } from "../shared/schedule"
import { getIntegrationEnabled } from "../shared/storage"

function readTrigger(param) {
  return String(param || "").includes("evening") ? "evening" : "morning"
}

AppService(
  BasePage({
    async onInit(param) {
      const trigger = readTrigger(param)
      if (!getIntegrationEnabled()) {
        exit()
        return
      }
      try {
        await collectAndSync(this, trigger)
      } catch (error) {
        console.log("Scheduled Zepp sync queued", String(error))
      } finally {
        if (getIntegrationEnabled()) scheduleSync(trigger)
        else cancelDailySyncs()
        exit()
      }
    },
  }),
)
