import type { KeyboardEvent } from "react";

const FIELDS =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])';

/**
 * Da mettere su `<form onKeyDown>`: fa rispettare `enterKeyHint` al tasto Invio
 * della tastiera. "next" porta al campo visibile successivo (senza, Invio
 * invierebbe il form a metà compilazione); "done" chiude la tastiera. Gli altri
 * campi (e le textarea, dove Invio va a capo) restano come sono.
 */
export function handleEnterKeyHint(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const hint = target.enterKeyHint;
  if (hint !== "next" && hint !== "done") return;
  event.preventDefault();
  if (hint === "done") {
    target.blur();
    return;
  }
  const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FIELDS)).filter(
    (field) => field.getClientRects().length > 0,
  );
  const next = fields[fields.indexOf(target) + 1];
  if (next) next.focus();
  else target.blur();
}
