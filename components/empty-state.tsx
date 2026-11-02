import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyAction {
  href: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Schermata o sezione ancora vuota: tessera hero con l'icona, cosa comparirà
 * qui, un'azione principale che porta a riempirla e, se serve, una seconda
 * via più leggera. Usata da corse, piano e profilo (stessa forma ovunque).
 */
export function EmptyState({
  icon: Icon,
  mark,
  title,
  text,
  action,
  secondary,
  className,
}: {
  icon?: LucideIcon;
  /** Al posto dell'icona (es. RunnerMark). */
  mark?: ReactNode;
  title: string;
  text: string;
  action: EmptyAction;
  secondary?: EmptyAction;
  className?: string;
}) {
  const ActionIcon = action.icon;
  const SecondaryIcon = secondary?.icon;
  return (
    <section className={cn("surface flex flex-col items-center p-5 text-center", className)}>
      <span className="surface-hero flex h-16 w-16 items-center justify-center rounded-3xl" aria-hidden="true">
        {mark ?? (Icon && <Icon size={28} strokeWidth={2.2} className="text-primary" />)}
      </span>
      <div className="mt-4 space-y-1.5">
        <h2 className="font-display text-title font-bold tracking-tight text-balance">{title}</h2>
        <p className="mx-auto max-w-xs text-body text-muted-foreground text-pretty">{text}</p>
      </div>
      <div className="mt-5 flex w-full flex-col items-center gap-1">
        <Button asChild className="w-full max-w-xs">
          <Link href={action.href}>
            {ActionIcon && <ActionIcon size={16} />} {action.label}
          </Link>
        </Button>
        {secondary && (
          <Button asChild variant="ghost" className="w-full max-w-xs text-primary">
            <Link href={secondary.href}>
              {SecondaryIcon && <SecondaryIcon size={16} />} {secondary.label}
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
