export const PACE_WINDOW_MS = 15_000
export const ALERT_COOLDOWN_MS = 60_000

export function formatClock(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`
}

export function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value)
  const parts = String(value || "").trim().split(":").map(Number)
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0]
}

export function parseSportNumber(value) {
  const normalized = String(value ?? "").trim().replace(",", ".").replace(/[^0-9.+-]/g, "")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function extractSportValue(payload, key) {
  let value = payload
  if (typeof value === "string") {
    try { value = JSON.parse(value) } catch { return null }
  }
  if (Array.isArray(value)) value = value[0]
  if (!value || typeof value !== "object") return null
  if (value[key] != null) return value[key]
  const fallback = Object.keys(value).find((name) => name !== "name")
  return fallback ? value[fallback] : null
}

export function speedToPace(speedKmh) {
  return typeof speedKmh === "number" && speedKmh > 0.2 ? 3600 / speedKmh : null
}

export function createRuntime(workout, metrics = { duration: 0, distance: 0 }) {
  const observedStart = (metrics.distance || 0) <= 1 && (metrics.duration || 0) <= 2
  return {
    workoutId: workout.id,
    stepIndex: 0,
    stepStartDuration: metrics.duration || 0,
    stepStartDistance: metrics.distance || 0,
    speedSamples: [],
    previousSample: null,
    kmBoundaries: observedStart ? { 0: 0 } : {},
    outSince: {},
    lastAlertAt: {},
    complete: false,
  }
}

export function moveStep(runtime, workout, direction, metrics) {
  const next = Math.max(0, Math.min(workout.steps.length, runtime.stepIndex + direction))
  runtime.stepIndex = next
  runtime.stepStartDuration = metrics.duration
  runtime.stepStartDistance = metrics.distance
  runtime.outSince = {}
  runtime.complete = next >= workout.steps.length
  return runtime.complete ? "complete" : "phase_transition"
}

export function smoothedPace(runtime, speedKmh, now) {
  if (typeof speedKmh === "number" && speedKmh > 0.2) runtime.speedSamples.push({ at: now, speed: speedKmh })
  runtime.speedSamples = runtime.speedSamples.filter((sample) => now - sample.at <= PACE_WINDOW_MS)
  if (!runtime.speedSamples.length) return null
  const average = runtime.speedSamples.reduce((sum, sample) => sum + sample.speed, 0) / runtime.speedSamples.length
  return speedToPace(average)
}

function updateKilometerBoundaries(runtime, metrics) {
  const previous = runtime.previousSample
  if (!previous || metrics.distance <= previous.distance) {
    runtime.previousSample = { distance: metrics.distance, duration: metrics.duration }
    return
  }
  const firstBoundary = (Math.floor(previous.distance / 1000) + 1) * 1000
  for (let boundary = firstBoundary; boundary <= metrics.distance; boundary += 1000) {
    const ratio = (boundary - previous.distance) / (metrics.distance - previous.distance)
    runtime.kmBoundaries[boundary / 1000] = previous.duration + ratio * (metrics.duration - previous.duration)
  }
  runtime.previousSample = { distance: metrics.distance, duration: metrics.duration }
}

export function kilometerProjection(runtime, metrics, pace) {
  if (pace == null || pace <= 0) return null
  const completedKm = Math.floor(metrics.distance / 1000)
  const boundaryDuration = runtime.kmBoundaries[completedKm]
  if (boundaryDuration == null) return null
  const progress = metrics.distance - completedKm * 1000
  const elapsed = Math.max(0, metrics.duration - boundaryDuration)
  return {
    kilometer: completedKm + 1,
    projectedSeconds: elapsed + ((1000 - progress) * pace) / 1000,
  }
}

function alert(runtime, key, active, now, requiredMs) {
  if (!active) {
    delete runtime.outSince[key]
    return false
  }
  if (runtime.outSince[key] == null) runtime.outSince[key] = now
  const last = runtime.lastAlertAt[key]
  if (now - runtime.outSince[key] >= requiredMs && (last == null || now - last >= ALERT_COOLDOWN_MS)) {
    runtime.lastAlertAt[key] = now
    return true
  }
  return false
}

function automaticBoundary(runtime, step, metrics) {
  const value = Number(step.completion_value || 0)
  if (step.completion_type === "time") {
    const duration = runtime.stepStartDuration + value
    if (metrics.duration < duration) return null
    const span = Math.max(0, metrics.duration - runtime.stepStartDuration)
    const ratio = span > 0 ? Math.min(1, value / span) : 0
    return {
      duration,
      distance: runtime.stepStartDistance + (metrics.distance - runtime.stepStartDistance) * ratio,
    }
  }
  if (step.completion_type === "distance") {
    const distance = runtime.stepStartDistance + value
    if (metrics.distance < distance) return null
    const span = Math.max(0, metrics.distance - runtime.stepStartDistance)
    const ratio = span > 0 ? Math.min(1, value / span) : 0
    return {
      duration: runtime.stepStartDuration + (metrics.duration - runtime.stepStartDuration) * ratio,
      distance,
    }
  }
  return null
}

function advanceCompletedSteps(runtime, workout, metrics, events) {
  while (!runtime.complete) {
    const step = workout.steps[runtime.stepIndex]
    if (!step || step.completion_type === "manual") return
    const boundary = automaticBoundary(runtime, step, metrics)
    if (!boundary) return
    runtime.stepIndex += 1
    runtime.stepStartDuration = boundary.duration
    runtime.stepStartDistance = boundary.distance
    runtime.outSince = {}
    runtime.complete = runtime.stepIndex >= workout.steps.length
    events.push(runtime.complete ? "complete" : "phase_transition")
  }
}

export function updateRuntime(runtime, workout, metrics, now = Date.now()) {
  const events = []
  const pace = smoothedPace(runtime, metrics.speed, now)
  updateKilometerBoundaries(runtime, metrics)
  advanceCompletedSteps(runtime, workout, metrics, events)
  if (runtime.complete || !workout.steps[runtime.stepIndex]) {
    return { events, pace, projection: kilometerProjection(runtime, metrics, pace), remaining: 0 }
  }

  const step = workout.steps[runtime.stepIndex]
  const elapsedDuration = Math.max(0, metrics.duration - runtime.stepStartDuration)
  const elapsedDistance = Math.max(0, metrics.distance - runtime.stepStartDistance)
  const elapsed = step.completion_type === "distance" ? elapsedDistance : elapsedDuration
  const remaining = step.completion_type === "manual"
    ? null
    : Math.max(0, Number(step.completion_value || 0) - elapsed)

  if (pace != null) {
    if (alert(runtime, "pace_fast", step.pace_min_s_km != null && pace < step.pace_min_s_km, now, 20_000)) events.push("pace_fast")
    if (alert(runtime, "pace_slow", step.pace_max_s_km != null && pace > step.pace_max_s_km, now, 20_000)) events.push("pace_slow")
  }
  if (metrics.hr > 0) {
    if (alert(runtime, "hr_high", step.hr_max_bpm != null && metrics.hr > step.hr_max_bpm, now, 30_000)) events.push("hr_high")
  }

  return { events, pace, projection: kilometerProjection(runtime, metrics, pace), remaining }
}
