import { collectHealthPayload } from "./collect"
import {
  acknowledgeSync,
  clearPendingSyncs,
  enqueueSync,
  getIntegrationEnabled,
  getPendingSyncs,
  setIntegrationEnabled,
  setLastResult,
} from "./storage"

export async function flushPending(requester) {
  const pending = getPendingSyncs()
  let sent = 0
  for (const payload of pending) {
    try {
      const result = await requester.request({
        method: "SYNC_PAYLOAD",
        params: { payload },
      })
      if (result?.revoked) {
        clearPendingSyncs()
        setIntegrationEnabled(false)
        throw new Error("Collegamento revocato")
      }
      if (!result || result.ok !== true) throw new Error(result?.error || "sync failed")
      acknowledgeSync(payload.clientSyncId)
      setLastResult({
        ok: true,
        at: new Date().toISOString(),
        readiness: result.readiness || null,
        summary: {
          trainingLoad: payload.data.workout?.trainingLoad,
          vo2Max: payload.data.workout?.vo2Max,
          fullRecoveryTime: payload.data.workout?.fullRecoveryTime,
        },
      })
      sent += 1
    } catch (error) {
      setLastResult({ ok: false, at: new Date().toISOString(), error: String(error) })
      throw error
    }
  }
  return sent
}

export async function collectAndSync(requester, trigger = "manual") {
  if (!getIntegrationEnabled()) throw new Error("Zepp OS non collegato")
  enqueueSync(collectHealthPayload(trigger))
  return flushPending(requester)
}
