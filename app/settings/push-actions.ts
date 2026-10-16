"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPushConfigured, sendPushToUser } from "@/lib/push/send";

const SubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

async function authenticatedUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

export async function savePushSubscription(subscription: unknown): Promise<{ error?: string }> {
  const userId = await authenticatedUserId();
  const parsed = SubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { error: "Iscrizione alle notifiche non valida." };
  const userAgent = (await headers()).get("user-agent")?.slice(0, 512) ?? null;
  // Admin client: se il dispositivo era iscritto con un altro account, l'endpoint
  // passa all'utente corrente (la RLS impedirebbe di aggiornare la riga altrui).
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: userAgent,
      },
      { onConflict: "endpoint" },
    );
  if (error) {
    console.error("savePushSubscription:", error.message);
    return { error: "Impossibile attivare le notifiche. Riprova." };
  }
  return {};
}

export async function removePushSubscription(endpoint: string): Promise<{ error?: string }> {
  const userId = await authenticatedUserId();
  if (typeof endpoint !== "string" || !endpoint) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  if (error) {
    console.error("removePushSubscription:", error.message);
    return { error: "Impossibile disattivare le notifiche. Riprova." };
  }
  return {};
}

export async function sendTestPush(): Promise<{ error?: string; delivered?: number }> {
  const userId = await authenticatedUserId();
  if (!isPushConfigured()) return { error: "Notifiche non configurate sul server." };
  const delivered = await sendPushToUser(userId, {
    title: "Notifiche attive",
    body: "Riceverai qui promemoria e aggiornamenti del coach.",
    url: "/settings",
    tag: "test",
  });
  if (!delivered) return { error: "Nessun dispositivo raggiunto. Riattiva le notifiche." };
  return { delivered };
}
