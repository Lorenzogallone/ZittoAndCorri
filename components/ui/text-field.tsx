"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Campo di testo libero (chat, note) che Safari non scambia per un indirizzo.
 *
 * Perché non un <textarea>: su iOS il riempimento automatico di Safari
 * classifica da solo i campi del modulo (input e textarea) e il textarea è
 * l'unico controllo che la specifica HTML associa a un indirizzo su più righe
 * (street-address). Il classificatore ignora autocomplete="off", quindi sopra
 * la tastiera comparivano via e indirizzo di casa. Un elemento
 * contenteditable non è un campo di modulo: il riempimento automatico non lo
 * guarda, mentre correttore, maiuscole automatiche, dettatura e suggerimenti
 * di parola restano accesi.
 *
 * Nei <form> il valore arriva al server con un input nascosto (`name`).
 */
interface TextFieldProps {
  id?: string;
  /** Nome del campo nel FormData (input nascosto). */
  name?: string;
  /** Valore controllato. */
  value?: string;
  /** Valore iniziale (non controllato). */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  /** Righe visibili a riposo: altezza minima del campo. */
  rows?: number;
  /** Una riga sola (come un input): Invio non va a capo. */
  singleLine?: boolean;
  enterKeyHint?: React.HTMLAttributes<HTMLDivElement>["enterKeyHint"];
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/** Testo del campo, con gli a capo; un campo svuotato a mano lascia solo un <br>. */
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

  // Il DOM è la fonte del testo mentre si scrive: React lo riscrive solo quando
  // il valore cambia da fuori (campo svuotato dopo l'invio, testo precompilato).
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (element && readText(element) !== current) element.textContent = current;
  }, [current]);

  // Un <label for> non mette a fuoco un elemento contenteditable: lo fa questo.
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
    // Svuotato a mano: niente <br> residuo, così torna il segnaposto.
    if (!text && element.innerHTML) element.innerHTML = "";
    update(text);
  }

  // Incolla solo testo semplice anche dove plaintext-only non c'è.
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
