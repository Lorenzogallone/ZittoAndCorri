import type { KeyboardEvent } from "react";

const FIELDS =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])';

/**
 * To put on `<form onKeyDown>`: makes the keyboard's Enter key honor
 * `enterKeyHint`. "next" moves to the next visible field (without it, Enter
 * would submit the form midway); "done" closes the keyboard. Other
 * fields (and textareas, where Enter adds a newline) stay as they are.
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
