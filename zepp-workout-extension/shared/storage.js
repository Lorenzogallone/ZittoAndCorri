import { LocalStorage } from "@zos/storage"

const storage = new LocalStorage("zitto-and-corri-coach.json")

export function getPlan() {
  const value = storage.getItem("plan", null)
  return value && typeof value === "object" ? value : null
}

export function setPlan(value) {
  storage.setItem("plan", value)
}

export function getRuntime() {
  const value = storage.getItem("runtime", null)
  return value && typeof value === "object" ? value : null
}

export function setRuntime(value) {
  if (value) storage.setItem("runtime", value)
  else storage.removeItem("runtime")
}

export function setAlarmId(trigger, id) {
  storage.setItem(`alarm_${trigger}`, id)
}

export function getAlarmId(trigger) {
  return storage.getItem(`alarm_${trigger}`, 0)
}

export function settingsSnapshot() {
  return storage.getItem("runtime_settings", { vibrations: true, sounds: true })
}

export function setSettingsSnapshot(value) {
  storage.setItem("runtime_settings", {
    vibrations: value?.vibrations !== false,
    sounds: value?.sounds !== false,
  })
}

export function getHrZones() {
  const value = storage.getItem("hr_zones", null)
  return value && typeof value === "object" ? value : null
}

export function setHrZones(value) {
  if (value && typeof value === "object") storage.setItem("hr_zones", value)
  else storage.removeItem("hr_zones")
}

