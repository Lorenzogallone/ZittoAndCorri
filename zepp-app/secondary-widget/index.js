// Widget "Oggi" (strisciata a sinistra dal quadrante). Legge solo lo storage
// locale: i widget non possono usare il Bluetooth. Il tocco apre la pagina,
// che invia la coda e aggiorna il piano.
import { createWidget, widget, prop, align, event, text_style } from "@zos/ui"
import { push } from "@zos/router"
import { px } from "@zos/utils"
import { localDate, selectedWorkout } from "../shared/plan"
import { getLastResult, getPendingSyncs, getPlan } from "../shared/storage"

const COLORS = {
  background: 0x000000,
  title: 0xffd400,
  white: 0xffffff,
  muted: 0xaeb8c4,
}

const READINESS_LABELS = {
  intense: "carica",
  ready: "pronto",
  moderate: "moderata",
  recovery: "recupero",
  rest: "riposo",
}

const STEP_PREFIX = {
  warmup: "risc",
  recovery: "rec",
  cooldown: "defat",
}

function pad(value) {
  return String(value).padStart(2, "0")
}

function clock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`
}

function distance(meters) {
  const value = Number(meters) || 0
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000} km`
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(".", ",")} km`
  return `${Math.round(value)} m`
}

function paceRange(step) {
  const min = step.pace_min_s_km
  const max = step.pace_max_s_km
  if (min == null && max == null) return ""
  if (min == null || max == null || min === max) return clock(min ?? max)
  return `${clock(min)}–${clock(max)}`
}

function stepText(step) {
  if (!step) return ""
  let amount = ""
  if (step.completion_type === "distance" && step.completion_value) amount = distance(step.completion_value)
  if (step.completion_type === "time" && step.completion_value) amount = clock(step.completion_value)
  if (!amount) return step.label || ""
  const prefix = STEP_PREFIX[step.kind]
  return [prefix, amount, paceRange(step)].filter(Boolean).join(" ")
}

function stepsSummary(workout) {
  const steps = Array.isArray(workout?.steps) ? workout.steps : []
  const parts = steps.slice(0, 3).map(stepText).filter(Boolean)
  if (steps.length > 3 && parts.length) parts.push("…")
  return parts.join(" · ")
}

function todayWorkout(plan) {
  const today = localDate()
  const selected = selectedWorkout(plan)
  if (selected?.date === today) return selected
  if (!Array.isArray(plan?.workouts)) return null
  return plan.workouts.find((item) => item.date === today) || null
}

function timeLabel(iso) {
  const date = iso ? new Date(iso) : null
  if (!date || Number.isNaN(date.getTime())) return "mai"
  const value = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return localDate(date) === localDate() ? value : `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${value}`
}

function readinessText(readiness) {
  if (!readiness || readiness.score == null) return "Readiness —"
  const label = READINESS_LABELS[readiness.status]
  return `Readiness ${Math.round(Number(readiness.score))}${label ? ` · ${label}` : ""}`
}

function readView() {
  const plan = getPlan()
  const workout = todayWorkout(plan)
  const last = getLastResult()
  return {
    title: workout?.title || (plan ? "Riposo" : "Nessun piano"),
    steps: workout
      ? stepsSummary(workout) || workout.description || ""
      : plan ? "Nessuna seduta in programma" : "Apri l'app per scaricare il piano",
    readiness: readinessText(last?.readiness),
    footer: `Sync ${timeLabel(last?.at)} · coda ${getPendingSyncs().length}`,
  }
}

SecondaryWidget({
  state: { refs: {} },

  onInit() {
    try {
      this.state.view = readView()
    } catch (error) {
      console.log("Widget Oggi onInit", String(error))
    }
  },

  build() {
    try {
      const view = this.state.view || readView()
      const refs = this.state.refs
      createWidget(widget.FILL_RECT, {
        x: 0, y: 0, w: px(466), h: px(466), color: COLORS.background,
      })
      refs.label = createWidget(widget.TEXT, {
        x: px(113), y: px(52), w: px(240), h: px(44),
        text: "Oggi", text_size: px(30), color: COLORS.title,
        align_h: align.CENTER_H, align_v: align.CENTER_V,
      })
      refs.title = createWidget(widget.TEXT, {
        x: px(53), y: px(108), w: px(360), h: px(56),
        text: view.title, text_size: px(38), color: COLORS.white,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.ELLIPSIS,
      })
      refs.steps = createWidget(widget.TEXT, {
        x: px(43), y: px(170), w: px(380), h: px(100),
        text: view.steps, text_size: px(23), color: COLORS.muted,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.WRAP,
      })
      refs.readiness = createWidget(widget.TEXT, {
        x: px(53), y: px(282), w: px(360), h: px(44),
        text: view.readiness, text_size: px(28), color: COLORS.white,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.ELLIPSIS,
      })
      refs.footer = createWidget(widget.TEXT, {
        x: px(83), y: px(352), w: px(300), h: px(36),
        text: view.footer, text_size: px(21), color: COLORS.muted,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.ELLIPSIS,
      })
      // Area trasparente sopra a tutto: un tocco ovunque apre la pagina.
      const tap = createWidget(widget.FILL_RECT, {
        x: 0, y: 0, w: px(466), h: px(466), color: COLORS.background, alpha: 0,
      })
      const open = () => {
        try { push({ url: "page/index" }) } catch (error) { console.log("Widget Oggi push", String(error)) }
      }
      for (const target of [tap, refs.label, refs.title, refs.steps, refs.readiness, refs.footer]) {
        target.addEventListener(event.CLICK_UP, open)
      }
    } catch (error) {
      console.log("Widget Oggi build", String(error))
    }
  },

  onResume() {
    try {
      const view = readView()
      const refs = this.state.refs
      refs.title?.setProperty(prop.TEXT, view.title)
      refs.steps?.setProperty(prop.TEXT, view.steps)
      refs.readiness?.setProperty(prop.TEXT, view.readiness)
      refs.footer?.setProperty(prop.TEXT, view.footer)
    } catch (error) {
      console.log("Widget Oggi onResume", String(error))
    }
  },

  onPause() {},
})
