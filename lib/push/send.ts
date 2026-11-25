import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const DEFAULT_SUBJECT = "mailto:noreply@zittoecorri.app";
// A reminder delivered after half a day is no longer useful.
const TTL_SECONDS = 12 * 3600;
const REQUEST_TIMEOUT_MS = 10_000;

let configured: boolean | null = null;

/** Configures web-push once, on first use. */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || DEFAULT_SUBJECT, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("push: chiavi VAPID non valide:", error instanceof Error ? error.message : error);
    configured = false;
  }
  return configured;
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}

function statusCode(error: unknown): number | null {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" ? code : null;
}

/**
 * Sends the notification to all the user's devices and returns how many
 * received it. Never throws: a push problem must not make the caller fail.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  try {
    const admin = createAdminClient();
    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)
      .returns<Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>();
    if (error) throw error;
    if (!subscriptions?.length) return 0;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/",
      tag: payload.tag,
    });
    const results = await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: TTL_SECONDS, timeout: REQUEST_TIMEOUT_MS, contentEncoding: "aes128gcm" },
        );
        return { id: sub.id, delivered: true, gone: false };
      } catch (sendError) {
        const code = statusCode(sendError);
        // 404/410: subscription revoked or expired, it must be deleted.
        if (code === 404 || code === 410) return { id: sub.id, delivered: false, gone: true };
        console.error("sendPushToUser:", code ?? "", sendError instanceof Error ? sendError.message : sendError);
        return { id: sub.id, delivered: false, gone: false };
      }
    }));

    const deliveredIds = results.filter((r) => r.delivered).map((r) => r.id);
    const goneIds = results.filter((r) => r.gone).map((r) => r.id);
    if (goneIds.length) {
      const { error: deleteError } = await admin.from("push_subscriptions").delete().in("id", goneIds);
      if (deleteError) console.error("sendPushToUser cleanup:", deleteError.message);
    }
    if (deliveredIds.length) {
      const { error: updateError } = await admin
        .from("push_subscriptions")
        .update({ last_success_at: new Date().toISOString() })
        .in("id", deliveredIds);
      if (updateError) console.error("sendPushToUser last_success_at:", updateError.message);
    }
    return deliveredIds.length;
  } catch (error) {
    console.error("sendPushToUser:", error instanceof Error ? error.message : error);
    return 0;
  }
}
