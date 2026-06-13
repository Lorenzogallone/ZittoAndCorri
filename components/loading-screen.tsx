/** Schermata di caricamento a tutta altezza, in linea con lo splash PWA:
 *  badge brand con icona fiamma, nome app e barra indeterminata. Usata dai file
 *  `loading.tsx` (fallback Suspense dell'App Router) e ovunque serva un loader
 *  a piena pagina. */
export function LoadingScreen({
  label = "Caricamento…",
}: {
  label?: string;
}) {
  return (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-7 bg-background px-6">
      <div className="relative flex items-center justify-center">
        <span className="absolute h-[150px] w-[150px] rounded-full bg-primary/25 blur-2xl animate-pulse" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-[26px] bg-gradient-to-br from-primary/90 to-primary text-primary-foreground shadow-lg shadow-primary/40">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
          </svg>
        </span>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-xl font-extrabold tracking-tight">Zitto e Corri</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>

      <div className="relative h-1 w-36 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-pwa-loading" />
      </div>
    </div>
  );
}
