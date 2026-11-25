"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/** Segment of the session in time: real (for the map) and moving (for the chart). */
export interface SegmentTime {
  index: number;
  kind: string;
  variant: string | null;
  label: string;
  /** Seconds from the start, real clock (pauses included): like the GPS points. */
  start: number;
  end: number;
  /** The same instants on moving time: like the Trend chart. */
  movingStart: number;
  movingEnd: number;
}

interface Selection {
  segments: SegmentTime[];
  selected: number | null;
  toggle: (index: number) => void;
}

const SelectionContext = createContext<Selection>({ segments: [], selected: null, toggle: () => {} });

/** Segment chosen in the Intervals card, shared with chart and map. */
export function SegmentSelectionProvider({ segments, children }: { segments: SegmentTime[]; children: ReactNode }) {
  const [selected, setSelected] = useState<number | null>(null);
  const toggle = (index: number) => setSelected((current) => (current === index ? null : index));
  return <SelectionContext.Provider value={{ segments, selected, toggle }}>{children}</SelectionContext.Provider>;
}

export function useSegmentSelection(): Selection & { current: SegmentTime | null } {
  const value = useContext(SelectionContext);
  return { ...value, current: value.selected == null ? null : value.segments.find((s) => s.index === value.selected) ?? null };
}
