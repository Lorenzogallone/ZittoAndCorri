import { BasePage } from "@zeppos/zml/base-page"
import { createWidget, widget, prop, align } from "@zos/ui"
import { px } from "@zos/utils"
import { collectAndSync } from "../shared/sync"
import {
  clearPendingSyncs,
  getIntegrationEnabled,
  getLastResult,
  getPendingSyncs,
  setIntegrationEnabled,
} from "../shared/storage"
import { cancelDailySyncs, scheduleDailySyncs } from "../shared/schedule"

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
        x: px(48), y: px(120), w: px(370), h: px(72),
        text: "Pronto", text_size: px(22), color: 0xaeb8c4,
        align_h: align.CENTER_H,
      })
      this.state.valuesWidget = createWidget(widget.TEXT, {
        x: px(58), y: px(190), w: px(350), h: px(110),
        text: this.summaryText(), text_size: px(23), color: 0xffffff,
        align_h: align.CENTER_H, text_style: 1,
      })
      createWidget(widget.BUTTON, {
        x: px(73), y: px(322), w: px(320), h: px(72), radius: px(32),
        text: "Sincronizza ora", text_size: px(24), color: 0xffffff,
        normal_color: 0x2563eb, press_color: 0x1d4ed8,
        click_func: () => this.syncNow("manual"),
      })
      this.refreshConnection()
    },

    summaryText() {
      const last = getLastResult()
      if (!last?.summary) return `Nessun invio\nIn coda: ${getPendingSyncs().length}`
      const value = last.summary
      return `Carico ${value.trainingLoad ?? "—"}  ·  VO₂ ${value.vo2Max ?? "—"}\nRecupero grezzo ${value.fullRecoveryTime ?? "—"}\nIn coda: ${getPendingSyncs().length}`
    },

    update(text) {
      this.state.statusWidget?.setProperty(prop.TEXT, text)
      this.state.valuesWidget?.setProperty(prop.TEXT, this.summaryText())
    },

    async syncNow(trigger) {
      if (this.state.syncing) return
      if (!getIntegrationEnabled()) {
        this.update("Collega prima dall'app Zepp")
        return
      }
      this.state.syncing = true
      this.update("Raccolta e invio…")
      try {
        const sent = await collectAndSync(this, trigger)
        this.update(sent > 0 ? "Sincronizzazione completata" : "Telefono o rete non disponibili")
      } catch {
        if (!getIntegrationEnabled()) {
          cancelDailySyncs()
          this.update("Collegamento revocato")
        } else {
          this.update("Invio in coda: riproverò")
        }
      } finally {
        this.state.syncing = false
      }
    },

    onCall(data) {
      if (data?.method === "SYNC_NOW") this.syncNow("manual")
      if (data?.method === "CONNECTION_STATE") this.applyConnectionState(data.params?.enabled === true)
    },

    async refreshConnection() {
      try {
        const state = await this.request({ method: "GET_CONNECTION_STATE", params: {} })
        this.applyConnectionState(state?.enabled === true)
      } catch {
        this.update(getIntegrationEnabled() ? "Telefono non raggiungibile" : "Non collegato")
      }
    },

    applyConnectionState(enabled) {
      setIntegrationEnabled(enabled)
      if (enabled) {
        scheduleDailySyncs()
        this.update("Collegato")
      } else {
        cancelDailySyncs()
        clearPendingSyncs()
        this.update("Non collegato")
      }
    },
  }),
)
