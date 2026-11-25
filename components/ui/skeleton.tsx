import { cn } from "@/lib/utils";

/** Loading placeholder with a sweeping shine. */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden="true" {...props} />;
}

export { Skeleton };
