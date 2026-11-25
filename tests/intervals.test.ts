import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIntervals, areAutoLaps, describeStructure, type FitLap } from "../lib/metrics/intervals.ts";
import { itLabels } from "../lib/italian-translator.ts";
import type { WorkoutStepInput } from "../lib/types.ts";

// Synthetic run: constant-speed phases with deterministic noise.
interface Phase { seconds: number; speed: number; hr: number }

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296 - 0.5;
  };
}

function simulate(phases: Phase[], seed = 7) {
  const rnd = random(seed);
  const distance: Array<{ t: number; d: number }> = [];
  const hr: Array<{ t: number; bpm: number }> = [];
  const bounds: number[] = [0];
  let t = 0;
  let d = 0;
  let bpm = 110;
  for (const phase of phases) {
    for (let s = 0; s < phase.seconds; s++) {
      d += Math.max(0, phase.speed + rnd() * 0.3);
      bpm += (phase.hr - bpm) / 20;
      t += 1;
      distance.push({ t, d: Math.round(d * 10) / 10 });
      hr.push({ t, bpm: Math.round(bpm) });
    }
    bounds.push(t);
  }
  return { distance, hr, bounds };
}

/** GPS track along a meridian with a position error of a few metres. */
function toGps(distance: Array<{ t: number; d: number }>, seed = 3) {
  const rnd = random(seed);
  return distance.map((p) => ({ t: p.t, lat: 45 + (p.d + rnd() * 6) / 111_195, lon: 9 + rnd() * 0.00003 }));
}

const step = (kind: WorkoutStepInput["kind"], label: string, type: WorkoutStepInput["completion_type"], value: number | null): WorkoutStepInput => ({
  kind, label, completion_type: type, completion_value: value, pace_min_s_km: null, pace_max_s_km: null, hr_min_bpm: null, hr_max_bpm: null,
});

const plan5x1000: WorkoutStepInput[] = [
  step("warmup", "Riscaldamento", "time", 600),
  ...Array.from({ length: 5 }, (_, i) => [
    { ...step("work", "1 km veloce", "distance", 1000), pace_min_s_km: 235, pace_max_s_km: 245 },
    ...(i < 4 ? [step("recovery", "Recupero", "time", 120)] : []),
  ]).flat(),
  step("cooldown", "Defaticamento", "time", 480),
];

const repSpeeds = [4.2, 4.25, 4.15, 4.1, 4.0];

function run5x1000() {
  const phases: Phase[] = [{ seconds: 620, speed: 2.9, hr: 135 }];
  repSpeeds.forEach((speed, i) => {
    phases.push({ seconds: Math.round(1000 / speed), speed, hr: 168 });
    if (i < 4) phases.push({ seconds: i === 2 ? 150 : 120, speed: 1.4, hr: 120 });
  });
  phases.push({ seconds: 500, speed: 2.8, hr: 138 });
  return simulate(phases);
}

test("the plan's repeats align on the watch distance", () => {
  const { distance, hr } = run5x1000();
  const result = analyzeIntervals({ distance, hr, structures: [{ source: "plan", steps: plan5x1000 }] });
  assert.equal(result.source, "plan");
  const work = result.segments.filter((s) => s.kind === "work");
  assert.equal(work.length, 5);
  work.forEach((segment, i) => {
    assert.ok(Math.abs(segment.distance_m! - 1000) <= 40, `rep ${i + 1}: ${segment.distance_m} m`);
    const expected = 1000 / repSpeeds[i];
    assert.ok(Math.abs(segment.duration_s - expected) <= 12, `rep ${i + 1}: ${segment.duration_s}s vs ${expected}`);
    assert.equal(segment.rep, i + 1);
    assert.equal(segment.reps, 5);
  });
  // The third recovery lasted longer: it must show.
  const recoveries = result.segments.filter((s) => s.kind === "recovery");
  assert.equal(recoveries.length, 4);
  assert.ok(recoveries[2].duration_s > recoveries[0].duration_s + 15, recoveries.map((r) => r.duration_s).join(","));
  assert.ok(recoveries.every((r) => (r.hr_drop ?? 0) > 10), "il cuore scende nei recuperi");
  assert.ok(result.summary!.fade_pct! > 0, "le ultime più lente");
  // Is 4:00/km slower than the 3:55–4:05 range? No: 1000/4.0 = 250 s/km → +5 s.
  assert.ok(work[4].pace_deviation_s! > 0);
  assert.equal(result.description, "5 × 1 km");
});

