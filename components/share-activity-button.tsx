"use client";

import { useState } from "react";
import { LoaderCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Condivide l'immagine della corsa con il menu nativo (o la apre per salvarla). */
export function ShareActivityButton({ activityId, title }: { activityId: string; title: string }) {
  const [pending, setPending] = useState(false);

  async function share() {
    setPending(true);
    try {
      const response = await fetch(`/activities/${activityId}/share`);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const file = new File([blob], "zitto-e-corri.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
      } else {
        window.open(URL.createObjectURL(blob), "_blank");
      }
    } catch (error) {
      // L'utente che chiude il foglio di condivisione non è un errore.
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error("share:", error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={share} disabled={pending} aria-label="Condividi" title="Condividi">
      {pending ? <LoaderCircle size={17} className="animate-spin" /> : <Share2 size={17} />}
    </Button>
  );
}
