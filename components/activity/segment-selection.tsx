"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/** Tratto della seduta nel tempo: reale (per la mappa) e in movimento (per il grafico). */
export interface SegmentTime {
  index: number;
  kind: string;
  variant: string | null;
  label: string;
  /** Secondi dall'inizio, orologio reale (pause comprese): come i punti GPS. */
  start: number;
  end: number;
  /** Gli stessi istanti sul tempo in movimento: come il grafico Andamento. */
  movingStart: number;
  movingEnd: number;
}

interface Selection {
  segments: SegmentTime[];
  selected: number | null;
  toggle: (index: number) => void;
}

const SelectionContext = createContext<Selection>({ segments: [], selected: null, toggle: () => {} });

/** Tratto scelto nella card Ripetute, condiviso con grafico e mappa. */
export function SegmentSelectionProvider({ segments, children }: { segments: SegmentTime[]; children: ReactNode }) {
  const [selected, setSelected] = useState<number | null>(null);
  const toggle = (index: number) => setSelected((current) => (current === index ? null : index));
  return <SelectionContext.Provider value={{ segments, selected, toggle }}>{children}</SelectionContext.Provider>;
}

export function useSegmentSelection(): Selection & { current: SegmentTime | null } {
  const value = useContext(SelectionContext);
  return { ...value, current: value.selected == null ? null : value.segments.find((s) => s.index === value.selected) ?? null };
}
