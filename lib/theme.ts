// Client-side theming system.
//
// Three independent preferences, saved in localStorage (per-device, no
// flash, works offline and before auth):
//   - mode   → auto | light | dark   (auto = follows the system, as before)
//   - accent → main (brand) colour among curated presets
//   - style  → full theme preset (background shade + vibe)
//
// The palette's truth is applied as inline CSS variables on <html>
// (maximum specificity, beats any media query). The same code is used
// by both the inline THEME_INIT_SCRIPT (pre-hydration, anti-FOUC) and the
// settings client component, so there's no logic duplication.

export type ThemeMode = "auto" | "light" | "dark";
export type AccentKey = "coral" | "amber" | "green" | "blue" | "violet" | "pink";
export type StyleKey = "warm" | "night" | "ocean" | "forest";

export interface ThemePrefs {
  mode: ThemeMode;
  accent: AccentKey;
  style: StyleKey;
}

export const STORAGE_KEYS = {
  mode: "zc-theme-mode",
  accent: "zc-theme-accent",
  style: "zc-theme-style",
} as const;

export const DEFAULT_PREFS: ThemePrefs = {
  mode: "auto",
  accent: "coral",
  style: "warm",
};

// ── Main colours (accent / brand) ──────────────────────────────────────────
// Names and descriptions of colours and styles: namespace "labels" (theme.accent.*, theme.style.*).
export interface AccentDef {
  /** Brand oklch value: used for --primary, --ring, --brand, glow… */
  brand: string;
}

export const ACCENTS: Record<AccentKey, AccentDef> = {
  // The "coral" key stays for saved preferences: it's now the brand orange.
  coral: { brand: "oklch(0.662 0.221 36.9)" },
  amber: { brand: "oklch(0.72 0.15 70)" },
  green: { brand: "oklch(0.66 0.15 155)" },
  blue: { brand: "oklch(0.60 0.16 250)" },
  violet: { brand: "oklch(0.58 0.18 295)" },
  pink: { brand: "oklch(0.65 0.2 355)" },
};

export const ACCENT_ORDER: AccentKey[] = [
  "coral",
  "amber",
  "green",
  "blue",
  "violet",
  "pink",
];

// ── Styles (full theme presets: background shade) ───────────────────────────
// Neutral keys are set inline; "warm" is the historical default and is
// defined entirely in CSS, so here it's `null` (no override → the
// globals.css variables are used, palette identical to before).

/** Names of all neutral variables managed by the styles (so they can be cleared
 *  when going back to the "warm" style). */
export const NEUTRAL_KEYS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--input",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--hero",
  "--hero-foreground",
  "--hero-muted",
  "--surface-2",
] as const;

/** Builds the neutral variables map for a given hue/chroma, using the
 *  same "lightness scale" as the warm design (so only the tint changes). */
function neutrals(
  hue: number,
  c: number,
  dark: boolean,
): Record<string, string> {
  if (!dark) {
    return {
      "--background": `oklch(0.985 ${c * 0.6} ${hue})`,
      "--foreground": `oklch(0.2 0.006 ${hue})`,
      "--card": `oklch(1 0 0)`,
      "--card-foreground": `oklch(0.2 0.006 ${hue})`,
      "--popover": `oklch(1 0 0)`,
      "--popover-foreground": `oklch(0.2 0.006 ${hue})`,
      "--secondary": `oklch(0.96 ${c} ${hue})`,
      "--secondary-foreground": `oklch(0.3 0.006 ${hue})`,
      "--muted": `oklch(0.955 ${c} ${hue})`,
      "--muted-foreground": `oklch(0.52 0.012 ${hue})`,
      "--accent": `oklch(0.95 ${c * 1.6} ${hue})`,
      "--accent-foreground": `oklch(0.2 0.006 ${hue})`,
      "--border": `oklch(0.915 ${c} ${hue})`,
      "--input": `oklch(0.915 ${c} ${hue})`,
      "--sidebar": `oklch(1 0 0)`,
      "--sidebar-foreground": `oklch(0.2 0.006 ${hue})`,
      "--sidebar-accent": `oklch(0.96 ${c} ${hue})`,
      "--sidebar-accent-foreground": `oklch(0.2 0.006 ${hue})`,
      "--sidebar-border": `oklch(0.915 ${c} ${hue})`,
      "--hero": `oklch(1 0 0)`,
      "--hero-foreground": `oklch(0.2 0.006 ${hue})`,
      "--hero-muted": `oklch(0.52 0.012 ${hue})`,
      "--surface-2": `oklch(0.965 ${c} ${hue})`,
    };
  }
  return {
    "--background": `oklch(0.175 ${c} ${hue})`,
    "--foreground": `oklch(0.96 0.004 ${hue})`,
    "--card": `oklch(0.225 ${c} ${hue})`,
    "--card-foreground": `oklch(0.96 0.004 ${hue})`,
    "--popover": `oklch(0.25 ${c} ${hue})`,
    "--popover-foreground": `oklch(0.96 0.004 ${hue})`,
    "--secondary": `oklch(0.27 ${c} ${hue})`,
    "--secondary-foreground": `oklch(0.88 0.006 ${hue})`,
    "--muted": `oklch(0.27 ${c} ${hue})`,
    "--muted-foreground": `oklch(0.68 0.014 ${hue})`,
    "--accent": `oklch(0.26 ${c * 1.2} ${hue})`,
    "--accent-foreground": `oklch(0.96 0.004 ${hue})`,
    "--border": `oklch(0.3 ${c} ${hue})`,
    "--input": `oklch(0.3 ${c} ${hue})`,
    "--sidebar": `oklch(0.225 ${c} ${hue})`,
    "--sidebar-foreground": `oklch(0.96 0.004 ${hue})`,
    "--sidebar-accent": `oklch(0.27 ${c} ${hue})`,
    "--sidebar-accent-foreground": `oklch(0.96 0.004 ${hue})`,
    "--sidebar-border": `oklch(0.3 ${c} ${hue})`,
    "--hero": `oklch(0.27 ${c} ${hue})`,
    "--hero-foreground": `oklch(0.97 0.004 ${hue})`,
    "--hero-muted": `oklch(0.7 0.014 ${hue})`,
    "--surface-2": `oklch(0.28 ${c} ${hue})`,
  };
}

