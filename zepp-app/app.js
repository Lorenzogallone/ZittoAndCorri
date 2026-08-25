import { BaseApp } from "@zeppos/zml/base-app"
import { scheduleDailySyncs } from "./shared/schedule"
import { getIntegrationEnabled } from "./shared/storage"

App(
  BaseApp({
    globalData: {},
    onCreate() {
      if (getIntegrationEnabled()) scheduleDailySyncs()
    },
    onDestroy() {},
  }),
)
