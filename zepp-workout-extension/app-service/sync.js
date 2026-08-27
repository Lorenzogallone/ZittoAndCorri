import { BasePage } from "@zeppos/zml/base-page"
import { exit } from "@zos/app-service"
import { schedulePlanSync } from "../shared/schedule"
import { pullPlan } from "../shared/sync"

function triggerFrom(param) {
  return String(param || "").includes("evening") ? "evening" : "morning"
}

AppService(
  BasePage({
    async onInit(param) {
      const trigger = triggerFrom(param)
      try {
        await pullPlan(this)
      } catch (error) {
        console.log("Workout plan background sync failed", String(error))
      } finally {
        schedulePlanSync(trigger)
        exit()
      }
    },
  }),
)
