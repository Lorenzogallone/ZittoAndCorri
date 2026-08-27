import { getPlan, setPlan, setHrZones, setSettingsSnapshot } from "./storage"

function pad(value) {
  return String(value).padStart(2, "0")
}

export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export async function pullPlan(requester, force = false) {
  const cached = getPlan()
  const result = await requester.request({
    method: "PULL_WORKOUTS",
    params: {
      localDate: localDate(),
      timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
      knownRevision: force ? null : cached?.revision || null,
    },
  })
  if (!result?.ok) throw new Error(result?.error || "Sincronizzazione piano fallita")
  setSettingsSnapshot(result.settings)
  setHrZones(result.hrZones || null)
  if (result.notModified && cached) {
    const updated = {
      ...cached,
      selectedWorkoutId: result.selectedWorkoutId,
      selectionSource: result.selectionSource,
      syncedAt: result.serverTime || new Date().toISOString(),
    }
    setPlan(updated)
    return updated
  }
  const plan = {
    schemaVersion: result.schemaVersion,
    revision: result.revision,
    workouts: Array.isArray(result.workouts) ? result.workouts : [],
    selectedWorkoutId: result.selectedWorkoutId || null,
    selectionSource: result.selectionSource || "none",
    syncedAt: result.serverTime || new Date().toISOString(),
  }
  setPlan(plan)
  return plan
}

export function selectedWorkout(plan = getPlan()) {
  if (!plan?.selectedWorkoutId || !Array.isArray(plan.workouts)) return null
  return plan.workouts.find((item) => item.id === plan.selectedWorkoutId) || null
}
