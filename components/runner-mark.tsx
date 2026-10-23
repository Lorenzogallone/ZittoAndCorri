// Omino dell'icona in posa di volo, statico: stessa geometria dello splash PWA
// (components/pwa-splash.tsx) con le articolazioni ferme nella posa che lo
// splash mostra con il movimento ridotto. Disegnato verso destra e specchiato.
// Corpo in currentColor; `cutout` è il colore dello sfondo, usato per staccare
// gamba e braccio vicini dal busto e per il bordo dei nodi.

const UPPER = "M44.8 37L45.5 50.5A3.1 3.1 0 0 0 51.7 50.5L52.4 37A3.8 3.8 0 0 0 44.8 37Z";
const FORE = "M45.5 50.5L46.1 61.5A2.5 2.5 0 0 0 51.1 61.5L51.7 50.5A3.1 3.1 0 0 0 45.5 50.5Z";
const THIGH = "M42.2 57L44 79.5A4 4 0 0 0 52 79.5L53.8 57A5.8 5.8 0 0 0 42.2 57Z";
const SHIN =
  "M44 79.5L45.5 100.5A2.5 2.5 0 0 0 50.5 100.5L52 79.5A4 4 0 0 0 44 79.5ZM47.2 99.1L54.3 99.1A2.2 2.2 0 0 1 54.3 103.5L47.2 103.5A2.2 2.2 0 0 1 47.2 99.1Z";

function Arm({ upper, fore }: { upper: number; fore: number }) {
  return (
    <g transform={`rotate(${upper} 48.6 37)`}>
      <path d={UPPER} />
      <g transform={`rotate(${fore} 48.6 50.5)`}>
        <path d={FORE} />
        <circle cx="48.6" cy="62.3" r="3" />
      </g>
    </g>
  );
}

function Leg({ thigh, shin }: { thigh: number; shin: number }) {
  return (
    <g transform={`rotate(${thigh} 48 57)`}>
      <path d={THIGH} />
      <g transform={`rotate(${shin} 48 79.5)`}>
        <path d={SHIN} />
      </g>
    </g>
  );
}

export function RunnerMark({
  size = 40,
  cutout,
  node,
  className,
}: {
  size?: number;
  /** Colore dello sfondo su cui sta l'omino. */
  cutout: string;
  /** Colore dei nodi sulla schiena (default: come il corpo). */
  node?: string;
  className?: string;
}) {
  const outline = { fill: cutout, stroke: cutout, strokeWidth: 2.6, strokeLinejoin: "round" as const };
  return (
    <svg
      width={size}
      height={size}
      viewBox="5 14 92 92"
      fill="currentColor"
      className={className}
      style={{ transform: "scaleX(-1)" }}
      aria-hidden="true"
    >
      <g opacity={0.5}>
        <g transform="rotate(28 48 57)">
          <Arm upper={21.7} fore={-48.1} />
        </g>
        <Leg thigh={-42.4} shin={53.4} />
      </g>
      <g transform="rotate(28 48 57)">
        <path d="M43 58C41 51 40 45 40.6 39.5C41.2 34.6 44.4 32 48.4 32C52.8 32 55.6 34.8 56.2 39.8C56.8 45.5 55.2 51.5 54 58C52.6 61.6 44.4 61.6 43 58Z" />
        <path d="M48.6 33L48.9 28.2" stroke="currentColor" strokeWidth={4.4} strokeLinecap="round" />
        <circle cx="49" cy="22.6" r="5.8" />
        <g transform="translate(36.5 34) rotate(-28)" fill={node ?? "currentColor"}>
          <path d="M-6 -5.2 L6 5.2 M6 -5.2 L-6 5.2" stroke={node ?? "currentColor"} strokeWidth={1.5} strokeLinecap="round" />
          <g stroke={cutout} strokeWidth={1.3} style={{ paintOrder: "stroke" }}>
            <circle r="3.5" />
            <circle cx="-6" cy="-5.2" r="2.4" />
            <circle cx="6" cy="-5.2" r="2.4" />
            <circle cx="-6" cy="5.2" r="2.4" />
            <circle cx="6" cy="5.2" r="2.4" />
          </g>
        </g>
      </g>
      <g {...outline}>
        <Leg thigh={11.6} shin={57.8} />
      </g>
      <Leg thigh={11.6} shin={57.8} />
      <g transform="rotate(28 48 57)">
        <g {...outline}>
          <Arm upper={-77.7} fore={-67.9} />
        </g>
        <Arm upper={-77.7} fore={-67.9} />
      </g>
    </svg>
  );
}
