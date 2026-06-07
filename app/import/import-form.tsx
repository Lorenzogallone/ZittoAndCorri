"use client";

import { useActionState, useRef, useState } from "react";
import { importActivity } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, FileText } from "lucide-react";

const INIT: { error?: string } = {};

export function ImportForm() {
  const [state, action, pending] = useActionState(importActivity, INIT);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<"file" | "json">("file");

  return (
    <form action={action} className="flex flex-col gap-6">
      {/* Mode tabs */}
      <div className="flex rounded-xl bg-muted/40 p-1 gap-1">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
            mode === "file"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload size={15} />
          Carica file
        </button>
        <button
          type="button"
          onClick={() => setMode("json")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
            mode === "json"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText size={15} />
          Incolla JSON
        </button>
      </div>

      {/* File upload (GPX o JSON) */}
      {mode === "file" && (
        <div className="flex flex-col gap-3">
          <Label className="text-sm font-medium">File GPX o JSON</Label>
          <input
            ref={inputRef}
            type="file"
            name="gpx_file"
            accept=".gpx,.json"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/[0.12] bg-muted/20 p-10 transition-colors hover:border-white/25 hover:bg-muted/30 active:scale-[0.98]"
          >
            <Upload size={32} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {fileName ? (
                <span className="text-foreground font-medium">{fileName}</span>
              ) : (
                "Tocca per scegliere un file .gpx o .json"
              )}
            </span>
          </button>
          <p className="text-xs text-muted-foreground text-center">
            GPX da Strava, Garmin, Coros — qualsiasi export con trackpoints.
          </p>
        </div>
      )}

      {/* Incolla JSON */}
      {mode === "json" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="json_text" className="text-sm font-medium">
            ActivityInput JSON
          </Label>
          <Textarea
            id="json_text"
            name="json_text"
            placeholder={'{\n  "source": "json_import",\n  "type": "easy",\n  "started_at": "2025-01-01T08:00:00Z",\n  "distance_m": 10000,\n  "duration_s": 3600\n}'}
            rows={10}
            className="font-mono text-xs resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Accetta un singolo oggetto o un array di ActivityInput.
          </p>
        </div>
      )}

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? "Importo…" : "Importa corsa"}
      </Button>
    </form>
  );
}
