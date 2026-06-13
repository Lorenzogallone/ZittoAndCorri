// Sistema di temizzazione lato client.
//
// Tre preferenze indipendenti, salvate in localStorage (per-dispositivo, nessun
// flash, funziona offline e prima dell'auth):
//   - mode   → auto | light | dark   (auto = segue il sistema, come prima)
//   - accent → colore principale (brand) tra preset curati
//   - style  → preset di tema completo (sfumatura di sfondo + vibe)
//
// La verità della palette è applicata come variabili CSS inline sull'<html>
// (specificità massima, batte ogni media query). Lo stesso codice viene usato
// sia dal THEME_INIT_SCRIPT inline (pre-idratazione, anti-FOUC) sia dal
// componente client delle impostazioni, così non c'è duplicazione di logica.

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

// ── Colori principali (accento / brand) ────────────────────────────────────
export interface AccentDef {
  label: string;
  /** Valore oklch del brand: usato per --primary, --ring, --brand, glow… */
  brand: string;
}

export const ACCENTS: Record<AccentKey, AccentDef> = {
  coral: { label: "Coral", brand: "oklch(0.68 0.16 30)" },
  amber: { label: "Ambra", brand: "oklch(0.72 0.15 70)" },
  green: { label: "Verde", brand: "oklch(0.66 0.15 155)" },
  blue: { label: "Blu", brand: "oklch(0.60 0.16 250)" },
  violet: { label: "Viola", brand: "oklch(0.58 0.18 295)" },
  pink: { label: "Rosa", brand: "oklch(0.65 0.2 355)" },
};

export const ACCENT_ORDER: AccentKey[] = [
  "coral",
  "amber",
  "green",
  "blue",
  "violet",
  "pink",
];

// ── Stili (preset di tema completi: sfumatura di sfondo) ────────────────────
// Le chiavi neutre vengono impostate inline; "warm" è il default storico ed è
// definito interamente nel CSS, quindi qui vale `null` (nessun override → si
// usano le variabili di globals.css, palette identica a prima).

/** Nomi di tutte le variabili neutre gestite dagli stili (per poterle pulire
 *  quando si torna allo stile "warm"). */
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
  "--glass-bg",
  "--glass-strong-bg",
] as const;

/** Costruisce la mappa di variabili neutre per un dato hue/chroma, usando la
 *  stessa "scala di luminosità" del design warm (così cambia solo la tinta). */
function neutrals(
  hue: number,
  c: number,
  dark: boolean,
): Record<string, string> {
  if (!dark) {
    return {
      "--background": `oklch(0.97 ${c} ${hue})`,
      "--foreground": `oklch(0.25 0.01 ${hue})`,
      "--card": `oklch(0.955 ${c * 1.3} ${hue})`,
      "--card-foreground": `oklch(0.25 0.01 ${hue})`,
      "--popover": `oklch(0.955 ${c * 1.3} ${hue})`,
      "--popover-foreground": `oklch(0.25 0.01 ${hue})`,
      "--secondary": `oklch(0.925 ${c * 1.3} ${hue})`,
      "--secondary-foreground": `oklch(0.35 0.01 ${hue})`,
      "--muted": `oklch(0.905 ${c} ${hue})`,
      "--muted-foreground": `oklch(0.45 0.015 ${hue})`,
      "--accent": `oklch(0.94 ${c * 1.6} ${hue})`,
      "--accent-foreground": `oklch(0.25 0.01 ${hue})`,
      "--border": `oklch(0.855 ${c} ${hue})`,
      "--input": `oklch(0.905 ${c} ${hue})`,
      "--sidebar": `oklch(0.955 ${c * 1.3} ${hue})`,
      "--sidebar-foreground": `oklch(0.25 0.01 ${hue})`,
      "--sidebar-accent": `oklch(0.925 ${c * 1.3} ${hue})`,
      "--sidebar-accent-foreground": `oklch(0.25 0.01 ${hue})`,
      "--sidebar-border": `oklch(0.855 ${c} ${hue})`,
      "--glass-bg": `oklch(0.97 ${c} ${hue} / 0.7)`,
      "--glass-strong-bg": `oklch(0.97 ${c} ${hue} / 0.85)`,
    };
  }
  return {
    "--background": `oklch(0.15 ${c} ${hue})`,
    "--foreground": `oklch(0.93 0.008 ${hue})`,
    "--card": `oklch(0.18 ${c} ${hue})`,
    "--card-foreground": `oklch(0.93 0.008 ${hue})`,
    "--popover": `oklch(0.18 ${c} ${hue})`,
    "--popover-foreground": `oklch(0.93 0.008 ${hue})`,
    "--secondary": `oklch(0.22 ${c} ${hue})`,
    "--secondary-foreground": `oklch(0.88 0.008 ${hue})`,
    "--muted": `oklch(0.2 ${c} ${hue})`,
    "--muted-foreground": `oklch(0.55 0.015 ${hue})`,
    "--accent": `oklch(0.22 ${c * 1.1} ${hue})`,
    "--accent-foreground": `oklch(0.93 0.008 ${hue})`,
    "--border": `oklch(0.25 ${c} ${hue})`,
    "--input": `oklch(0.22 ${c} ${hue})`,
    "--sidebar": `oklch(0.16 ${c} ${hue})`,
    "--sidebar-foreground": `oklch(0.93 0.008 ${hue})`,
    "--sidebar-accent": `oklch(0.22 ${c} ${hue})`,
    "--sidebar-accent-foreground": `oklch(0.93 0.008 ${hue})`,
    "--sidebar-border": `oklch(0.25 ${c} ${hue})`,
    "--glass-bg": `oklch(0.17 ${c} ${hue} / 0.7)`,
    "--glass-strong-bg": `oklch(0.15 ${c} ${hue} / 0.85)`,
  };
}

