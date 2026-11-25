"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Free text field (chat, notes) that Safari does not mistake for an address.
 *
 * Why not a <textarea>: on iOS Safari autofill
 * classifies form fields (input and textarea) on its own, and the textarea is
 * the only control the HTML spec associates with a multi-line address
 * (street-address). The classifier ignores autocomplete="off", so above
 * the keyboard the street and home address appeared. A contenteditable
 * element is not a form field: autofill does not look at it,
 * while spellcheck, auto-capitalisation, dictation and word suggestions
 * stay on.
 *
 * In <form>s the value reaches the server through a hidden input (`name`).
 */
interface TextFieldProps {
  id?: string;
  /** Field name in the FormData (hidden input). */
  name?: string;
  /** Controlled value. */
  value?: string;
  /** Initial value (uncontrolled). */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  /** Visible rows at rest: minimum field height. */
  rows?: number;
  /** A single line (like an input): Enter does not wrap. */
  singleLine?: boolean;
  enterKeyHint?: React.HTMLAttributes<HTMLDivElement>["enterKeyHint"];
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/** Field text, with line breaks; a field cleared by hand leaves only a <br>. */
function readText(element: HTMLElement): string {
  const text = element.innerText.replace(/ /g, " ");
  return text === "\n" ? "" : text;
}

function placeCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export const TextField = React.forwardRef<HTMLDivElement, TextFieldProps>(function TextField(
  {
    id,
    name,
    value,
    defaultValue = "",
    onValueChange,
    onKeyDown,
    placeholder,
    disabled = false,
    maxLength,
    rows = 2,
    singleLine = false,
    enterKeyHint,
    className,
    ...aria
  },
  forwardedRef,
) {
  const controlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue);
  const current = controlled ? value : internal;
  const ref = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);

  // The DOM is the source of the text while typing: React rewrites it only when
  // the value changes from outside (field cleared after sending, prefilled text).
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (element && readText(element) !== current) element.textContent = current;
  }, [current]);

  // A <label for> does not focus a contenteditable element: this does.
  React.useEffect(() => {
    if (!id) return;
    const labels = Array.from(document.querySelectorAll<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`));
    const focus = () => {
      const element = ref.current;
      if (!element || disabled) return;
      element.focus();
      placeCaretAtEnd(element);
    };
    labels.forEach((label) => label.addEventListener("click", focus));
    return () => labels.forEach((label) => label.removeEventListener("click", focus));
  }, [id, disabled]);

  function update(next: string) {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  }

  function handleInput(event: React.FormEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    let text = readText(element);
    if (singleLine && text.includes("\n")) {
      text = text.replace(/\n+/g, " ").trim();
      element.textContent = text;
      placeCaretAtEnd(element);
    }
    if (maxLength !== undefined && text.length > maxLength) {
      text = text.slice(0, maxLength);
      element.textContent = text;
      placeCaretAtEnd(element);
    }
    // Cleared by hand: no leftover <br>, so the placeholder returns.
    if (!text && element.innerHTML) element.innerHTML = "";
    update(text);
  }

  // Paste plain text only, even where plaintext-only is unavailable.
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const raw = event.clipboardData.getData("text/plain");
    const text = singleLine ? raw.replace(/\s*\n\s*/g, " ") : raw;
    document.execCommand("insertText", false, text);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={ref}
        id={id}
        role="textbox"
        aria-multiline={!singleLine}
        aria-disabled={disabled || undefined}
        aria-placeholder={placeholder}
        {...aria}
        contentEditable={disabled ? false : "plaintext-only"}
        suppressContentEditableWarning
        tabIndex={disabled ? -1 : 0}
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
        inputMode="text"
        enterKeyHint={enterKeyHint}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (singleLine && event.key === "Enter" && !event.defaultPrevented) event.preventDefault();
        }}
        style={singleLine ? undefined : { minHeight: `calc(${rows} * 1.5em + 1.5rem)` }}
        className={cn(
          "w-full cursor-text overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-xl border border-border bg-muted px-3.5 py-3 text-base leading-normal text-foreground outline-none transition-all duration-200 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20",
          singleLine && "flex h-11 items-center overflow-x-auto overflow-y-hidden whitespace-nowrap py-2",
          disabled && "cursor-not-allowed opacity-40",
          className,
        )}
      />
      {!current && placeholder && (
        <span aria-hidden="true" className={cn(
            "pointer-events-none absolute inset-x-0 top-0 overflow-hidden px-3.5 text-base leading-normal text-muted-foreground",
            singleLine ? "flex h-11 items-center truncate" : "py-3",
          )}>
          {placeholder}
        </span>
      )}
      {name && <input type="hidden" name={name} value={current} />}
    </div>
  );
});