export interface StyleDef {
  /** Neutral variables for light/dark, or null = use the CSS (warm). */
  vars: { light: Record<string, string>; dark: Record<string, string> } | null;
  /** Preview colours for the settings UI (bg, card). */
  preview: { light: string; dark: string };
}

export const STYLES: Record<StyleKey, StyleDef> = {
  // The "warm" key stays for compatibility with saved preferences.
  warm: {
    vars: null,
    preview: { light: "oklch(0.977 0.004 286)", dark: "oklch(0.175 0 0)" },
  },
  night: {
    vars: { light: neutrals(280, 0.008, false), dark: neutrals(280, 0.016, true) },
    preview: { light: "oklch(0.97 0.01 280)", dark: "oklch(0.14 0.02 280)" },
  },
  ocean: {
    vars: { light: neutrals(240, 0.012, false), dark: neutrals(240, 0.026, true) },
    preview: { light: "oklch(0.97 0.014 240)", dark: "oklch(0.14 0.03 240)" },
  },
  forest: {
    vars: { light: neutrals(155, 0.012, false), dark: neutrals(155, 0.02, true) },
    preview: { light: "oklch(0.97 0.014 155)", dark: "oklch(0.14 0.024 155)" },
  },
};

export const STYLE_ORDER: StyleKey[] = ["warm", "night", "ocean", "forest"];

// ── Application ─────────────────────────────────────────────────────────────

/**
 * Applies the preferences to the document: toggles the .dark/.light classes (for
 * the Tailwind `dark:` utilities and the map's theme detection) and inline
 * CSS variables for accent and style. Pure, self-contained function (takes the
 * tables as arguments) so it can be serialized into THEME_INIT_SCRIPT.
 */
export function applyThemeToDocument(
  doc: Document,
  prefs: ThemePrefs,
  accents: Record<string, AccentDef>,
  styles: Record<string, StyleDef>,
  neutralKeys: readonly string[],
) {
  const el = doc.documentElement;
  const win = doc.defaultView || window;

  const systemDark =
    !!win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark =
    prefs.mode === "dark" || (prefs.mode === "auto" && systemDark);

  el.classList.toggle("dark", dark);
  el.classList.toggle("light", prefs.mode === "light");

  // Accent / brand
  const accent = accents[prefs.accent] || accents.coral;
  const brand = accent.brand;
  el.style.setProperty("--brand", brand);
  el.style.setProperty("--primary", brand);
  el.style.setProperty("--ring", brand);
  el.style.setProperty("--sidebar-primary", brand);
  el.style.setProperty("--sidebar-ring", brand);
  el.style.setProperty("--chart-1", brand);

  // Style: always clear the inline neutrals, then reapply if not "warm".
  for (let i = 0; i < neutralKeys.length; i++) {
    el.style.removeProperty(neutralKeys[i]);
  }
  const style = styles[prefs.style] || styles.warm;
  if (style.vars) {
    const set = dark ? style.vars.dark : style.vars.light;
    for (const k in set) el.style.setProperty(k, set[k]);
  }

  // iOS PWA status bar ("default" style, full): takes its colour from the
  // theme-color meta. We align it to the background of the theme chosen in the app, not
  // just the system light/dark. The canvas converts oklch to hex.
  try {
    const bg = win.getComputedStyle(el).getPropertyValue("--background").trim();
    const ctx = bg ? doc.createElement("canvas").getContext("2d") : null;
    if (ctx) {
      ctx.fillStyle = "#010203";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1, 1);
      const px = ctx.getImageData(0, 0, 1, 1).data;
      const hex = "#" + [px[0], px[1], px[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
      if (hex !== "#010203") {
        const metas = doc.querySelectorAll('meta[name="theme-color"]');
        for (let i = 0; i < metas.length; i++) {
          metas[i].setAttribute("content", hex);
          metas[i].removeAttribute("media");
        }
      }
    }
  } catch {
    // Without canvas, the layout's system theme-color stays.
  }
}

/** Convenient browser-side wrapper: applies to the DOM, updates the localStorage cache
 *  (for offline) and the global used by the watcher. */
export function applyThemePrefs(prefs: ThemePrefs) {
  if (typeof document === "undefined") return;
  applyThemeToDocument(document, prefs, ACCENTS, STYLES, NEUTRAL_KEYS);
  saveThemePref("mode", prefs.mode);
  saveThemePref("accent", prefs.accent);
  saveThemePref("style", prefs.style);
  (window as unknown as { __zcThemePrefs?: ThemePrefs }).__zcThemePrefs = prefs;
}

/** Current preferences known to the client: the global is set by the init script
 *  (seeded from the DB) and by applyThemePrefs; falls back to localStorage. */
export function getCurrentPrefs(): ThemePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  const g = (window as unknown as { __zcThemePrefs?: ThemePrefs }).__zcThemePrefs;
  return g ?? readThemePrefs();
}