test("it also works with GPS only", () => {
  const { distance, hr } = run5x1000();
  const result = analyzeIntervals({ gps: toGps(distance), hr, structures: [{ source: "plan", steps: plan5x1000 }] });
  assert.equal(result.source, "plan");
  const work = result.segments.filter((s) => s.kind === "work");
  assert.equal(work.length, 5);
  work.forEach((segment, i) => {
    assert.ok(Math.abs(segment.duration_s - 1000 / repSpeeds[i]) <= 20, `rep ${i + 1}: ${segment.duration_s}s`);
  });
});

const notesStructure: WorkoutStepInput[] = Array.from({ length: 3 }, () => [
  step("work", "forte", "time", 180),
  step("recovery", "jog", "time", 60),
  step("work", "sprint", "time", 60),
]).flat();

test("the structure written in the note also finds undeclared pauses", () => {
  const phases: Phase[] = [{ seconds: 900, speed: 2.7, hr: 132 }];
  for (let set = 0; set < 3; set++) {
    phases.push({ seconds: 180, speed: 3.9, hr: 165 });
    phases.push({ seconds: 60, speed: 2.4, hr: 150 });
    phases.push({ seconds: 60, speed: 5.4, hr: 176 });
    if (set < 2) phases.push({ seconds: 90, speed: 1.3, hr: 125 });
  }
  phases.push({ seconds: 600, speed: 2.6, hr: 135 });
  const { distance, hr, bounds } = simulate(phases);
  const result = analyzeIntervals({ distance, hr, structures: [{ source: "notes", steps: notesStructure }] });
  assert.equal(result.source, "notes");
  const work = result.segments.filter((s) => s.kind === "work");
  assert.equal(work.length, 6);
  const forte = work.filter((s) => s.label === "forte");
  const sprint = work.filter((s) => s.label === "sprint");
  assert.equal(forte.length, 3);
  assert.equal(sprint.length, 3);
  forte.forEach((s) => assert.ok(Math.abs(s.duration_s - 180) <= 8, `forte ${s.duration_s}`));
  sprint.forEach((s) => assert.ok(Math.abs(s.duration_s - 60) <= 6, `sprint ${s.duration_s}`));
  // First repeat: starts after the 900 s warm-up.
  assert.ok(Math.abs(forte[0].start_s - bounds[1]) <= 6, `start ${forte[0].start_s}`);
  // Walked pauses after the sprint become recoveries.
  const walks = result.segments.filter((s) => s.kind === "recovery" && s.duration_s > 70);
  assert.equal(walks.length, 2);
  assert.ok(sprint.every((s) => s.pace_s_km! < forte[0].pace_s_km!), "lo sprint è più veloce");
  assert.equal(describeStructure(notesStructure), "3 × (3' forte + 1' jog + 1' sprint)");
});

test("without pauses between sprint and next stretch it doesn't invent recoveries", () => {
  const phases: Phase[] = [{ seconds: 600, speed: 2.7, hr: 132 }];
  for (let set = 0; set < 3; set++) {
    phases.push({ seconds: 180, speed: 3.9, hr: 165 }, { seconds: 60, speed: 2.4, hr: 150 }, { seconds: 60, speed: 5.4, hr: 176 });
  }
  phases.push({ seconds: 500, speed: 2.6, hr: 135 });
  const { distance, hr } = simulate(phases, 11);
  const result = analyzeIntervals({ distance, hr, structures: [{ source: "notes", steps: notesStructure }] });
  const main = result.segments.filter((s) => s.kind !== "warmup" && s.kind !== "cooldown");
  assert.deepEqual(main.map((s) => s.label), ["forte", "Jogging", "sprint", "forte", "Jogging", "sprint", "forte", "Jogging", "sprint"]);
  assert.deepEqual(main.map((s) => s.variant), [null, "jog", "sprint", null, "jog", "sprint", null, "jog", "sprint"]);
});

