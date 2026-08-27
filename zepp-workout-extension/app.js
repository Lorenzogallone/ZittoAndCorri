import { BaseApp } from "@zeppos/zml/base-app"
import { schedulePlanSyncs } from "./shared/schedule"

App(
  BaseApp({
    globalData: {},
    onCreate() {
      schedulePlanSyncs()
    },
    onDestroy() {},
  }),
)
