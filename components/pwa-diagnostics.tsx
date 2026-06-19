"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  clientLog,
  getLogs,
  subscribeLogs,
  isDebugEnabled,
  isStandalone,
} from "@/lib/clientlog";

/**
 * Diagnostica PWA: logga il ciclo di vita della pagina (utile per capire i
 * blocchi su iOS standalone) e, quando attivo, mostra un overlay a schermo con
 * gli ultimi eventi — così si leggono i log direttamente sul telefono, senza
 * devtools. Gli stessi eventi finiscono anche nei log di Vercel (/api/clientlog).
 *
 * Attivazione overlay/beacon: apri l'app con ?debug=1 (resta attivo finché non
 * apri con ?debug=0). In PWA standalone i beacon partono comunque.
 */
export function PwaDiagnostics() {
  // Attiva/disattiva il debug da query string e logga l'avvio.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const dbg = params.get("debug");
      if (dbg === "1") window.localStorage.setItem("clientlog", "1");
      else if (dbg === "0") window.localStorage.removeItem("clientlog");
    } catch {
      // ignora
    }

    clientLog("page:load", {
      standalone: isStandalone(),
      ua: navigator.userAgent,
      sw: !!navigator.serviceWorker?.controller,
    });

    const onPageShow = (e: PageTransitionEvent) =>
      clientLog("page:show", { persisted: e.persisted });
    const onPageHide = (e: PageTransitionEvent) =>
      clientLog("page:hide", { persisted: e.persisted });
    const onVisibility = () =>
      clientLog("page:visibility", { state: document.visibilityState });
    const onOnline = () => clientLog("net:online");
    const onOffline = () => clientLog("net:offline");
    const onCtrlChange = () => clientLog("sw:controllerchange");

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    navigator.serviceWorker?.addEventListener("controllerchange", onCtrlChange);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("controllerchange", onCtrlChange);
    };
  }, []);

  return <DebugOverlay />;
}

function DebugOverlay() {
  const logs = useSyncExternalStore(subscribeLogs, getLogs, getLogs);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(true);

  // isDebugEnabled legge localStorage: solo dopo il mount (evita mismatch SSR).
  useEffect(() => setEnabled(isDebugEnabled()), []);

  if (!enabled) return null;

  const recent = logs.slice(-25).reverse();
  const t0 = logs.length > 0 ? logs[0].t : Date.now();

  const copyAll = () => {
    const text = logs
      .map((l) => `+${((l.t - t0) / 1000).toFixed(2)}s ${l.ev} ${l.data ? JSON.stringify(l.data) : ""}`)
      .join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const disable = () => {
    try {
      window.localStorage.removeItem("clientlog");
    } catch {
      // ignora
    }
    setEnabled(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        right: 8,
        bottom: 8,
        zIndex: 2147483647,
        background: "rgba(10,10,14,0.92)",
        color: "#e4e4e7",
        border: "1px solid #3f3f46",
        borderRadius: 10,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10,
        maxHeight: open ? "40vh" : 32,
        overflow: "hidden",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          borderBottom: open ? "1px solid #27272a" : "none",
        }}
      >
        <strong style={{ flex: 1 }}>PWA debug ({logs.length})</strong>
        <button onClick={copyAll} style={btn}>copia</button>
        <button onClick={() => setOpen((o) => !o)} style={btn}>{open ? "—" : "+"}</button>
        <button onClick={disable} style={btn}>off</button>
      </div>
      {open && (
        <div style={{ overflowY: "auto", maxHeight: "calc(40vh - 32px)", padding: "4px 8px" }}>
          {recent.map((l, i) => (
            <div key={i} style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              <span style={{ color: "#71717a" }}>
                +{((l.t - t0) / 1000).toFixed(2)}s
              </span>{" "}
              <span style={{ color: "#f29078" }}>{l.ev}</span>{" "}
              {l.data ? JSON.stringify(l.data) : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #3f3f46",
  borderRadius: 6,
  color: "#e4e4e7",
  fontSize: 10,
  padding: "2px 6px",
  cursor: "pointer",
};
