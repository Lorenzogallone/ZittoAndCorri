"use client";

import { useState, useSyncExternalStore } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Check,
} from "lucide-react";
import {
  ACCENTS,
  ACCENT_ORDER,
  STYLES,
  STYLE_ORDER,
  applyThemePrefs,
  subscribeSystemDark,
  getSystemDarkSnapshot,
  getSystemDarkServerSnapshot,
  type ThemeMode,
  type AccentKey,
  type StyleKey,
  type ThemePrefs,
} from "@/lib/theme";
import { updateThemePrefs } from "./actions";

const MODES: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: "auto", label: "Auto", icon: Monitor },
  { key: "light", label: "Chiaro", icon: Sun },
  { key: "dark", label: "Scuro", icon: Moon },
];

export function ThemeSettings({ initial }: { initial: ThemePrefs }) {
  // Sorgente di verità: il DB (seed iniettato server-side). Qui partiamo dal
  // valore salvato e ottimisticamente applichiamo + persistiamo a ogni cambio.
  const [prefs, setPrefs] = useState<ThemePrefs>(initial);

  const systemDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDarkSnapshot,
    getSystemDarkServerSnapshot,
  );

  const resolvedDark =
    prefs.mode === "dark" || (prefs.mode === "auto" && systemDark);

  function update(patch: Partial<ThemePrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyThemePrefs(next); // applicazione live immediata (+ cache localStorage)
    void updateThemePrefs(next); // persistenza DB best-effort
  }

  return (
    <div id="theme-settings-content" className="divide-y divide-border/60">
      <div className="space-y-2.5 py-4">
        <p className="text-sm font-medium">Tema</p>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-0.5">
          {MODES.map(({ key, label, icon: Icon }) => {
            const active = prefs.mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => update({ mode: key })}
                aria-pressed={active}
                className={`flex items-center justify-center gap-1.5 rounded-[10px] py-1.5 text-[13px] font-medium transition-all ${
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 py-4">
        <p className="text-sm font-medium">Colore</p>
        <div className="flex flex-wrap gap-3">
          {ACCENT_ORDER.map((key) => {
            const active = prefs.accent === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => update({ accent: key as AccentKey })}
                title={ACCENTS[key].label}
                aria-label={ACCENTS[key].label}
                aria-pressed={active}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-90 ${
                  active ? "ring-2 ring-offset-2 ring-offset-card" : ""
                }`}
                style={{
                  background: ACCENTS[key].brand,
                  ...(active ? ({ "--tw-ring-color": ACCENTS[key].brand } as React.CSSProperties) : {}),
                }}
              >
                {active && <Check size={15} className="text-white drop-shadow" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 py-4">
        <p className="text-sm font-medium">Sfondo</p>
        <div className="grid grid-cols-4 gap-2">
          {STYLE_ORDER.map((key) => {
            const active = prefs.style === key;
            const style = STYLES[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => update({ style: key as StyleKey })}
                aria-pressed={active}
                className="flex flex-col items-center gap-1.5 text-xs transition-transform active:scale-95"
              >
                <span
                  className={`flex h-11 w-full items-center justify-center rounded-xl border ${active ? "border-primary ring-1 ring-primary" : "border-border"}`}
                  style={{ background: resolvedDark ? style.preview.dark : style.preview.light }}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: ACCENTS[prefs.accent].brand }} />
                </span>
                <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>{style.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
