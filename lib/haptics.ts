/** Short confirmation vibration where the browser supports it (Android);
    *  elsewhere (iOS Safari, desktop) it does nothing. */
export function tap(): void {
  try {
    if (typeof navigator !== "undefined") navigator.vibrate?.(8);
  } catch {
    // Some browsers throw if vibration is blocked: ignored.
  }
}
