"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";

interface IntegrationCardProps {
  id?: string;
  icon: ReactNode;
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function IntegrationCard({
  id,
  icon,
  title,
  description,
  defaultOpen = false,
  children,
}: IntegrationCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showInfo, setShowInfo] = useState(false);
  const contentId = id ? `${id}-content` : undefined;
  const infoId = id ? `${id}-info` : undefined;

  return (
    <section id={id} className="scroll-mt-6 overflow-hidden rounded-xl border border-border bg-background/45">
      <div className="flex items-center pr-3">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{title}</span>
          <ChevronDown
            size={17}
            className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          aria-label={`Informazioni su ${title}`}
          aria-expanded={showInfo}
          aria-controls={infoId}
          onClick={() => setShowInfo((value) => !value)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            showInfo ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Info size={15} />
        </button>
      </div>

      {showInfo && (
        <p id={infoId} className="border-t border-border/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {isOpen && (
        <div id={contentId} className="border-t border-border/60 p-4">
          {children}
        </div>
      )}
    </section>
  );
}

export function IntegrationHelp({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-border/60 bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-primary">
        <Info size={14} />
        <span className="flex-1">{title}</span>
        <ChevronDown size={14} className="text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
