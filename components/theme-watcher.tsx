"use client";

import { useEffect } from "react";
import { applyThemePrefs, getCurrentPrefs } from "@/lib/theme";

/**
 * Keeps the "auto" mode reactive: when the user changes light/dark
 * at system level, re-applies the palette (only if the saved preference is
 * "auto"). The first paint is already handled by the inline THEME_INIT_SCRIPT in the layout;
 * here we cover only runtime changes. */
export function ThemeWatcher() {
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const prefs = getCurrentPrefs();
      if (prefs.mode === "auto") applyThemePrefs(prefs);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return null;
}