test("a planned but undone session produces no invented repeats", () => {
  const { distance, hr } = simulate([{ seconds: 3000, speed: 2.8, hr: 140 }]);
  const result = analyzeIntervals({ distance, hr, structures: [{ source: "plan", steps: plan5x1000 }] });
  assert.equal(result.source, "none");
  assert.equal(result.segments.length, 0);
});

test("without a structure it recognises a clear alternation on its own", () => {
  const phases: Phase[] = [{ seconds: 600, speed: 2.8, hr: 135 }];
  for (let i = 0; i < 6; i++) {
    phases.push({ seconds: 90, speed: 4.6, hr: 170 });
    phases.push({ seconds: 90, speed: 2.2, hr: 140 });
  }
  phases.push({ seconds: 400, speed: 2.7, hr: 135 });
  const { distance, hr } = simulate(phases);
  const result = analyzeIntervals({ distance, hr });
  assert.equal(result.source, "auto");
  const work = result.segments.filter((s) => s.kind === "work");
  assert.equal(work.length, 6);
  work.forEach((s) => assert.ok(Math.abs(s.duration_s - 90) <= 10, `${s.duration_s}`));
  assert.equal(result.segments[0].kind, "warmup");
  assert.equal(result.segments[result.segments.length - 1].kind, "cooldown");
});

test("a constant run has no repeats", () => {
  const { distance, hr } = simulate([{ seconds: 2400, speed: 3.0, hr: 145 }]);
  assert.equal(analyzeIntervals({ distance, hr }).source, "none");
});

const lap = (start_s: number, duration_s: number, distance_m: number, trigger: string, intensity: string | null = null): FitLap => ({
  start_s, duration_s, distance_m, avg_hr: null, max_hr: null, intensity, trigger, step: null,
});

test("automatic km laps are ignored, manual ones are not", () => {
  const auto = [lap(0, 330, 1000, "distance"), lap(330, 325, 1000, "distance"), lap(655, 200, 600, "sessionEnd")];
  assert.equal(areAutoLaps(auto), true);
  const { distance, hr } = run5x1000();
  // Manual laps pressed at every change: warm-up, 5 stretches, recoveries, cooldown.
  const phases = [620, ...repSpeeds.flatMap((s, i) => [Math.round(1000 / s), ...(i < 4 ? [i === 2 ? 150 : 120] : [])]), 500];
  let start = 0;
  const laps = phases.map((seconds, i) => {
    const from = distance[Math.max(0, start - 1)]?.d ?? 0;
    const to = distance[Math.min(distance.length - 1, start + seconds - 1)].d;
    const l = lap(start, seconds, Math.round(to - (start === 0 ? 0 : from)), i === phases.length - 1 ? "sessionEnd" : "manual");
    start += seconds;
    return l;
  });
  assert.equal(areAutoLaps(laps), false);
  const result = analyzeIntervals({ distance, hr, laps, structures: [{ source: "plan", steps: plan5x1000 }] });
  assert.equal(result.source, "laps");
  const work = result.segments.filter((s) => s.kind === "work");
  assert.equal(work.length, 5);
  // Labels come from the plan, times from the laps.
  assert.equal(work[0].label, "1 km veloce");
  assert.equal(work[0].duration_s, Math.round(1000 / repSpeeds[0]));
});

test("the coach lines summarise the repeats", async () => {
  const { intervalsForPrompt, intervalsOneLine } = await import("../lib/intervals-text.ts");
  const { distance, hr } = run5x1000();
  const result = analyzeIntervals({ distance, hr, structures: [{ source: "plan", steps: plan5x1000 }] });
  const line = intervalsOneLine(result)!;
  assert.match(line, /^5 × 1 km \(dal piano\): media tratti veloci \d:\d\d\/km/);
  const table = intervalsForPrompt(result)!;
  assert.equal(table.split("\n").filter((row) => /^\d+\. /.test(row)).length, 9);
  assert.match(table, /FC −\d+ nel recupero/);
  assert.equal(intervalsOneLine({ ...result, source: "none", segments: [] }), null);
});

