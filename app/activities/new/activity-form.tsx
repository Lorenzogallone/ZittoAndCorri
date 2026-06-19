"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createActivity, saveParsedActivity, type ActivityFormState } from "../actions";
import { navigateAfterMutation } from "@/lib/nav";
import { WORKOUT_TYPES, SPORTS } from "@/lib/types";
import type { PlannedWorkout, Sport } from "@/lib/types";
import type { ActivityInput } from "@/lib/ingest/schema";
import { parseGpx } from "@/lib/ingest/adapters/gpx";
import { parseFit } from "@/lib/ingest/adapters/fit";
import { formatDuration, parseDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, PenLine } from "lucide-react";
import { TYPE_LABELS, SPORT_LABELS } from "@/lib/activity-meta";

/** Select sport condiviso tra form manuale e review file. */
function SportSelect({
  value,
  onChange,
}: {
  value: Sport;
  onChange: (s: Sport) => void;
}) {
  return (
    <div className="grid gap-2.5">
      <Label htmlFor="sport">Sport</Label>
      <Select name="sport" value={value} onValueChange={(v) => onChange(v as Sport)}>
        <SelectTrigger id="sport">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPORTS.map((s) => (
            <SelectItem key={s} value={s}>
              {SPORT_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type NearbyWorkout = Pick<
  PlannedWorkout,
  "id" | "date" | "type" | "target_distance_m" | "description"
>;

interface Props {
  nearbyWorkouts: NearbyWorkout[];
  today: string; // YYYY-MM-DD
}

// ── Sotto-form manuale ──────────────────────────────────────────────────────

function ManualForm({ nearbyWorkouts, today }: Props) {
  const initialState: ActivityFormState = {};
  const [state, formAction, pending] = useActionState(createActivity, initialState);
  const router = useRouter();
  const [sport, setSport] = useState<Sport>("running");
  const isRunning = sport === "running";

  // Salvataggio andato a buon fine → vai al dettaglio (client-side; in PWA
  // standalone è un full load, affidabile dove la soft-navigation si impalla).
  useEffect(() => {
    if (state.id) navigateAfterMutation(router, `/activities/${state.id}`);
  }, [state.id, router]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-2.5">
        <Label htmlFor="started_at">Data e ora</Label>
        <Input id="started_at" name="started_at" type="datetime-local" required />
      </div>

      <SportSelect value={sport} onChange={setSport} />

      {isRunning && (
        <div className="grid gap-2.5">
          <Label htmlFor="type">Tipo</Label>
          <Select name="type" defaultValue="easy">
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKOUT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="distance_km">
            Distanza (km{isRunning ? "" : ", opzionale"})
          </Label>
          <Input
            id="distance_km"
            name="distance_km"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder={isRunning ? "10.00" : "—"}
            required={isRunning}
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="duration">Durata (h:mm:ss)</Label>
          <Input
            id="duration"
            name="duration"
            type="text"
            inputMode="text"
            placeholder="50:00"
            required
          />
        </div>
      </div>

      <div className="separator my-1" />
      <p className="text-xs text-muted-foreground uppercase tracking-wider">Opzionali</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="avg_hr">HR media</Label>
          <Input id="avg_hr" name="avg_hr" type="number" min="0" placeholder="150" />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="max_hr">HR max</Label>
          <Input id="max_hr" name="max_hr" type="number" min="0" placeholder="175" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="elevation_gain_m">Dislivello + (m)</Label>
          <Input id="elevation_gain_m" name="elevation_gain_m" type="number" min="0" placeholder="120" />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="rpe">RPE 1–10</Label>
          <Input id="rpe" name="rpe" type="number" min="1" max="10" placeholder="4" />
        </div>
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="notes">Note</Label>
        <Textarea id="notes" name="notes" rows={3} placeholder="Gambe ok, fresco." />
      </div>

      {nearbyWorkouts.length > 0 && (
        <div className="grid gap-2.5">
          <Label htmlFor="planned_workout_id">Collega ad allenamento pianificato</Label>
          <Select name="planned_workout_id" defaultValue="none">
            <SelectTrigger id="planned_workout_id">
              <SelectValue placeholder="Nessun collegamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nessun collegamento</SelectItem>
              {nearbyWorkouts.map((w) => {
                const label = `${w.date === today ? "Oggi" : w.date} · ${TYPE_LABELS[w.type] ?? w.type}${
                  w.target_distance_m ? ` · ${(w.target_distance_m / 1000).toFixed(1)} km` : ""
                }`;
                return (
                  <SelectItem key={w.id} value={w.id}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Segna automaticamente il workout come completato
          </p>
        </div>
      )}

      {state.error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">{state.error}</p>
        </div>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full mt-2">
        {pending ? "Salvo…" : isRunning ? "Salva corsa" : "Salva attività"}
      </Button>
    </form>
  );
}

// ── Sotto-form GPX ─────────────────────────────────────────────────────────

function optIntClient(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function formatDateTimeLocal(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface GpxReviewFormProps {
  initialData: ActivityInput;
  nearbyWorkouts: NearbyWorkout[];
  today: string;
  onCancel: () => void;
}

function GpxReviewForm({ initialData, nearbyWorkouts, today, onCancel }: GpxReviewFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sport, setSport] = useState<Sport>(initialData.sport ?? "running");
  const isRunning = sport === "running";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const type = isRunning ? (formData.get("type") as string) : "cross";
    const notes = formData.get("notes") as string;
    const startedAtLocal = formData.get("started_at") as string;
    const distanceKm = Number(formData.get("distance_km"));
    const durationStr = formData.get("duration") as string;
    const avgHr = optIntClient(formData, "avg_hr");
    const maxHr = optIntClient(formData, "max_hr");
    const elevationGain = optIntClient(formData, "elevation_gain_m");
    const rpe = optIntClient(formData, "rpe");
    const rawPlannedId = formData.get("planned_workout_id") as string;
    const plannedWorkoutId = rawPlannedId === "none" ? "" : rawPlannedId;

    const duration_s = parseDuration(durationStr);
    if (duration_s == null || duration_s <= 0) {
      setError("Durata non valida (usa h:mm:ss o mm:ss).");
      setPending(false);
      return;
    }

    const startedAtDate = new Date(startedAtLocal);
    if (isNaN(startedAtDate.getTime())) {
      setError("Data/ora non valida.");
      setPending(false);
      return;
    }

    const activityInput: ActivityInput = {
      ...initialData,
      type: type as ActivityInput["type"],
      sport,
      notes: notes || undefined,
      started_at: startedAtDate.toISOString(),
      distance_m: Math.round(distanceKm * 1000),
      duration_s,
      avg_hr: avgHr,
      max_hr: maxHr,
      elevation_gain_m: elevationGain,
      rpe,
    };

    const res = await saveParsedActivity(activityInput, plannedWorkoutId);
    if (res.error) {
      setError(res.error);
      setPending(false);
    } else if (res.id) {
      // replace: il form di review non deve restare nella history.
      navigateAfterMutation(router, `/activities/${res.id}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-foreground">Revisione attività</h3>
        <p className="text-xs text-muted-foreground">
          I dati sono stati estratti con successo. Puoi modificarli prima di salvare.
        </p>
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="notes">Nome / Note attività</Label>
        <Input
          id="notes"
          name="notes"
          type="text"
          defaultValue={initialData.notes ?? "Attività importata"}
          placeholder="Nome o note dell'attività"
          required
        />
      </div>

      <SportSelect value={sport} onChange={setSport} />

      {isRunning && (
        <div className="grid gap-2.5">
          <Label htmlFor="type">Tipo (Tag)</Label>
          <Select name="type" defaultValue={initialData.type ?? "easy"}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKOUT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-2.5">
        <Label htmlFor="started_at">Data e ora (dal file)</Label>
        <Input
          id="started_at"
          name="started_at"
          type="datetime-local"
          defaultValue={formatDateTimeLocal(initialData.started_at)}
          readOnly
          className="bg-muted/40 cursor-not-allowed opacity-80"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="distance_km">Distanza (km - dal file)</Label>
          <Input
            id="distance_km"
            name="distance_km"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={(initialData.distance_m / 1000).toFixed(2)}
            readOnly
            className="bg-muted/40 cursor-not-allowed opacity-80"
            required
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="duration">Durata (dal file)</Label>
          <Input
            id="duration"
            name="duration"
            type="text"
            inputMode="numeric"
            defaultValue={formatDuration(initialData.duration_s)}
            readOnly
            className="bg-muted/40 cursor-not-allowed opacity-80"
            required
          />
        </div>
      </div>

      <div className="separator my-1" />
      <p className="text-xs text-muted-foreground uppercase tracking-wider">Dati Cardio & Dislivello (dal file)</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="avg_hr">HR media</Label>
          <Input
            id="avg_hr"
            name="avg_hr"
            type="number"
            min="0"
            defaultValue={initialData.avg_hr ?? ""}
            placeholder="—"
            readOnly
            className="bg-muted/40 cursor-not-allowed opacity-80"
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="max_hr">HR max</Label>
          <Input
            id="max_hr"
            name="max_hr"
            type="number"
            min="0"
            defaultValue={initialData.max_hr ?? ""}
            placeholder="—"
            readOnly
            className="bg-muted/40 cursor-not-allowed opacity-80"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="elevation_gain_m">Dislivello + (m)</Label>
          <Input
            id="elevation_gain_m"
            name="elevation_gain_m"
            type="number"
            min="0"
            defaultValue={initialData.elevation_gain_m ?? ""}
            placeholder="—"
            readOnly
            className="bg-muted/40 cursor-not-allowed opacity-80"
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="rpe">RPE (Sforzo 1-10)</Label>
          <Input
            id="rpe"
            name="rpe"
            type="number"
            min="1"
            max="10"
            defaultValue={initialData.rpe ?? ""}
            placeholder="4"
          />
        </div>
      </div>

      {nearbyWorkouts.length > 0 && (
        <div className="grid gap-2.5">
          <Label htmlFor="planned_workout_id">Collega ad allenamento pianificato</Label>
          <Select name="planned_workout_id" defaultValue="none">
            <SelectTrigger id="planned_workout_id">
              <SelectValue placeholder="Nessun collegamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nessun collegamento</SelectItem>
              {nearbyWorkouts.map((w) => {
                const label = `${w.date === today ? "Oggi" : w.date} · ${TYPE_LABELS[w.type] ?? w.type}${
                  w.target_distance_m ? ` · ${(w.target_distance_m / 1000).toFixed(1)} km` : ""
                }`;
                return (
                  <SelectItem key={w.id} value={w.id}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">{error}</p>
        </div>
      )}

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={pending}>
          Indietro
        </Button>
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? "Salvo..." : isRunning ? "Salva corsa" : "Salva attività"}
        </Button>
      </div>
    </form>
  );
}

interface GpxUploadFormProps {
  nearbyWorkouts: NearbyWorkout[];
  today: string;
}

function GpxUploadForm({ nearbyWorkouts, today }: GpxUploadFormProps) {
  const [parsedInput, setParsedInput] = useState<ActivityInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsParsing(true);
    setError(null);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let input: ActivityInput;
      if (ext === "fit") {
        input = await parseFit(await file.arrayBuffer());
      } else if (ext === "gpx") {
        input = parseGpx(await file.text());
      } else {
        throw new Error("Formato non supportato: usa un file .gpx o .fit.");
      }
      setParsedInput(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il parsing del file.");
      setParsedInput(null);
    } finally {
      setIsParsing(false);
    }
  };

  if (parsedInput) {
    return (
      <GpxReviewForm
        initialData={parsedInput}
        nearbyWorkouts={nearbyWorkouts}
        today={today}
        onCancel={() => {
          setParsedInput(null);
          setFileName(null);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-medium">File GPX o FIT</Label>
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,.fit"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/[0.12] bg-muted/20 p-10 transition-colors hover:border-white/25 hover:bg-muted/30 active:scale-[0.98]"
          disabled={isParsing}
        >
          <Upload size={32} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-medium">
            {isParsing ? "Analisi file in corso..." : fileName ? fileName : "Tocca per scegliere un file .gpx o .fit"}
          </span>
        </button>
        <p className="text-xs text-muted-foreground text-center">
          File .gpx o .fit esportati da Strava, Garmin o Coros.
          <br />
          Lo sport viene riconosciuto dal file; passo, zone HR e split sono calcolati in automatico.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">{error}</p>
        </div>
      )}
    </div>
  );
}

// ── Wrapper con toggle ────────────────────────────────────────────────────

export function ActivityForm({ nearbyWorkouts, today }: Props) {
  const [mode, setMode] = useState<"manual" | "gpx">("manual");

  return (
    <div className="flex flex-col gap-6">
      {/* Toggle modalità */}
      <div className="flex rounded-xl bg-muted/40 p-1 gap-1">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
            mode === "manual"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <PenLine size={15} />
          Manuale
        </button>
        <button
          type="button"
          onClick={() => setMode("gpx")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
            mode === "gpx"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload size={15} />
          Da file (GPX/FIT)
        </button>
      </div>

      {mode === "manual" ? (
        <ManualForm nearbyWorkouts={nearbyWorkouts} today={today} />
      ) : (
        <GpxUploadForm nearbyWorkouts={nearbyWorkouts} today={today} />
      )}
    </div>
  );
}
