import { cn } from "@/lib/utils";

/** Segnaposto di caricamento con riflesso che scorre. */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden="true" {...props} />;
}

export { Skeleton };
