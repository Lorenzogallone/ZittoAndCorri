import { Loader2 } from "lucide-react";

/** Schermata di caricamento a tutta altezza con spinner coral. Usata dai
 *  file `loading.tsx` (fallback Suspense dell'App Router). */
export function LoadingScreen({ label = "Caricamento…" }: { label?: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 size={28} className="animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
