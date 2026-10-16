import * as React from "react"

import { cn } from "@/lib/utils"

function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "onClick" | "onChange"> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? "checked" : "unchecked"}
      {...props}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  )
}

export { Switch }
