import { LocalStorage } from "@zos/storage"

const storage = new LocalStorage("zitto-and-corri.json")
const QUEUE_KEY = "pending_syncs"
const MAX_PENDING = 14

export function getPendingSyncs() {
  const value = storage.getItem(QUEUE_KEY, [])
  return Array.isArray(value) ? value : []
}

export function enqueueSync(payload) {
  const withoutDuplicate = getPendingSyncs().filter(
    (item) => item.clientSyncId !== payload.clientSyncId,
  )
  storage.setItem(QUEUE_KEY, [...withoutDuplicate, payload].slice(-MAX_PENDING))
}

export function acknowledgeSync(clientSyncId) {
  storage.setItem(
    QUEUE_KEY,
    getPendingSyncs().filter((item) => item.clientSyncId !== clientSyncId),
  )
}

export function clearPendingSyncs() {
  storage.setItem(QUEUE_KEY, [])
}

export function setIntegrationEnabled(enabled) {
  storage.setItem("integration_enabled", enabled === true)
}

export function getIntegrationEnabled() {
  return storage.getItem("integration_enabled", false) === true
}

export function setLastResult(result) {
  storage.setItem("last_result", result)
}

export function getLastResult() {
  return storage.getItem("last_result", null)
}

export function getClientId() {
  let value = storage.getItem("client_id", "")
  if (!value) {
    value = `active3-${Date.now()}-${Math.floor(Math.random() * 1000000000)}`
    storage.setItem("client_id", value)
  }
  return value
}

export function setAlarmId(trigger, id) {
  storage.setItem(`alarm_${trigger}`, id)
}

export function getAlarmId(trigger) {
  return storage.getItem(`alarm_${trigger}`, 0)
}
