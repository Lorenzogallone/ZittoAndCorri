import { BasePage } from "@zeppos/zml/base-page"
import { getSportData } from "@zos/app-access"
import {
  createWidget,
  widget,
  prop,
  align,
  event,
  edit_widget_group_type,
  sport_data,
} from "@zos/ui"
import { px } from "@zos/utils"
import {
  HeartRate,
  SystemSounds,
  Vibrator,
  VIBRATOR_SCENE_DURATION_LONG,
  VIBRATOR_SCENE_NOTIFICATION,
  VIBRATOR_SCENE_STRONG_REMINDER,
} from "@zos/sensor"
import {
  KEY_DOWN,
  KEY_EVENT_DOUBLE_CLICK,
  KEY_UP,
  offKey,
  onKey,
} from "@zos/interaction"
import {
  createRuntime,
  extractSportValue,
  formatClock,
  moveStep,
  parseDuration,
  parseSportNumber,
  updateRuntime,
} from "../../shared/engine"
import { getPlan, getRuntime, setRuntime, settingsSnapshot } from "../../shared/storage"
import { pullPlan, selectedWorkout } from "../../shared/sync"

const COLORS = {
  black: 0x000000,
  white: 0xffffff,
  muted: 0xb5b5b5,
  yellow: 0xffd400,
  yellowSoft: 0xffe45c,
  touch: 0x242424,
}

function text(options) {
  return createWidget(widget.TEXT, {
    color: COLORS.white,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    ...options,
  })
}

function paceLabel(seconds) {
  return seconds == null ? "—" : `${formatClock(seconds)}/km`
}

function stepTarget(step) {
  if (!step) return "—"
  const targets = []
  if (step.pace_min_s_km != null || step.pace_max_s_km != null) {
    targets.push(`Passo ${paceLabel(step.pace_min_s_km)}–${paceLabel(step.pace_max_s_km)}`)
  }
  if (step.hr_min_bpm != null || step.hr_max_bpm != null) {
    targets.push(`HR ${step.hr_min_bpm ?? "—"}–${step.hr_max_bpm ?? "—"}`)
  }
  return targets.join("  ·  ") || "Libero"
}

function remainingLabel(step, remaining) {
  if (!step || remaining == null) return "Manuale"
  if (step.completion_type === "distance") return remaining >= 1000 ? `${(remaining / 1000).toFixed(2)} km` : `${Math.round(remaining)} m`
  return formatClock(remaining)
}

function currentRemaining(runtime, step, metrics) {
  if (!runtime || !step || !metrics || step.completion_type === "manual") return null
  const completed = step.completion_type === "distance"
    ? metrics.distance - runtime.stepStartDistance
    : metrics.duration - runtime.stepStartDuration
  return Math.max(0, Number(step.completion_value || 0) - completed)
}

function clockLabel(now = new Date()) {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
}

function totalDistanceLabel(meters) {
  return typeof meters === "number" && meters >= 0 ? (meters / 1000).toFixed(2) : "—"
}

function paceInfo(step, projection) {
  if (projection) return `KM ${projection.kilometer} PREVISTO ${formatClock(projection.projectedSeconds)}`
  if (step?.pace_min_s_km != null || step?.pace_max_s_km != null) {
    return `TARGET ${paceLabel(step.pace_min_s_km)} – ${paceLabel(step.pace_max_s_km)}`
  }
  return "PASSO LIBERO"
}

function phaseInstruction(step, complete) {
  if (complete) return "Hai completato tutte le fasi. Defatica e salva l'attività quando hai finito."
  if (!step) return "Controlla il piano prima di ripartire."
  const action = {
    warmup: "Riscaldati in modo facile\ne regolare.",
    work: "Mantieni il ritmo target\nsenza partire troppo forte.",
    recovery: "Recupera con calma:\nprepara la fase successiva.",
    steady: "Corri controllato, fluido\ne costante.",
    cooldown: "Defatica: rallenta e\nlascia scendere lo sforzo.",
  }[step.kind] || "Segui il target della fase."
  return action
}

