import { RunnerMark } from "@/components/runner-mark";

/** Schermata di caricamento a tutta altezza, in linea con lo splash PWA:
 *  tile "inchiostro" con l'omino nel colore principale, nome app e barra
 *  indeterminata. Usata dai file `loading.tsx` (fallback Suspense dell'App
 *  Router) e ovunque serva un loader a piena pagina. */
export function LoadingScreen({
  label = "Caricamento…",
}: {
  label?: string;
}) {
  return (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-7 bg-background px-6">
      <div className="relative flex items-center justify-center">
        <span className="absolute h-[150px] w-[150px] rounded-full bg-primary/20 blur-2xl animate-pulse" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-hero text-primary shadow-lg shadow-black/20">
          <RunnerMark size={52} cutout="var(--hero)" node="var(--hero-foreground)" />
        </span>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p className="font-display text-title font-bold tracking-tight">Zitto e Corri</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>

      <div className="relative h-1 w-36 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-pwa-loading" />
      </div>
    </div>
  );
}
