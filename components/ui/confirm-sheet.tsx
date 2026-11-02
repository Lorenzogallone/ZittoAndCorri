"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Verbo specifico sul pulsante distruttivo: "Scollega", "Elimina", "Rimuovi"… */
  action: string;
  cancel?: string;
}

interface ConfirmSheetProps extends ConfirmOptions {
  open: boolean;
  onResolve: (confirmed: boolean) => void;
  /** Chiamato a fine animazione di uscita: il chiamante può smontare lo sheet. */
  onExited?: () => void;
}

/** Durata dell'uscita; con reduced motion le transizioni sono spente. */
const EXIT_MS = 260;

/**
 * Foglio di conferma dal basso (al posto di window.confirm, che su iOS
 * standalone apre un alert di sistema fuori tema). Entrata con @starting-style
 * (`starting:`), uscita con transizione su transform+opacity: le transizioni
 * CSS ripartono dal valore corrente, quindi aprire/chiudere a metà non salta.
 */
export function ConfirmSheet({
  open,
  title,
  description,
  action,
  cancel = "Annulla",
  onResolve,
  onExited,
}: ConfirmSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  });

  // Focus sul pulsante sicuro all'apertura, ritorno al trigger alla chiusura.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, [open]);

  // Blocco dello scroll della pagina finché lo sheet è aperto.
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  // Escape chiude; Tab resta dentro lo sheet (due soli pulsanti).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve(false);
        return;
      }
      if (event.key !== "Tab") return;
      const first = actionRef.current;
      const last = cancelRef.current;
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onResolve]);

  // Smontaggio dopo l'uscita: timer al posto di transitionend, che non arriva
  // con reduced motion (transizioni spente).
  useEffect(() => {
    if (open) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => onExitedRef.current?.(), reduced ? 0 : EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (typeof document === "undefined") return null;

  // Portal sul body: un antenato con backdrop-filter o transform intrappolerebbe
  // il pannello fixed.
  return createPortal(
    <div className={cn("fixed inset-0 z-[80]", !open && "pointer-events-none")}>
      <div
        aria-hidden="true"
        onClick={() => onResolve(false)}
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg overscroll-contain rounded-t-3xl border-t border-border bg-background px-5 pt-3",
          "transition-[transform,opacity] duration-[260ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          "starting:translate-y-full starting:opacity-0 motion-reduce:starting:translate-y-0",
          open ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 motion-reduce:translate-y-0",
        )}
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/25" />
        <h2 id={titleId} className="text-heading font-semibold text-balance">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-1.5 text-body text-muted-foreground text-pretty">
            {description}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <Button
            ref={actionRef}
            type="button"
            variant="destructive"
            size="lg"
            className="w-full"
            onClick={() => onResolve(true)}
          >
            {action}
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            size="lg"
            className="w-full text-foreground"
            onClick={() => onResolve(false)}
          >
            {cancel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

/**
 * `const { confirm, element } = useConfirm();`
 * `if (!(await confirm({ title, description, action: "Scollega" }))) return;`
 * Renderizzare `{element}` nel componente.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  element: ReactNode;
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<PendingConfirm["resolve"] | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    // Una richiesta ancora aperta viene annullata da quella nuova.
    resolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ options, resolve });
      setOpen(true);
    });
  }, []);

  const onResolve = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setOpen(false);
  }, []);

  const onExited = useCallback(() => setPending(null), []);

  // Smontaggio del componente con una conferma in sospeso: risponde "no".
  useEffect(() => () => resolveRef.current?.(false), []);

  const element = pending ? (
    <ConfirmSheet {...pending.options} open={open} onResolve={onResolve} onExited={onExited} />
  ) : null;

  return { confirm, element };
}