function readSport(type, key, transform = parseSportNumber) {
  return new Promise((resolve) => {
    const accepted = getSportData({ type }, ({ code, data }) => {
      if (code !== 0) return resolve(null)
      resolve(transform(extractSportValue(data, key)))
    })
    if (!accepted) resolve(null)
  })
}

DataWidget(
  BasePage({
    state: {
      plan: null,
      workout: null,
      runtime: null,
      timer: null,
      heartRate: null,
      currentHr: 0,
      visible: false,
      ticking: false,
      locked: false,
      lastPersistAt: 0,
      refs: {},
      vibrator: null,
      sounds: null,
      keyRegistered: false,
      lastMetrics: null,
      lastResult: null,
      phasePromptTimer: null,
    },

    onInit() {
      this.state.plan = getPlan()
      this.state.workout = selectedWorkout(this.state.plan)
      const saved = getRuntime()
      if (saved?.workoutId && saved.workoutId === this.state.workout?.id && !saved.complete) {
        this.state.runtime = saved
        this.state.locked = true
      }
      try { this.state.vibrator = new Vibrator() } catch {}
      try { this.state.sounds = new SystemSounds() } catch {}
    },

    build() {
      // Contenuto deliberatamente entro il disco utile: niente metriche negli
      // angoli che sul display circolare dell'Active 3 Premium verrebbero tagliate.
      createWidget(widget.FILL_RECT, { x: 0, y: 0, w: px(466), h: px(466), radius: px(233), color: COLORS.black })

      createWidget(widget.FILL_RECT, { x: px(113), y: px(24), w: px(240), h: px(84), radius: px(22), color: COLORS.yellow })
      text({ x: px(123), y: px(29), w: px(220), h: px(19), text_size: px(14), color: COLORS.black, text: "PASSO ATTUALE" })
      createWidget(widget.SPORT_DATA, {
        x: px(121), y: px(46), w: px(224), h: px(45), edit_id: 1,
        category: edit_widget_group_type.SPORTS, default_type: sport_data.PACE,
        text_size: px(42), text_color: COLORS.black, text_x: 0, text_y: 0, text_w: px(224), text_h: px(45),
        mock_data: "5'12\"",
      })
      this.state.refs.paceInfo = text({ x: px(121), y: px(88), w: px(224), h: px(16), text_size: px(12), color: COLORS.black, text: "PASSO LIBERO" })

      // I quattro quadranti seguono il senso orario richiesto: residuo, BPM,
      // distanza totale e tempo netto. Le linee gialle rendono leggibile la griglia.
      createWidget(widget.FILL_RECT, { x: px(233), y: px(121), w: px(2), h: px(224), color: COLORS.yellow })
      createWidget(widget.FILL_RECT, { x: px(46), y: px(232), w: px(374), h: px(2), color: COLORS.yellow })

      text({ x: px(51), y: px(125), w: px(174), h: px(19), text_size: px(14), color: COLORS.yellow, text: "RESIDUO FASE" })
      this.state.refs.remaining = text({ x: px(51), y: px(143), w: px(174), h: px(53), text_size: px(42), text: "—" })
      this.state.refs.phase = text({ x: px(51), y: px(196), w: px(174), h: px(29), text_size: px(15), color: COLORS.muted, text: "In attesa del piano" })

      text({ x: px(244), y: px(125), w: px(170), h: px(19), text_size: px(14), color: COLORS.yellow, text: "BPM" })
      createWidget(widget.SPORT_DATA, {
        x: px(244), y: px(149), w: px(170), h: px(68), edit_id: 2,
        category: edit_widget_group_type.SPORTS, default_type: sport_data.HR,
        text_size: px(46), text_color: COLORS.white, text_x: 0, text_y: 0, text_w: px(170), text_h: px(61),
        mock_data: "148",
      })

      text({ x: px(244), y: px(242), w: px(170), h: px(19), text_size: px(14), color: COLORS.yellow, text: "DISTANZA KM" })
      this.state.refs.distance = text({ x: px(244), y: px(261), w: px(170), h: px(57), text_size: px(44), text: "—" })
      text({ x: px(51), y: px(242), w: px(174), h: px(19), text_size: px(14), color: COLORS.yellow, text: "TEMPO NETTO" })
      this.state.refs.duration = text({ x: px(51), y: px(261), w: px(174), h: px(57), text_size: px(42), text: "—" })

      this.state.refs.clock = text({ x: px(156), y: px(342), w: px(154), h: px(27), text_size: px(22), color: COLORS.yellow, text: "--:--" })
      this.state.refs.status = text({ x: px(91), y: px(369), w: px(284), h: px(18), text_size: px(12), color: COLORS.muted, text: "Apri questa pagina per gli avvisi" })

      const previous = createWidget(widget.FILL_RECT, { x: px(70), y: px(395), w: px(145), h: px(42), radius: px(20), color: COLORS.touch })
      const next = createWidget(widget.FILL_RECT, { x: px(251), y: px(395), w: px(145), h: px(42), radius: px(20), color: COLORS.touch })
      const previousLabel = text({ x: px(70), y: px(395), w: px(145), h: px(42), text_size: px(15), text: "‹ FASE" })
      const nextLabel = text({ x: px(251), y: px(395), w: px(145), h: px(42), text_size: px(15), text: "FASE ›" })
      for (const target of [previous, previousLabel]) target.addEventListener(event.CLICK, () => this.changeStep(-1))
      for (const target of [next, nextLabel]) target.addEventListener(event.CLICK, () => this.changeStep(1))

      // Overlay che compare ad ogni passaggio: resta leggibile, si chiude al
      // tocco oppure automaticamente dopo alcuni secondi per non bloccare la corsa.
      this.state.refs.promptBorder = createWidget(widget.FILL_RECT, { x: px(24), y: px(58), w: px(418), h: px(328), radius: px(36), color: COLORS.yellow })
      this.state.refs.promptPanel = createWidget(widget.FILL_RECT, { x: px(29), y: px(63), w: px(408), h: px(318), radius: px(32), color: COLORS.black })
      this.state.refs.promptTap = createWidget(widget.FILL_RECT, { x: px(45), y: px(300), w: px(376), h: px(58), radius: px(20), color: COLORS.black })
      this.state.refs.promptKicker = text({ x: px(55), y: px(84), w: px(356), h: px(24), text_size: px(15), color: COLORS.yellow, text: "NUOVA FASE" })
      this.state.refs.promptTitle = text({ x: px(48), y: px(112), w: px(370), h: px(58), text_size: px(31), text: "—" })
      this.state.refs.promptAction = text({ x: px(58), y: px(176), w: px(350), h: px(67), text_size: px(18), color: COLORS.white, text: "—" })
      this.state.refs.promptTarget = text({ x: px(55), y: px(250), w: px(356), h: px(30), text_size: px(16), color: COLORS.yellow, text: "—" })
      this.state.refs.promptDismiss = text({ x: px(55), y: px(315), w: px(356), h: px(27), text_size: px(15), color: COLORS.muted, text: "TOCCA PER CONTINUARE" })
      this.state.refs.promptTap.addEventListener(event.CLICK, () => this.hidePhasePrompt())
      for (const name of ["promptBorder", "promptPanel", "promptKicker", "promptTitle", "promptAction", "promptTarget", "promptDismiss", "promptTap"]) {
        this.state.refs[name].setProperty(prop.VISIBLE, false)
      }
      this.render()
    },

    onResume() {
      this.state.visible = true
      this.registerInputs()
      this.registerHeartRate()
      this.refreshPlan()
      this.tick()
      if (!this.state.timer) this.state.timer = setInterval(() => this.tick(), 1000)
    },

    onPause() {
      this.state.visible = false
      this.stopRealtime()
      this.persistRuntime()
    },

    onDestroy() {
      this.stopRealtime()
      this.persistRuntime()
    },

    onCall(data) {
      if (data?.method === "PLAN_CHANGED") this.refreshPlan(true)
    },

    stopRealtime() {
      if (this.state.timer) clearInterval(this.state.timer)
      this.state.timer = null
      this.hidePhasePrompt()
      if (this.state.keyRegistered) {
        try { offKey() } catch {}
        this.state.keyRegistered = false
      }
      if (this.state.heartRate) {
        try { this.state.heartRate.offCurrentChange(this.state.hrCallback) } catch {}
      }
      this.state.heartRate = null
    },

    registerInputs() {
      if (this.state.keyRegistered) return
      try {
        onKey({
          callback: (key, keyEvent) => {
            if (keyEvent !== KEY_EVENT_DOUBLE_CLICK) return false
            if (key === KEY_DOWN) { this.changeStep(1); return true }
            if (key === KEY_UP) { this.changeStep(-1); return true }
            return false
          },
        })
        this.state.keyRegistered = true
      } catch {}
    },

    registerHeartRate() {
      if (this.state.heartRate) return
      try {
        const heartRate = new HeartRate()
        this.state.hrCallback = () => { this.state.currentHr = Number(heartRate.getCurrent()) || 0 }
        heartRate.onCurrentChange(this.state.hrCallback)
        this.state.heartRate = heartRate
      } catch {
        this.state.currentHr = 0
      }
    },

    async refreshPlan(force = false) {
      try {
        const plan = await pullPlan(this, force)
        if (!this.state.locked) {
          this.state.plan = plan
          this.state.workout = selectedWorkout(plan)
          const saved = getRuntime()
          this.state.runtime = saved?.workoutId === this.state.workout?.id && !saved.complete ? saved : null
        }
        this.render()
      } catch {
        this.state.refs.status?.setProperty(prop.TEXT, this.state.workout ? "Offline · uso piano salvato" : "Telefono non raggiungibile")
      }
    },

    async tick() {
      if (!this.state.visible || this.state.ticking || !this.state.workout) return
      this.state.ticking = true
      try {
        const [duration, distance, speed] = await Promise.all([
          readSport("duration", "duration", parseDuration),
          readSport("distance", "distance", (value) => {
            const parsed = parseSportNumber(value)
            return parsed == null ? null : parsed * 1000
          }),
          readSport("speed", "speed"),
        ])
        if (duration == null || distance == null) return
        const metrics = { duration, distance, speed, hr: this.state.currentHr }
        this.state.lastMetrics = metrics
        if (this.state.runtime && (duration + 2 < this.state.runtime.stepStartDuration || distance + 5 < this.state.runtime.stepStartDistance)) {
          this.state.runtime = null
          this.state.locked = false
        }
        if (!this.state.runtime) this.state.runtime = createRuntime(this.state.workout, metrics)
        if (duration > 0 || distance > 0) this.state.locked = true
        const result = updateRuntime(this.state.runtime, this.state.workout, metrics)
        this.state.lastResult = result
        this.handleEvents(result.events)
        this.render(result)
        if (Date.now() - this.state.lastPersistAt >= 10_000 || result.events.length) this.persistRuntime()
      } finally {
        this.state.ticking = false
      }
    },

    changeStep(direction) {
      if (!this.state.workout || !this.state.runtime || this.state.runtime.complete) return
      const previous = this.state.runtime.previousSample || { duration: 0, distance: 0 }
      const eventName = moveStep(this.state.runtime, this.state.workout, direction, previous)
      this.state.locked = true
      this.handleEvents([eventName])
      this.persistRuntime()
      this.render()
    },

    handleEvents(events) {
      const options = settingsSnapshot()
      for (const name of events) {
        if (options.vibrations && this.state.vibrator) {
          const mode = name === "pace_fast"
            ? VIBRATOR_SCENE_NOTIFICATION
            : name === "pace_slow"
              ? VIBRATOR_SCENE_DURATION_LONG
              : VIBRATOR_SCENE_STRONG_REMINDER
          try { this.state.vibrator.start({ mode }) } catch {}
        }
        if (options.sounds && (name === "phase_transition" || name === "complete") && this.state.sounds) {
          try {
            if (this.state.sounds.getEnabled()) this.state.sounds.start(this.state.sounds.getSourceType().ACHIEVE)
          } catch {}
        }
      }
      if (events.includes("phase_transition") || events.includes("complete")) {
        this.showPhasePrompt(events.includes("complete"))
      }
    },

    showPhasePrompt(complete = false) {
      const runtime = this.state.runtime
      const step = complete ? null : this.state.workout?.steps?.[runtime?.stepIndex]
      this.state.refs.promptKicker?.setProperty(prop.TEXT, complete ? "ALLENAMENTO COMPLETATO" : "NUOVA FASE")
      this.state.refs.promptTitle?.setProperty(prop.TEXT, complete ? "Ottimo lavoro" : step?.label || "Prosegui")
      this.state.refs.promptAction?.setProperty(prop.TEXT, phaseInstruction(step, complete))
      this.state.refs.promptTarget?.setProperty(prop.TEXT, complete ? "SALVA QUANDO HAI FINITO" : stepTarget(step))
      for (const name of ["promptBorder", "promptPanel", "promptTap", "promptKicker", "promptTitle", "promptAction", "promptTarget", "promptDismiss"]) {
        this.state.refs[name]?.setProperty(prop.VISIBLE, true)
      }
      if (this.state.phasePromptTimer) clearTimeout(this.state.phasePromptTimer)
      this.state.phasePromptTimer = setTimeout(() => this.hidePhasePrompt(), 6_000)
    },

    hidePhasePrompt() {
      if (this.state.phasePromptTimer) clearTimeout(this.state.phasePromptTimer)
      this.state.phasePromptTimer = null
      for (const name of ["promptBorder", "promptPanel", "promptTap", "promptKicker", "promptTitle", "promptAction", "promptTarget", "promptDismiss"]) {
        this.state.refs[name]?.setProperty(prop.VISIBLE, false)
      }
    },

    persistRuntime() {
      if (!this.state.runtime) return
      setRuntime(this.state.runtime)
      this.state.lastPersistAt = Date.now()
    },

    render(result = this.state.lastResult) {
      const workout = this.state.workout
      const runtime = this.state.runtime
      const step = runtime && workout ? workout.steps[runtime.stepIndex] : workout?.steps?.[0]
      const metrics = this.state.lastMetrics
      this.state.refs.phase?.setProperty(prop.TEXT, runtime?.complete ? "Allenamento concluso" : step?.label || workout?.title || "Nessun allenamento oggi")
      this.state.refs.remaining?.setProperty(prop.TEXT,
        runtime?.complete ? "FINE" : runtime ? remainingLabel(step, currentRemaining(runtime, step, metrics)) : "—")
      const projection = result?.projection
      this.state.refs.paceInfo?.setProperty(prop.TEXT, paceInfo(step, projection))
      this.state.refs.distance?.setProperty(prop.TEXT, totalDistanceLabel(metrics?.distance))
      this.state.refs.duration?.setProperty(prop.TEXT, metrics ? formatClock(metrics.duration) : "—")
      this.state.refs.clock?.setProperty(prop.TEXT, clockLabel())
      if (this.state.visible) this.state.refs.status?.setProperty(prop.TEXT, this.state.heartRate ? "Guida e avvisi attivi" : "Guida attiva · HR senza avvisi")
    },
  }),
)