test("the coach lines give cadence and pauses of the stretches", async () => {
  const { intervalsForPrompt, intervalsOneLine } = await import("../lib/intervals-text.ts");
  const { distance, hr, bounds } = run5x1000();
  const mid = Math.round((bounds[3] + bounds[4]) / 2);
  const cadence = distance.map((p) => ({ t: p.t, rpm: p.t < bounds[5] ? 84 : 81 }));
  const result = analyzeIntervals({
    distance: pauseWatch(distance, mid, 25),
    hr: pauseWatch(hr, mid, 25),
    cadence: pauseWatch(cadence, mid, 25),
    structures: [{ source: "plan", steps: plan5x1000 }],
  });
  assert.match(intervalsOneLine(result)!, /cadenza nei tratti veloci da 168 a 162 spm/);
  assert.match(intervalsOneLine(result)!, /di pause escluse da tempi e passi/);
  assert.match(intervalsForPrompt(result)!, /cadenza 168 spm/);
  assert.match(intervalsForPrompt(result)!, /di pausa \(fuori da tempo e passo\)/);
});

// The athlete's real session: warm-up, then 4 × (3' fast + 30" jogging
// + 30" sprint + 2' walking), HR with gaps. It must be recognised on its own.
function athleteSession(seed = 21) {
  const phases: Phase[] = [{ seconds: 320, speed: 2.99, hr: 140 }, { seconds: 40, speed: 1.2, hr: 135 }];
  for (let set = 0; set < 4; set++) {
    phases.push({ seconds: 180, speed: 3.75, hr: 165 }, { seconds: 30, speed: 2.05, hr: 160 }, { seconds: 33, speed: 4.8, hr: 172 });
    if (set < 3) phases.push({ seconds: set === 2 ? 180 : 130, speed: 1.3, hr: 125 });
  }
  phases.push({ seconds: 25, speed: 1.4, hr: 130 });
  const run = simulate(phases, seed);
  // The sensor loses HR for a few tens of seconds now and then.
  run.hr = run.hr.filter((p) => Math.floor(p.t / 50) % 3 !== 1);
  return run;
}

