// Tratti della seduta sull'asse del tempo, per evidenziarli nel grafico (che è
// sul tempo in movimento) e sulla mappa (punti GPS sull'orologio reale).
// Funzioni pure.

import type { IntervalSegment } from "./intervals.ts";

export interface SegmentSpan {
  index: number;
  kind: string;
  variant: string | null;
  label: string;
  start: number;
  end: number;
  movingStart: number;
  movingEnd: number;
}

/**
 * Inizio e fine di ogni tratto: la fine è l'inizio del tratto dopo (così le
 * pause dentro il tratto restano sue); l'ultimo dura il suo tempo più le pause.
 * `clock` porta un istante reale sul tempo in movimento.
 */
export function segmentSpans(
  segments: Array<Pick<IntervalSegment, "kind" | "variant" | "label" | "start_s" | "duration_s" | "paused_s">>,
  clock: (t: number) => number = (t) => t,
): SegmentSpan[] {
  return segments.map((segment, index) => {
    const next = segments[index + 1];
    const start = segment.start_s;
    const end = next ? next.start_s : start + segment.duration_s + (segment.paused_s ?? 0);
    return {
      index,
      kind: segment.kind,
      variant: segment.variant,
      label: segment.label,
      start,
      end,
      movingStart: clock(start),
      movingEnd: clock(end),
    };
  });
}
