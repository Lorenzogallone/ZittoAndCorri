import { BasePage } from "@zeppos/zml/base-page"
import { createWidget, widget, prop, align } from "@zos/ui"
import { px } from "@zos/utils"
import { collectAndSync } from "../shared/sync"
import { pullPlan } from "../shared/plan"
import {
  clearPendingSyncs,
  getIntegrationEnabled,
  getLastCapture,
  getLastResult,
  getPendingSyncs,
  setIntegrationEnabled,
  setScheduleHours,
} from "../shared/storage"
import { cancelDailySyncs, scheduleDailySyncs } from "../shared/schedule"

function pad(value) {
  return String(value).padStart(2, "0")
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function timeLabel(iso) {
  const date = iso ? new Date(iso) : null
  if (!date || Number.isNaN(date.getTime())) return "never"
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const now = new Date()
  if (sameDay(date, now)) return clock
  const yesterday = new Date(now.getTime())
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(date, yesterday)) return `yesterday ${clock}`
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${clock}`
}

Page(
  BasePage({
    state: { statusWidget: null, valuesWidget: null, syncing: false },

    build() {
      createWidget(widget.TEXT, {
        x: px(53), y: px(54), w: px(360), h: px(52),
        text: "Zitto e Corri", text_size: px(34), color: 0xffffff,
        align_h: align.CENTER_H,
      })
      this.state.statusWidget = createWidget(widget.TEXT, {
        x: px(48), y: px(112), w: px(370), h: px(64),
        text: "Ready", text_size: px(22), color: 0xaeb8c4,
        align_h: align.CENTER_H,
      })
      this.state.valuesWidget = createWidget(widget.TEXT, {
        x: px(48), y: px(178), w: px(370), h: px(136),
        text: this.summaryText(), text_size: px(21), color: 0xffffff,
        align_h: align.CENTER_H, text_style: 1,
      })
      createWidget(widget.BUTTON, {
        x: px(73), y: px(322), w: px(320), h: px(72), radius: px(32),
        text: "Sync now", text_size: px(24), color: 0xffffff,
        normal_color: 0x2563eb, press_color: 0x1d4ed8,
        click_func: () => this.syncNow("manual"),
      })
      this.refreshConnection()
    },

    summaryText() {
      const last = getLastResult()
      const capture = `Auto capture: ${timeLabel(getLastCapture()?.at)}`
      const queue = `Queued: ${getPendingSyncs().length}`
      if (!last?.summary) return `Nothing sent\n${capture}\n${queue}`
      const value = last.summary
      return `Load ${value.trainingLoad ?? "—"}  ·  VO₂ ${value.vo2Max ?? "—"}\nRaw recovery ${value.fullRecoveryTime ?? "—"}\n${capture}\n${queue}`
    },

    update(text) {
      this.state.statusWidget?.setProperty(prop.TEXT, text)
      this.state.valuesWidget?.setProperty(prop.TEXT, this.summaryText())
    },

    async syncNow(trigger) {
      if (this.state.syncing) return
      if (!getIntegrationEnabled()) {
        // The button also completes a connection requested from the Zepp app:
        // the request to the phone starts the service.
        this.update("Checking the connection…")
        const state = await this.refreshConnection()
        if (state && !getIntegrationEnabled() && !state.pairing) {
          this.update(state.pairingRequested ? "Code expired or already used: generate a new one" : "Connect from the Zepp app first")
        }
        return
      }
      this.state.syncing = true
      this.update(trigger === "retry" ? "Sending queued data…" : "Collecting and sending…")
      try {
        const sent = await collectAndSync(this, trigger)
        this.update(sent > 0 ? "Sync complete" : "Phone or network unavailable")
      } catch {
        if (!getIntegrationEnabled()) {
          cancelDailySyncs()
          this.update("Connection revoked")
        } else {
          this.update("Send queued: will retry")
        }
      } finally {
        this.state.syncing = false
      }
    },

    async refreshPlan() {
      try {
        await pullPlan(this)
      } catch (error) {
        console.log("Zepp plan pull failed", String(error))
      }
    },

    onCall(data) {
      if (data?.method === "SYNC_NOW") this.syncNow("manual")
      if (data?.method === "CONNECTION_STATE") {
        this.applyConnectionState(data.params?.enabled === true, data.params?.schedule)
      }
    },

    async refreshConnection() {
      let state = null
      try {
        state = await this.request({ method: "GET_CONNECTION_STATE", params: {} })
      } catch {
        this.update(getIntegrationEnabled() ? "Phone unreachable" : "Phone unreachable: open the Zepp app")
        return null
      }
      this.applyConnectionState(state?.enabled === true, state?.schedule)
      if (state?.pairing && !state.pairing.ok) {
        this.update(`Connection failed:\n${state.pairing.error}`)
      }
      if (state?.enabled !== true) return state
      // The phone responds: send what the alarms queued and refresh the plan
      // for the "Today" widget.
      if (getPendingSyncs().length > 0) await this.syncNow("retry")
      await this.refreshPlan()
      return state
    },

    applyConnectionState(enabled, schedule) {
      setIntegrationEnabled(enabled)
      if (enabled) {
        if (schedule && typeof schedule === "object") setScheduleHours(schedule)
        scheduleDailySyncs()
        this.update("Connected")
      } else {
        cancelDailySyncs()
        clearPendingSyncs()
        this.update("Not connected")
      }
    },
  }),
)
