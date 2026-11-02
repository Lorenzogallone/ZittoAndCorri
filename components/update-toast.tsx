"use client";

import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpdateToastProps {
  visible: boolean;
  updating: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
}

/**
 * Toast "Nuova versione pronta" sopra la tab bar. Non blocca: niente overlay,
 * il contenitore fisso lascia passare i tocchi fuori dalla pillola. La regione
 * aria-live resta sempre montata, così l'arrivo del messaggio viene annunciato.
 */
export function UpdateToast({ visible, updating, onUpdate, onDismiss }: UpdateToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[70] px-4"
      // Sopra la tab bar (~4.5rem di pillola + la sua quota di safe area).
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.5rem)" }}
    >
      {visible && (
        <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-card/95 py-2 pl-4 pr-2 text-card-foreground shadow-lg ring-1 ring-border/60 backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">Nuova versione pronta</p>
          <Button type="button" size="sm" disabled={updating} onClick={onUpdate}>
            <RefreshCw className={updating ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />
            {updating ? "Aggiorno…" : "Aggiorna"}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Più tardi">
            <X aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