test("recognises fast, jogging, sprint and walking on its own", () => {
  const { distance, hr } = athleteSession();
  const result = analyzeIntervals({ distance, hr });
  assert.equal(result.source, "auto");
  assert.equal(result.segments[0].kind, "warmup", "il riscaldamento non è un tratto veloce");
  const main = result.segments.filter((s) => s.kind !== "warmup" && s.kind !== "cooldown");
  const pattern = main.map((s) => (s.kind === "work" ? (s.variant === "sprint" ? "S" : "V") : s.variant === "walk" ? "C" : s.variant === "jog" ? "J" : "?")).join("");
  assert.equal(pattern, "VJSCVJSCVJSCVJS");
  assert.match(result.description!, /^4 × \(3' veloce \+ 30" jogging \+ 3\d" sprint \+ 2'\d*"? ?camminata\)$/);
  const sprints = main.filter((s) => s.variant === "sprint");
  sprints.forEach((s) => assert.ok(Math.abs(s.duration_s - 33) <= 4, `sprint ${s.duration_s}`));
  assert.ok(sprints.every((s) => (s.max_speed_kmh ?? 0) > 16), "velocità di punta");
  assert.equal(result.summary!.work_count, 4);
  assert.equal(result.summary!.sprint!.count, 4);
  // With HR gaps every stretch still has a value.
  assert.ok(main.every((s) => s.avg_hr != null), main.map((s) => s.avg_hr).join(","));
});

test("strides at the end of an easy run", () => {
  const phases: Phase[] = [{ seconds: 2400, speed: 2.9, hr: 145 }];
  for (let i = 0; i < 6; i++) phases.push({ seconds: 20, speed: 5.2, hr: 160 }, { seconds: 60, speed: 2.4, hr: 145 });
  const { distance, hr } = simulate(phases, 5);
  const result = analyzeIntervals({ distance, hr });
  assert.equal(result.source, "auto");
  const sprints = result.segments.filter((s) => s.variant === "sprint");
  assert.equal(sprints.length, 6);
  assert.equal(result.segments[0].label, "Corsa facile");
  assert.match(result.description!, /^6 × \(20" sprint \+ 1' jogging\)$/);
});

test("climbs and descents of an easy run are not repeats", () => {
  const rnd = random(9);
  const distance: Array<{ t: number; d: number }> = [];
  let d = 0;
  for (let t = 1; t <= 3000; t++) {
    d += 2.9 * (1 + 0.12 * Math.sin((2 * Math.PI * t) / 240)) + rnd() * 0.3;
    distance.push({ t, d });
  }
  assert.equal(analyzeIntervals({ distance }).source, "none");
});

test("manual laps without intensity: classified at several levels", () => {
  const { distance, hr, bounds } = athleteSession(3);
  const laps = bounds.slice(0, -1).map((start, i) => lap(start, bounds[i + 1] - start, Math.round(distance[bounds[i + 1] - 1].d - (start ? distance[start - 1].d : 0)), i === bounds.length - 2 ? "sessionEnd" : "manual"));
  const result = analyzeIntervals({ distance, hr, laps });
  assert.equal(result.source, "laps");
  const main = result.segments.filter((s) => s.kind !== "warmup" && s.kind !== "cooldown");
  assert.equal(main.filter((s) => s.variant === "sprint").length, 4);
  assert.equal(main.filter((s) => s.variant === "walk").length, 3);
  assert.equal(main.filter((s) => s.variant === "jog").length, 4);
});

test("plan phases can be sprint, jogging or walking", async () => {
  const { stepKindLabel, describeStep, stepVariant } = await import("../lib/workout-guide.ts");
  const { estimateStep, stepIntensity } = await import("../lib/workout-estimate.ts");
  const { WorkoutStepsInputSchema } = await import("../lib/workout-steps.ts");
  const sprint = { ...step("work", "Sprint a tutta", "time", 20), variant: "sprint" as const };
  const walk = { ...step("recovery", "Cammina", "time", 120), variant: "walk" as const };
  const jog = { ...step("recovery", "Corricchia", "time", 30), variant: "jog" as const };
  assert.equal(stepKindLabel(itLabels, sprint), "Sprint");
  assert.equal(stepKindLabel(itLabels, walk), "Recupero camminando");
  assert.equal(stepKindLabel(itLabels, jog), "Recupero corricchiando");
  assert.equal(describeStep(itLabels, sprint), '20" a tutta');
  assert.equal(describeStep(itLabels, walk), "2' camminando");
  // Variant inconsistent with the type: ignored, breaks nothing.
  assert.equal(stepVariant({ kind: "warmup", variant: "sprint" }), null);
  assert.ok(estimateStep(walk).meters < estimateStep(jog).meters * 4 * 0.8, "si cammina più piano");
  assert.ok(stepIntensity(walk) < stepIntensity(jog));
  // The schema keeps the variant and discards unknown values without invalidating the session.
  const parsed = WorkoutStepsInputSchema.parse([sprint, { ...walk, variant: "boh" }]);
  assert.equal(parsed[0].variant, "sprint");
  assert.equal(parsed[1].variant, null);
  const block = [
    step("work", "Veloce", "time", 180), jog, sprint, walk,
    step("work", "Veloce", "time", 180), jog, sprint, walk,
    step("work", "Veloce", "time", 180), jog, sprint,
  ];
  assert.equal(describeStructure(block), `3 × (3' + 30" jogging + 20" sprint + 2' camminata)`);
});

test("declared structure with walking, but jogging slowly: the measured value holds", () => {
  const { distance, hr } = athleteSession(8);
  const declared: WorkoutStepInput[] = [];
  for (let set = 0; set < 4; set++) {
    declared.push(step("work", "veloce", "time", 180), { ...step("recovery", "jog", "time", 30), variant: "walk" }, { ...step("work", "sprint", "time", 30), variant: "sprint" });
    if (set < 3) declared.push({ ...step("recovery", "cammino", "time", 120), variant: "walk" });
  }
  const result = analyzeIntervals({ distance, hr, structures: [{ source: "notes", steps: declared }] });
  assert.equal(result.source, "notes");
  const recoveries = result.segments.filter((s) => s.kind === "recovery");
  assert.deepEqual(recoveries.map((s) => s.variant), ["jog", "walk", "jog", "walk", "jog", "walk", "jog"]);
  assert.equal(result.segments.filter((s) => s.variant === "sprint").length, 4);
});

/** Removes the points in an interval [from, to): the watch is paused, then restarts from the same point. */
function pauseWatch<P extends { t: number }>(series: P[], from: number, seconds: number): P[] {
  return series.map((p) => (p.t > from ? { ...p, t: p.t + seconds } : p));
}

test("a watch pause inside a repeat doesn't make it look slower", () => {
  const { distance, hr, bounds } = run5x1000();
  // 25" pause in the middle of the second repeat (phase 3: after warm-up and first recovery).
  const mid = Math.round((bounds[3] + bounds[4]) / 2);
  const paused = analyzeIntervals({
    distance: pauseWatch(distance, mid, 25),
    hr: pauseWatch(hr, mid, 25),
    structures: [{ source: "plan", steps: plan5x1000 }],
  });
  const plain = analyzeIntervals({ distance, hr, structures: [{ source: "plan", steps: plan5x1000 }] });
  const pace = (result: typeof plain) => result.segments.filter((s) => s.kind === "work").map((s) => s.pace_s_km!);
  pace(paused).forEach((value, i) => assert.ok(Math.abs(value - pace(plain)[i]) <= 3, `rep ${i + 1}: ${value} vs ${pace(plain)[i]}`));
});

test("a recovery done with the watch stopped stays a recovery; the pause is counted separately", () => {
  const { distance, hr, bounds } = run5x1000();
  // First recovery: the athlete pauses for 60" at the start.
  const at = bounds[2] + 5;
  const result = analyzeIntervals({
    distance: pauseWatch(distance, at, 60),
    hr: pauseWatch(hr, at, 60),
    structures: [{ source: "plan", steps: plan5x1000 }],
  });
  assert.equal(result.segments.filter((s) => s.kind === "work").length, 5);
  const first = result.segments.find((s) => s.kind === "recovery")!;
  // The pause doesn't enter the stretch's time but stays visible next to it.
  assert.ok(first.paused_s! >= 50, `pausa di ${first.paused_s}s`);
  assert.ok(first.duration_s + first.paused_s! >= 170, `recupero di ${first.duration_s}s + ${first.paused_s}s`);
});

// Tempo session like the one on 19/11: 5' easy, 3 × (8' + 2'), cooldown
// planned but not done; the watch closes a lap at every step plus a 5" lap.
const tempoPlan: WorkoutStepInput[] = [
  step("warmup", "Corsa facile per scaldarti", "time", 300),
  step("work", "Sostenuto", "time", 480),
  step("recovery", "Recupero corricchiando", "time", 120),
  step("work", "Sostenuto", "time", 480),
  step("recovery", "Recupero corricchiando", "time", 120),
  step("work", "Sostenuto", "time", 480),
  step("cooldown", "Chiudi al tuo passo facile", "time", 300),
];

function tempoRun() {
  return simulate([
    { seconds: 301, speed: 2.45, hr: 132 },
    { seconds: 480, speed: 3.08, hr: 166 },
    { seconds: 120, speed: 2.25, hr: 160 },
    { seconds: 480, speed: 3.18, hr: 173 },
    { seconds: 121, speed: 1.4, hr: 150 },
    { seconds: 484, speed: 3.21, hr: 172 },
  ]);
}

test("cooldown not done: the last repeat stays whole (plan laps)", () => {
  const { distance, hr, bounds } = tempoRun();
  const durations = [301, 480, 120, 480, 121, 479, 5];
  let start = 0;
  const laps = durations.map((seconds) => {
    const out = { ...lap(start, seconds, 0, ""), trigger: null, intensity: "active", distance_m: Math.round(distance[Math.min(distance.length - 1, start + seconds - 1)].d - (start ? distance[start - 1].d : 0)) };
    start += seconds;
    return out;
  });
  assert.equal(start, bounds[bounds.length - 1]);
  const result = analyzeIntervals({ distance, hr, laps, structures: [{ source: "plan", steps: tempoPlan }] });
  assert.equal(result.source, "laps");
  const work = result.segments.filter((s) => s.kind === "work");
  assert.deepEqual(work.map((s) => s.duration_s), [480, 480, 484]);
  assert.equal(result.segments.some((s) => s.kind === "cooldown"), false);
});

test("cooldown not done: the last repeat stays whole (no laps)", () => {
  const { distance, hr } = tempoRun();
  const result = analyzeIntervals({ distance, hr, structures: [{ source: "plan", steps: tempoPlan }] });
  assert.equal(result.source, "plan");
  const work = result.segments.filter((s) => s.kind === "work");
  assert.equal(work.length, 3);
  assert.ok(Math.abs(work[2].duration_s - 484) <= 15, `ultima ripetuta di ${work[2].duration_s}s`);
  assert.equal(result.segments.some((s) => s.kind === "cooldown"), false);
});

test("warm-up skipped: laps match from the first stretch", () => {
  const { distance, hr } = simulate([
    { seconds: 480, speed: 3.1, hr: 166 },
    { seconds: 120, speed: 2.2, hr: 150 },
    { seconds: 480, speed: 3.1, hr: 170 },
    { seconds: 120, speed: 2.2, hr: 150 },
    { seconds: 480, speed: 3.1, hr: 172 },
  ]);
  let start = 0;
  const laps = [480, 120, 480, 120, 480].map((seconds) => {
    const out = { ...lap(start, seconds, 0, ""), trigger: null, intensity: "active", distance_m: null };
    start += seconds;
    return out;
  });
  const result = analyzeIntervals({ distance, hr, laps, structures: [{ source: "plan", steps: tempoPlan }] });
  assert.equal(result.source, "laps");
  assert.equal(result.segments[0].kind, "work");
  assert.equal(result.segments.filter((s) => s.kind === "work").length, 3);
});

test("average cadence per stretch, without the seconds in pause", () => {
  const { distance, hr } = tempoRun();
  const cadence = distance.map((p) => ({ t: p.t, rpm: p.t > 301 && p.t <= 781 ? 84 : 78 }));
  const result = analyzeIntervals({ distance, hr, cadence, structures: [{ source: "plan", steps: tempoPlan }] });
  const first = result.segments.find((s) => s.kind === "work")!;
  assert.ok(Math.abs(first.cadence_spm! - 168) <= 2, `cadenza ${first.cadence_spm}`);
});

test("a stop with the watch recording is a pause, not a slowdown", () => {
  const { distance, hr } = simulate([
    { seconds: 300, speed: 2.5, hr: 130 },
    { seconds: 150, speed: 3.3, hr: 165 },
    { seconds: 40, speed: 0, hr: 140 },
    { seconds: 150, speed: 3.3, hr: 168 },
    { seconds: 120, speed: 2.0, hr: 150 },
    { seconds: 300, speed: 3.3, hr: 170 },
  ]);
  const steps = [
    step("warmup", "Riscaldamento", "time", 300),
    step("work", "5'", "time", 300),
    step("recovery", "Recupero", "time", 120),
    step("work", "5'", "time", 300),
  ];
  const result = analyzeIntervals({ distance, hr, structures: [{ source: "plan", steps }] });
  const first = result.segments.find((s) => s.kind === "work")!;
  assert.ok(first.paused_s! >= 30, `pausa ${first.paused_s}s`);
  assert.ok(Math.abs(first.duration_s - 300) <= 15, `durata ${first.duration_s}s`);
  assert.ok(Math.abs(first.pace_s_km! - 303) <= 10, `passo ${first.pace_s_km}`);
});

// ── The plan as a reference ────────────────────────────────────────────────

test("long run in the plan: the pace variations of 15 continuous km are not repeats", async () => {
  const { readFile } = await import("node:fs/promises");
  const raw = JSON.parse(await readFile(new URL("./fixtures/long-15k.json", import.meta.url), "utf8"));
  const run = {
    distance: raw.t.map((t: number, i: number) => ({ t, d: raw.d[i] })),
    hr: raw.hr.map(([t, bpm]: [number, number]) => ({ t, bpm })),
    cadence: raw.cad.map(([t, rpm]: [number, number]) => ({ t, rpm })),
    laps: raw.laps,
  };
  const long = analyzeIntervals({ ...run, planned: "long" });
  assert.equal(long.source, "none");
  assert.equal(long.segments.length, 0);
});

test("long run in the plan but clear repeats: shows them and says it wasn't the plan", () => {
  const phases: Phase[] = [{ seconds: 600, speed: 2.8, hr: 135 }];
  for (let i = 0; i < 6; i++) phases.push({ seconds: 180, speed: 4.4, hr: 170 }, { seconds: 90, speed: 2.0, hr: 140 });
  phases.push({ seconds: 400, speed: 2.7, hr: 135 });
  const { distance, hr } = simulate(phases);
  const result = analyzeIntervals({ distance, hr, planned: "long" });
  assert.equal(result.source, "auto");
  assert.equal(result.contradicts_plan, "long");
  assert.equal(result.segments.filter((s) => s.kind === "work").length, 6);
});

test("strides in an easy run of the plan: they stay, without contradicting the plan", () => {
  const phases: Phase[] = [{ seconds: 2400, speed: 2.9, hr: 145 }];
  for (let i = 0; i < 6; i++) phases.push({ seconds: 20, speed: 5.2, hr: 160 }, { seconds: 60, speed: 2.4, hr: 145 });
  const { distance, hr } = simulate(phases, 5);
  const result = analyzeIntervals({ distance, hr, planned: "easy" });
  assert.equal(result.source, "auto");
  assert.equal(result.contradicts_plan ?? null, null);
  assert.equal(result.segments.filter((s) => s.variant === "sprint").length, 6);
});

test("the coach has the last word only on automatically found repeats", async () => {
  const { withCoachVerdict } = await import("../lib/intervals-text.ts");
  const phases: Phase[] = [{ seconds: 600, speed: 2.8, hr: 135 }];
  for (let i = 0; i < 6; i++) phases.push({ seconds: 90, speed: 4.6, hr: 170 }, { seconds: 90, speed: 2.2, hr: 140 });
  const { distance, hr } = simulate(phases);
  const auto = analyzeIntervals({ distance, hr });
  assert.equal(withCoachVerdict(auto, { structured_session: false }), null);
  assert.equal(withCoachVerdict(auto, { structured_session: true }), auto);
  assert.equal(withCoachVerdict(auto, {}), auto);
  const declared = { ...auto, source: "plan" as const };
  assert.equal(withCoachVerdict(declared, { structured_session: false }), declared);
  // Strides in an easy run: the coach calls it continuous, but they stay.
  const easy: Phase[] = [{ seconds: 2400, speed: 2.9, hr: 145 }];
  for (let i = 0; i < 6; i++) easy.push({ seconds: 20, speed: 5.2, hr: 160 }, { seconds: 60, speed: 2.4, hr: 145 });
  const strides = analyzeIntervals({ ...simulate(easy, 5), planned: "easy" });
  assert.equal(strides.summary?.main, "sprint");
  assert.equal(withCoachVerdict(strides, { structured_session: false }), strides);
});

test("easy in the plan but 10 × 45\" clear: they stay, even if short", () => {
  const phases: Phase[] = [{ seconds: 600, speed: 2.8, hr: 135 }];
  for (let i = 0; i < 10; i++) phases.push({ seconds: 45, speed: 4.8, hr: 168 }, { seconds: 75, speed: 2.0, hr: 140 });
  phases.push({ seconds: 300, speed: 2.7, hr: 135 });
  const result = analyzeIntervals({ ...simulate(phases), planned: "easy" });
  assert.equal(result.source, "auto");
  // Under 75" detection calls them sprints: they pass as strides.
  assert.equal(result.segments.filter((s) => s.kind === "work" && s.duration_s >= 40 && s.duration_s <= 60).length, 9);
});
