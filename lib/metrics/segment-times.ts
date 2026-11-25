// Session segments on the time axis, to highlight them on the chart (which is
// on moving time) and on the map (GPS points on the real clock).
// Pure functions.

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
 * Start and end of each segment: the end is the start of the next segment (so
 * pauses inside the segment stay its own); the last lasts its time plus the pauses.
 * `clock` brings a real instant onto moving time.
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
