"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createActivity, saveParsedActivity, type ActivityFormState } from "../actions";
import { navigateAfterMutation } from "@/lib/nav";
import { ACTIVITY_TYPES, WORKOUT_TYPES, SPORTS } from "@/lib/types";
import type { Sport } from "@/lib/types";
import type { ActivityInput } from "@/lib/ingest/schema";
import { parseGpx } from "@/lib/ingest/adapters/gpx";
import { parseFit } from "@/lib/ingest/adapters/fit";
import { mergeActivityInputs } from "@/lib/ingest/merge";
import { DECIMAL_PATTERN, DURATION_PATTERN, formatDuration, parseDecimal, parseDuration } from "@/lib/format";
import { handleEnterKeyHint } from "@/lib/form-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextField } from "@/components/ui/text-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, PenLine } from "lucide-react";
import { typeLabel, sportLabel } from "@/lib/activity-meta";

/** Select sport condiviso tra form manuale e review file. */
function SportSelect({
  value,
  onChange,
}: {
  value: Sport;
  onChange: (s: Sport) => void;
}) {
  const t = useTranslations("activities.fields");
  const tl = useTranslations("labels");
  return (
    <div className="grid gap-2.5">
      <Label htmlFor="sport">{t("sport")}</Label>
      <Select name="sport" value={value} onValueChange={(v) => onChange(v as Sport)}>
        <SelectTrigger id="sport">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPORTS.map((s) => (
            <SelectItem key={s} value={s}>
              {sportLabel(tl, s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Sotto-form manuale ──────────────────────────────────────────────────────

function ManualForm() {
  const t = useTranslations("activities.new");
  const tf = useTranslations("activities.fields");
  const tl = useTranslations("labels");
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
    <form action={formAction} onKeyDown={handleEnterKeyHint} className="flex flex-col gap-5">
      <div className="grid gap-2.5">
        <Label htmlFor="started_at">{tf("dateTime")}</Label>
        <Input id="started_at" name="started_at" type="datetime-local" required />
      </div>

      <SportSelect value={sport} onChange={setSport} />

      {isRunning && (
        <div className="grid gap-2.5">
          <Label htmlFor="type">{tf("type")}</Label>
          <Select name="type" defaultValue="easy">
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKOUT_TYPES.map((workoutType) => (
                <SelectItem key={workoutType} value={workoutType}>
                  {typeLabel(tl, workoutType)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="distance_km">
            {isRunning ? tf("distanceKm") : tf("distanceKmOptional")}
          </Label>
          <Input
            id="distance_km"
            name="distance_km"
            type="text"
            inputMode="decimal"
            pattern={DECIMAL_PATTERN}
            enterKeyHint="next"
            autoComplete="off"
            placeholder={isRunning ? "10.00" : "—"}
            required={isRunning}
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="duration">{tf("duration")}</Label>
          <Input
            id="duration"
            name="duration"
            type="text"
            inputMode="decimal"
            pattern={DURATION_PATTERN}
            enterKeyHint="next"
            autoComplete="off"
            placeholder="50:00"
            required
          />
        </div>
      </div>

      <div className="separator my-1" />
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("manual.optional")}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="avg_hr">{tf("avgHr")}</Label>
          <Input id="avg_hr" name="avg_hr" type="number" inputMode="numeric" enterKeyHint="next" autoComplete="off" min="0" placeholder="150" />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="max_hr">{tf("maxHr")}</Label>
          <Input id="max_hr" name="max_hr" type="number" inputMode="numeric" enterKeyHint="next" autoComplete="off" min="0" placeholder="175" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="elevation_gain_m">{tf("elevation")}</Label>
          <Input id="elevation_gain_m" name="elevation_gain_m" type="number" inputMode="numeric" enterKeyHint="next" autoComplete="off" min="0" placeholder="120" />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="rpe">{t("manual.rpe")}</Label>
          <Input id="rpe" name="rpe" type="number" inputMode="numeric" enterKeyHint="next" autoComplete="off" min="1" max="10" placeholder="4" />
        </div>
      </div>

      <div className="grid gap-2.5">
        <Label id="notes-label" htmlFor="notes">{t("manual.notes")}</Label>
        <TextField id="notes" aria-labelledby="notes-label" name="notes" rows={3} placeholder={t("manual.notesPlaceholder")} />
      </div>

      {state.error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">{state.error}</p>
        </div>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full mt-2">
        {pending ? t("manual.saving") : isRunning ? t("saveRun") : t("saveActivity")}
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
  onCancel: () => void;
}

function GpxReviewForm({ initialData, onCancel }: GpxReviewFormProps) {
  const t = useTranslations("activities.new");
  const tf = useTranslations("activities.fields");
  const tl = useTranslations("labels");
  const te = useTranslations("activities.errors");
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
    const distanceKm = parseDecimal(formData.get("distance_km"));
    const durationStr = formData.get("duration") as string;
    const avgHr = optIntClient(formData, "avg_hr");
    const maxHr = optIntClient(formData, "max_hr");
    const elevationGain = optIntClient(formData, "elevation_gain_m");
    const rpe = optIntClient(formData, "rpe");

    const duration_s = parseDuration(durationStr);
    if (duration_s == null || duration_s <= 0) {
      setError(te("durationInvalid"));
      setPending(false);
      return;
    }

    const startedAtDate = new Date(startedAtLocal);
    if (isNaN(startedAtDate.getTime())) {
      setError(te("dateInvalid"));
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
      rpe_source: rpe != null
        ? (rpe === initialData.rpe ? initialData.rpe_source : "user")
        : undefined,
    };

    const res = await saveParsedActivity(activityInput);
    if (res.error) {
      setError(res.error);
      setPending(false);
    } else if (res.id) {
      // replace: il form di review non deve restare nella history.
      navigateAfterMutation(router, `/activities/${res.id}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleEnterKeyHint} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-heading font-semibold text-foreground">{t("review.title")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("review.intro")}
        </p>
      </div>

      <div className="grid gap-2.5">
        <Label id="import-notes-label" htmlFor="notes">{t("review.notes")}</Label>
        {initialData.source_title && (
          <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t.rich("review.titleFromFile", {
              title: initialData.source_title,
              b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </p>
        )}
        <TextField
          id="notes"
          aria-labelledby="import-notes-label"
          name="notes"
          singleLine
          enterKeyHint="next"
          defaultValue={initialData.notes ?? ""}
          placeholder={t("review.notesPlaceholder")}
        />
      </div>

      <SportSelect value={sport} onChange={setSport} />

      {isRunning && (
        <div className="grid gap-2.5">
          <Label htmlFor="type">{tf("typeTag")}</Label>
          <Select name="type" defaultValue={initialData.type ?? "unclassified"}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map((activityType) => (
                <SelectItem key={activityType} value={activityType}>
                  {typeLabel(tl, activityType)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-2.5">
        <Label htmlFor="started_at">{tf("dateTimeFromFile")}</Label>
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
          <Label htmlFor="distance_km">{t("review.distanceKmFromFile")}</Label>
          <Input
            id="distance_km"
            name="distance_km"
            type="text"
            inputMode="decimal"
            defaultValue={(initialData.distance_m / 1000).toFixed(2)}
            readOnly
            className="bg-muted/40 cursor-not-allowed opacity-80"
            required
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="duration">{t("review.durationFromFile")}</Label>
          <Input
            id="duration"
            name="duration"
            type="text"
            inputMode="decimal"
            defaultValue={formatDuration(initialData.duration_s)}
            readOnly
            className="bg-muted/40 cursor-not-allowed opacity-80"
            required
          />
        </div>
      </div>

      <div className="separator my-1" />
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("review.cardioSection")}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="avg_hr">{tf("avgHr")}</Label>
          <Input
            id="avg_hr"
            name="avg_hr"
            type="number"
            inputMode="numeric"
            min="0"
            defaultValue={initialData.avg_hr ?? ""}
            placeholder="—"
            readOnly
            className="bg-muted/40 cursor-not-allowed opacity-80"
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="max_hr">{tf("maxHr")}</Label>
          <Input
            id="max_hr"
            name="max_hr"
            type="number"
            inputMode="numeric"
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
          <Label htmlFor="elevation_gain_m">{tf("elevation")}</Label>
          <Input
            id="elevation_gain_m"
            name="elevation_gain_m"
            type="number"
            inputMode="numeric"
            min="0"
            defaultValue={initialData.elevation_gain_m ?? ""}
            placeholder="—"
            readOnly
            className="bg-muted/40 cursor-not-allowed opacity-80"
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="rpe">{t("review.rpe")}</Label>
          <Input
            id="rpe"
            name="rpe"
            type="number"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            min="1"
            max="10"
            defaultValue={initialData.rpe ?? ""}
            placeholder="4"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">{error}</p>
        </div>
      )}

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={pending}>
          {t("review.back")}
        </Button>
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? t("review.saving") : isRunning ? t("saveRun") : t("saveActivity")}
        </Button>
      </div>
    </form>
  );
}

function GpxUploadForm() {
  const t = useTranslations("activities.new.file");
  const [parsedInput, setParsedInput] = useState<ActivityInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const parseOne = async (file: File): Promise<ActivityInput> => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "fit") return parseFit(await file.arrayBuffer());
    if (ext === "gpx") return parseGpx(await file.text());
    throw new Error(t("unsupported"));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setFileName(files.map((f) => f.name).join(" + "));
    setIsParsing(true);
    setError(null);

    try {
      if (files.length > 2) {
        throw new Error(t("tooMany"));
      }
      let input: ActivityInput;
      if (files.length === 2) {
        // GPX + FIT della stessa attività: il FIT è il file ricco (cadenza,
        // calorie, moving time), il GPX riempie i buchi e dà il nome traccia.
        const exts = files.map((f) => f.name.split(".").pop()?.toLowerCase());
        const fitFile = files[exts.indexOf("fit")];
        const gpxFile = files[exts.indexOf("gpx")];
        if (!fitFile || !gpxFile) {
          throw new Error(t("needPair"));
        }
        input = mergeActivityInputs(
          await parseOne(fitFile),
          await parseOne(gpxFile),
        );
      } else {
        input = await parseOne(files[0]);
      }
      setParsedInput(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("parseFailed"));
      setParsedInput(null);
    } finally {
      setIsParsing(false);
    }
  };

  if (parsedInput) {
    return (
      <GpxReviewForm
        initialData={parsedInput}
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
        <Label className="text-sm font-medium">{t("label")}</Label>
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,.fit"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="pressable flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/[0.12] bg-muted/20 p-10 hover:border-white/25 hover:bg-muted/30 [--press-scale:0.98]"
          disabled={isParsing}
        >
          <Upload size={32} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-medium">
            {isParsing ? t("parsing") : fileName ? fileName : t("choose")}
          </span>
        </button>
        <p className="text-xs text-muted-foreground text-center">
          {t("helpSources")}
          <br />
          {t("helpAuto")}
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

export function ActivityForm() {
  const t = useTranslations("activities.new.mode");
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
          {t("manual")}
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
          {t("file")}
        </button>
      </div>

      {mode === "manual" ? (
        <ManualForm />
      ) : (
        <GpxUploadForm />
      )}
    </div>
  );
}