export interface StyleDef {
  label: string;
  description: string;
  /** Variabili neutre per chiaro/scuro, oppure null = usa il CSS (warm). */
  vars: { light: Record<string, string>; dark: Record<string, string> } | null;
  /** Colori di anteprima per la UI delle impostazioni (bg, card). */
  preview: { light: string; dark: string };
}

export const STYLES: Record<StyleKey, StyleDef> = {
  warm: {
    label: "Caldo",
    description: "Crema e navy — il look originale.",
    vars: null,
    preview: { light: "oklch(0.97 0.01 80)", dark: "oklch(0.15 0.022 263)" },
  },
  night: {
    label: "Notte",
    description: "Neutro freddo, pulito e minimale.",
    vars: { light: neutrals(280, 0.006, false), dark: neutrals(280, 0.014, true) },
    preview: { light: "oklch(0.97 0.006 280)", dark: "oklch(0.15 0.014 280)" },
  },
  ocean: {
    label: "Oceano",
    description: "Grigio-blu fresco e profondo.",
    vars: { light: neutrals(240, 0.012, false), dark: neutrals(240, 0.026, true) },
    preview: { light: "oklch(0.97 0.012 240)", dark: "oklch(0.15 0.026 240)" },
  },
  forest: {
    label: "Foresta",
    description: "Verde-salvia naturale e calmo.",
    vars: { light: neutrals(155, 0.012, false), dark: neutrals(155, 0.02, true) },
    preview: { light: "oklch(0.97 0.012 155)", dark: "oklch(0.15 0.02 155)" },
  },
};

export const STYLE_ORDER: StyleKey[] = ["warm", "night", "ocean", "forest"];

// ── Applicazione ────────────────────────────────────────────────────────────

/**
 * Applica le preferenze al documento: toggle delle classi .dark/.light (per le
 * utility Tailwind `dark:` e il rilevamento del tema della mappa) e variabili
 * CSS inline per accento e stile. Funzione pura e autocontenuta (riceve le
 * tabelle come argomenti) così può essere serializzata nel THEME_INIT_SCRIPT.
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

  // Accento / brand
  const accent = accents[prefs.accent] || accents.coral;
  const brand = accent.brand;
  el.style.setProperty("--brand", brand);
  el.style.setProperty("--primary", brand);
  el.style.setProperty("--ring", brand);
  el.style.setProperty("--sidebar-primary", brand);
  el.style.setProperty("--sidebar-ring", brand);
  el.style.setProperty("--chart-1", brand);

  // Stile: pulisci sempre le neutre inline, poi riapplica se non è "warm".
  for (let i = 0; i < neutralKeys.length; i++) {
    el.style.removeProperty(neutralKeys[i]);
  }
  const style = styles[prefs.style] || styles.warm;
  if (style.vars) {
    const set = dark ? style.vars.dark : style.vars.light;
    for (const k in set) el.style.setProperty(k, set[k]);
  }
}

/** Wrapper comodo lato browser: applica al DOM, aggiorna la cache localStorage
 *  (per l'offline) e il global usato dal watcher. */
export function applyThemePrefs(prefs: ThemePrefs) {
  if (typeof document === "undefined") return;
  applyThemeToDocument(document, prefs, ACCENTS, STYLES, NEUTRAL_KEYS);
  saveThemePref("mode", prefs.mode);
  saveThemePref("accent", prefs.accent);
  saveThemePref("style", prefs.style);
  (window as unknown as { __zcThemePrefs?: ThemePrefs }).__zcThemePrefs = prefs;
}

/** Preferenze correnti note al client: il global è impostato dall'init script
 *  (seed dal DB) e da applyThemePrefs; fallback a localStorage. */
export function getCurrentPrefs(): ThemePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  const g = (window as unknown as { __zcThemePrefs?: ThemePrefs }).__zcThemePrefs;
  return g ?? readThemePrefs();
}

/** Normalizza un oggetto sconosciuto in ThemePrefs valide (usata dal server). */
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

// Sottoscrizione alla preferenza di sistema chiaro/scuro (per le anteprime).
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

// ── Script inline anti-FOUC ──────────────────────────────────────────────────
// Costruito server-side col seed dal DB (`serverPrefs`): è la sorgente di
// verità, sincronizzata tra dispositivi. Se assente (utente non loggato, query
// fallita/offline, colonne non ancora migrate) si ripiega sulla cache
// localStorage e infine sui default. In ogni caso aggiorna la cache localStorage
// e applica la palette PRIMA del primo paint.
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

/** Legge le preferenze salvate (con fallback ai default). SSR-safe. */
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

/** Salva una singola preferenza. */
export function saveThemePref<K extends keyof ThemePrefs>(
  key: K,
  value: ThemePrefs[K],
) {
  try {
    window.localStorage.setItem(STORAGE_KEYS[key], value);
  } catch {
    // localStorage non disponibile: la scelta vale solo per questa sessione.
  }
}