/** Normalizes an unknown object into valid ThemePrefs (used by the server). */
export function sanitizePrefs(input: {
  mode?: string | null;
  accent?: string | null;
  style?: string | null;
}): ThemePrefs {
  const mode = input.mode as ThemeMode;
  const accent = input.accent as AccentKey;
  const style = input.style as StyleKey;
  return {
    mode: mode === "light" || mode === "dark" || mode === "auto" ? mode : DEFAULT_PREFS.mode,
    accent: accent && ACCENTS[accent] ? accent : DEFAULT_PREFS.accent,
    style: style && STYLES[style] ? style : DEFAULT_PREFS.style,
  };
}

// Subscription to the system light/dark preference (for previews).
export function subscribeSystemDark(cb: () => void): () => void {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

export function getSystemDarkSnapshot(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getSystemDarkServerSnapshot(): boolean {
  return false;
}

// ── Inline anti-FOUC script ─────────────────────────────────────────────────
// Built server-side with the DB seed (`serverPrefs`): it's the source of
// truth, synced across devices. If absent (logged-out user, failed query/
// offline, columns not yet migrated) it falls back to the localStorage cache
// and finally to the defaults. In any case it updates the localStorage cache
// and applies the palette BEFORE the first paint.
export function themeInitScript(serverPrefs: ThemePrefs | null): string {
  return `(function(){try{
var ACCENTS=${JSON.stringify(ACCENTS)};
var STYLES=${JSON.stringify(STYLES)};
var NK=${JSON.stringify(NEUTRAL_KEYS)};
var K=${JSON.stringify(STORAGE_KEYS)};
var server=${JSON.stringify(serverPrefs)};
var apply=${applyThemeToDocument.toString()};
var ls=window.localStorage;
var prefs=server||{mode:ls.getItem(K.mode)||"auto",accent:ls.getItem(K.accent)||"coral",style:ls.getItem(K.style)||"warm"};
if(["auto","light","dark"].indexOf(prefs.mode)<0)prefs.mode="auto";
if(!ACCENTS[prefs.accent])prefs.accent="coral";
if(!STYLES[prefs.style])prefs.style="warm";
try{ls.setItem(K.mode,prefs.mode);ls.setItem(K.accent,prefs.accent);ls.setItem(K.style,prefs.style);}catch(e){}
window.__zcThemePrefs=prefs;
apply(document,prefs,ACCENTS,STYLES,NK);
}catch(e){}})();`;
}

/** Reads the saved preferences (with fallback to defaults). SSR-safe. */
export function readThemePrefs(): ThemePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const ls = window.localStorage;
    const mode = (ls.getItem(STORAGE_KEYS.mode) as ThemeMode) || DEFAULT_PREFS.mode;
    const accent =
      (ls.getItem(STORAGE_KEYS.accent) as AccentKey) || DEFAULT_PREFS.accent;
    const style = (ls.getItem(STORAGE_KEYS.style) as StyleKey) || DEFAULT_PREFS.style;
    return {
      mode: mode in { auto: 1, light: 1, dark: 1 } ? mode : DEFAULT_PREFS.mode,
      accent: ACCENTS[accent] ? accent : DEFAULT_PREFS.accent,
      style: STYLES[style] ? style : DEFAULT_PREFS.style,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Saves a single preference. */
export function saveThemePref<K extends keyof ThemePrefs>(
  key: K,
  value: ThemePrefs[K],
) {
  try {
    window.localStorage.setItem(STORAGE_KEYS[key], value);
  } catch {
    // localStorage unavailable: the choice only holds for this session.
  }
}

