"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Key } from "lucide-react";
import { ApiKeySection } from "./api-key-section";
import { GeminiKeySection } from "./gemini-key-section";
import type { AiCredentialMetadata } from "@/lib/types";

interface IntegrationsSectionProps {
  apiKey: string | null;
  geminiCredential: AiCredentialMetadata | null;
  focusGemini?: boolean;
}

export function IntegrationsSection({ apiKey, geminiCredential, focusGemini = false }: IntegrationsSectionProps) {
  const [isOpen, setIsOpen] = useState(focusGemini);

  useEffect(() => {
    const storedFocus = window.sessionStorage.getItem("settings-focus") === "gemini";
    const hashFocus = window.location.hash === "#gemini-integration";
    if (!focusGemini && !storedFocus && !hashFocus) return;
    window.sessionStorage.removeItem("settings-focus");

    // Il timeout separa l'apertura dal calcolo della posizione: la card Gemini
    // deve essere già montata prima di misurare il contenitore scrollabile.
    const openTimer = window.setTimeout(() => setIsOpen(true), 0);
    const scrollTimer = window.setTimeout(() => {
      const target = document.getElementById("gemini-key")
        ?? document.getElementById("gemini-integration");
      if (!target) return;
      const scrollContainer = target.closest("main");
      if (scrollContainer instanceof HTMLElement) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const top = scrollContainer.scrollTop
          + targetRect.top
          - containerRect.top
          - Math.max(20, (scrollContainer.clientHeight - targetRect.height) / 2);
        scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 180);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(scrollTimer);
    };
  }, [focusGemini]);

  return (
    <section id="integrations" className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="integrations-content"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/20"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><Key size={18} /></div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Integrazioni e chiavi</h2>
          </div>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div id="integrations-content" className="space-y-3 border-t border-border/60 bg-muted/10 p-3">
          <GeminiKeySection credential={geminiCredential} focusRequested={focusGemini} />
          <ApiKeySection initialApiKey={apiKey} />
        </div>
      )}
    </section>
  );
}
