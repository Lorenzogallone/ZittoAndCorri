"use client";

import { useEffect } from "react";
import { applyThemePrefs, readThemePrefs } from "@/lib/theme";

/**
 * Tiene reattiva la modalità "automatica": quando l'utente cambia chiaro/scuro
 * a livello di sistema, ri-applica la palette (solo se la preferenza salvata è
 * "auto"). Il primo paint è già gestito dal THEME_INIT_SCRIPT inline nel layout;
 * qui copriamo solo i cambi a runtime. */
export function ThemeWatcher() {
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const prefs = readThemePrefs();
      if (prefs.mode === "auto") applyThemePrefs(prefs);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return null;
}
