/** Vibrazione breve di conferma dove il browser la supporta (Android);
 *  altrove (iOS Safari, desktop) non fa nulla. */
export function tap(): void {
  try {
    if (typeof navigator !== "undefined") navigator.vibrate?.(8);
  } catch {
    // Alcuni browser lanciano se la vibrazione è bloccata: si ignora.
  }
}
