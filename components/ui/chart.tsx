"use client";

// Wrapper shadcn/ui per Recharts. Espone ChartContainer + tooltip helper.
// Usa le CSS var --chart-1..5 già definite in globals.css.

import * as React from "react";
import { Tooltip, type TooltipContentProps } from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label: string; color?: string }>;

interface ChartContextValue {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextValue>({ config: {} });

function useChart() {
  return React.useContext(ChartContext);
}

interface ChartContainerProps extends React.ComponentProps<"div"> {
  config: ChartConfig;
  children: React.ReactElement;
}

export function ChartContainer({
  config,
  children,
  className,
  ...props
}: ChartContainerProps) {
  const colorVars = Object.entries(config).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (value.color) acc[`--color-${key}`] = value.color;
      return acc;
    },
    {},
  );

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn("w-full", className)}
        style={colorVars as React.CSSProperties}
        {...props}
      >
        {children}
      </div>
    </ChartContext.Provider>
  );
}

// In recharts v3 il content del tooltip riceve TooltipContentProps con i generici
// di default (ValueType/NameType): allarghiamo la firma per combaciare col render prop.
// Omit del `formatter` di recharts per non confliggere con il nostro (più stretto).
type ContentProps = Omit<TooltipContentProps, "formatter"> & {
  formatter?: (value: number, name: string) => string;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
}: ContentProps) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm text-xs">
      {label != null && (
        <p className="mb-1.5 font-medium text-muted-foreground">{String(label)}</p>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? "");
          const cfg = config[key];
          const color = cfg?.color ?? (entry as { color?: string }).color ?? (entry as { fill?: string }).fill;
          const entryLabel = cfg?.label ?? entry.name ?? key;
          const value = Number(entry.value);
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <span className="text-muted-foreground">{String(entryLabel)}</span>
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {formatter ? formatter(value, key) : value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { Tooltip as ChartTooltip };
