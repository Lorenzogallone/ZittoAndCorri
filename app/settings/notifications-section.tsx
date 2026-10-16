"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription, sendTestPush } from "./push-actions";

type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const LABEL = "Notifiche su questo dispositivo";

const HINTS: Partial<Record<Status, string>> = {
  unsupported: "Questo browser non supporta le notifiche.",
  "ios-install": "Su iPhone aggiungi prima l'app alla schermata Home.",
  denied: "Notifiche bloccate nelle impostazioni del browser.",
};

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** False se la subscription è legata a una chiave VAPID diversa (chiave ruotata). */
function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function detectStatus(vapidPublicKey: string): Promise<Status> {
  if (isIos() && !isStandalone()) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const subscription = Notification.permission === "granted" ? await currentSubscription() : null;
  if (!subscription || !sameKey(subscription, urlBase64ToUint8Array(vapidPublicKey))) return "off";
  // Riallinea il server (es. dispositivo usato prima con un altro account).
  savePushSubscription(JSON.parse(JSON.stringify(subscription))).catch(() => undefined);
  return "on";
}

export function NotificationsSection({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectStatus(vapidPublicKey)
      .catch((): Status => "unsupported")
      .then((next) => {
        if (!cancelled) setStatus(next);
      });
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(permission === "denied" ? "denied" : "off");
      return;
    }
    if (!(await navigator.serviceWorker.getRegistration())) {
      await navigator.serviceWorker.register("/sw.js");
    }
    const registration = await navigator.serviceWorker.ready;
    const key = urlBase64ToUint8Array(vapidPublicKey);
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }
    const result = await savePushSubscription(JSON.parse(JSON.stringify(subscription)));
    if (result.error) {
      await subscription.unsubscribe();
      setMessage(result.error);
      return;
    }
    setStatus("on");
  }

  async function disable() {
    const subscription = await currentSubscription();
    if (subscription) {
      const result = await removePushSubscription(subscription.endpoint);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      await subscription.unsubscribe();
    }
    setStatus("off");
  }

  async function toggle(next: boolean) {
    setPending(true);
    setMessage(null);
    try {
      await (next ? enable() : disable());
    } catch (error) {
      console.error("notifications toggle:", error);
      setMessage(next ? "Impossibile attivare le notifiche." : "Impossibile disattivare le notifiche.");
    } finally {
      setPending(false);
    }
  }

  async function test() {
    setPending(true);
    setMessage(null);
    const result = await sendTestPush().catch(() => ({ error: "Invio non riuscito." }));
    setMessage(result.error ?? "Notifica inviata.");
    setPending(false);
  }

  const available = status === "on" || status === "off";
  const hint = message ?? HINTS[status] ?? null;

  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{LABEL}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Promemoria della seduta, analisi delle corse e riepilogo del lunedì.
          </p>
        </div>
        <Switch
          checked={status === "on"}
          onCheckedChange={toggle}
          disabled={!available || pending}
          aria-label={LABEL}
        />
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      {status === "on" && (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="mt-1 px-0"
          disabled={pending}
          onClick={test}
        >
          Invia una prova
        </Button>
      )}
    </div>
  );
}
