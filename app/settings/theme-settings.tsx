"use client";

import { useState, useSyncExternalStore } from "react";
import {
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
  ChevronDown,
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
  const [isOpen, setIsOpen] = useState(false);
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
    <div className="overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="theme-settings-content"
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/20"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Palette size={18} />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Aspetto</h2>
        </div>
        <ChevronDown
          size={18}
          className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div id="theme-settings-content" className="space-y-6 border-t border-border/60 px-5 pb-5 pt-4">
          {/* Modalità */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Modalità
            </p>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/30 p-1">
              {MODES.map(({ key, label, icon: Icon }) => {
                const active = prefs.mode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => update({ mode: key })}
                    aria-pressed={active}
                    className={`flex flex-col items-center justify-center gap-1 rounded-lg py-2.5 text-xs font-medium transition-all ${
                      active
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
              In automatico l&apos;app segue chiaro/scuro del tuo dispositivo.
            </p>
          </div>

          {/* Colore principale */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Colore principale
            </p>
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
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-90 ${
                      active
                        ? "ring-2 ring-offset-2 ring-offset-card"
                        : "ring-1 ring-black/10 dark:ring-white/10"
                    }`}
                    style={{
                      background: ACCENTS[key].brand,
                      ...(active
                        ? ({ "--tw-ring-color": ACCENTS[key].brand } as React.CSSProperties)
                        : {}),
                    }}
                  >
                    {active && <Check size={16} className="text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stile (preset di tema) */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Stile
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {STYLE_ORDER.map((key) => {
                const active = prefs.style === key;
                const s = STYLES[key];
                const bg = resolvedDark ? s.preview.dark : s.preview.light;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => update({ style: key as StyleKey })}
                    aria-pressed={active}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
                      active
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-border/80"
                    }`}
                  >
                    <span
                      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/10 dark:border-white/10"
                      style={{ background: bg }}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ background: ACCENTS[prefs.accent].brand }}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {s.label}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {s.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
