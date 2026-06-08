"use client";

import { useState } from "react";
import { ApiKeySection } from "./api-key-section";
import { ChevronDown, ChevronUp, BookOpen, Key, Smartphone, HelpCircle } from "lucide-react";

interface IntegrationsSectionProps {
  apiKey: string | null;
}

export function IntegrationsSection({ apiKey }: IntegrationsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div className="rounded-2xl bg-card border border-white/[0.06] overflow-hidden transition-all duration-200 mb-6">
      {/* Header / Pulsante Collassabile */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Key size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Integrazioni & API</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configura chiavi API personali e Comandi Rapidi per il tuo iPhone.
            </p>
          </div>
        </div>
        <div className="text-muted-foreground/60">
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Contenuto Collassabile principale */}
      {isOpen && (
        <div className="px-5 pb-5 pt-3 border-t border-white/[0.04] bg-white/[0.01] space-y-6">
          <ApiKeySection initialApiKey={apiKey} />

          {/* Contenuto Collassabile per la Guida Istruzioni */}
          <div className="border-t border-white/[0.04] pt-4">
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <HelpCircle size={14} />
              {showInstructions ? "Nascondi guida di configurazione" : "Mostra istruzioni di configurazione iPhone"}
            </button>

            {showInstructions && (
              <div className="mt-4 space-y-4 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="rounded-xl bg-muted/20 border border-white/[0.03] p-4 space-y-2">
                  <h3 className="font-semibold text-foreground flex items-center gap-1.5 text-sm">
                    <Smartphone size={14} className="text-primary" />
                    1. Importazione Apple Health (Solo metriche)
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Importa automaticamente la distanza, durata e frequenza cardiaca media dall'ultimo allenamento registrato in Apple Health tramite un Comando Rapido (Shortcuts). Non include la mappa GPS.
                  </p>
                  <div className="bg-black/20 rounded-lg p-3 border border-white/[0.02] space-y-2">
                    <p className="font-medium text-foreground">Parametri di configurazione:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-muted-foreground/90 pl-1">
                      <li>URL: <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-mono text-[10px]">https://zitto-and-corri.vercel.app/api/import</code></li>
                      <li>Metodo: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-[10px]">POST</code></li>
                      <li>Header: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-[10px]">Authorization: Bearer [tua_chiave_api]</code></li>
                      <li>Payload JSON: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-[10px]">started_at, distance_m, duration_s, avg_hr</code></li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl bg-muted/20 border border-white/[0.03] p-4 space-y-2">
                  <h3 className="font-semibold text-foreground flex items-center gap-1.5 text-sm">
                    <BookOpen size={14} className="text-primary" />
                    2. Importazione File GPX (Mappa, Cardio & Altitudine)
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Consente di importare il file GPX completo (con coordinate GPS e mappa) condividendolo tramite il foglio di condivisione di iOS dopo l'esportazione da app come <strong className="text-foreground">WorkoutGPX</strong> o <strong className="text-foreground">WorkOutDoors</strong>.
                  </p>
                  <div className="bg-black/20 rounded-lg p-3 border border-white/[0.02] space-y-2">
                    <p className="font-medium text-foreground">Parametri di configurazione:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-muted-foreground/90 pl-1">
                      <li>URL: <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-mono text-[10px]">https://zitto-and-corri.vercel.app/api/import/gpx</code></li>
                      <li>Metodo: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-[10px]">POST</code></li>
                      <li>Header: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-[10px]">Authorization: Bearer [tua_chiave_api]</code></li>
                      <li>Payload JSON: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-[10px]">{"{ \"gpx\": \"[contenuto_xml_gpx]\", \"notes\": \"Importato da iPhone\" }"}</code></li>
                    </ul>
                  </div>
                  <p className="text-[10px] text-muted-foreground/80 mt-2 font-medium">
                    💡 Per le istruzioni dettagliate sulla creazione dei flussi di automazione in Comandi Rapidi, consulta il file <code className="bg-muted px-1 py-0.5 rounded font-mono text-foreground">INSTRUCTIONS.md</code> nella cartella radice del progetto.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
