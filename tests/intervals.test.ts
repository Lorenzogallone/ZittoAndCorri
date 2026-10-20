import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIntervals, areAutoLaps, describeStructure, type FitLap } from "../lib/metrics/intervals.ts";
import type { WorkoutStepInput } from "../lib/types.ts";

// Corsa sintetica: fasi a velocità costante con rumore deterministico.
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

/** Traccia GPS lungo un meridiano con errore di posizione di qualche metro. */
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

test("le ripetute del piano si allineano sulla distanza dell'orologio", () => {
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
  // Il terzo recupero è durato di più: deve vedersi.
  const recoveries = result.segments.filter((s) => s.kind === "recovery");
  assert.equal(recoveries.length, 4);
  assert.ok(recoveries[2].duration_s > recoveries[0].duration_s + 15, recoveries.map((r) => r.duration_s).join(","));
  assert.ok(recoveries.every((r) => (r.hr_drop ?? 0) > 10), "il cuore scende nei recuperi");
  assert.ok(result.summary!.fade_pct! > 0, "le ultime più lente");
  // 4:00/km è più lento del range 3:55–4:05? No: 1000/4.0 = 250 s/km → +5 s.
  assert.ok(work[4].pace_deviation_s! > 0);
  assert.equal(result.description, "5 × 1 km");
});

test("funziona anche con il solo GPS", () => {
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

test("la struttura scritta nella nota trova anche le pause non dichiarate", () => {
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
  // Prima ripetuta: inizia dopo il riscaldamento di 900 s.
  assert.ok(Math.abs(forte[0].start_s - bounds[1]) <= 6, `start ${forte[0].start_s}`);
  // Le pause camminate dopo lo sprint diventano recuperi.
  const walks = result.segments.filter((s) => s.kind === "recovery" && s.duration_s > 70);
  assert.equal(walks.length, 2);
  assert.ok(sprint.every((s) => s.pace_s_km! < forte[0].pace_s_km!), "lo sprint è più veloce");
  assert.equal(describeStructure(notesStructure), "3 × (3' forte + 1' jog + 1' sprint)");
});

test("senza pause tra sprint e tratto successivo non inventa recuperi", () => {
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

test("una seduta pianificata ma non fatta non produce ripetute inventate", () => {
  const { distance, hr } = simulate([{ seconds: 3000, speed: 2.8, hr: 140 }]);
  const result = analyzeIntervals({ distance, hr, structures: [{ source: "plan", steps: plan5x1000 }] });
  assert.equal(result.source, "none");
  assert.equal(result.segments.length, 0);
});

test("senza struttura riconosce da solo un'alternanza netta", () => {
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

test("una corsa costante non ha ripetute", () => {
  const { distance, hr } = simulate([{ seconds: 2400, speed: 3.0, hr: 145 }]);
  assert.equal(analyzeIntervals({ distance, hr }).source, "none");
});

const lap = (start_s: number, duration_s: number, distance_m: number, trigger: string, intensity: string | null = null): FitLap => ({
  start_s, duration_s, distance_m, avg_hr: null, max_hr: null, intensity, trigger, step: null,
});

test("i lap automatici a km vengono ignorati, quelli manuali no", () => {
  const auto = [lap(0, 330, 1000, "distance"), lap(330, 325, 1000, "distance"), lap(655, 200, 600, "sessionEnd")];
  assert.equal(areAutoLaps(auto), true);
  const { distance, hr } = run5x1000();
  // Lap manuali premuti a ogni cambio: riscaldamento, 5 tratti, recuperi, defaticamento.
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
  // Le etichette arrivano dal piano, i tempi dai lap.
  assert.equal(work[0].label, "1 km veloce");
  assert.equal(work[0].duration_s, Math.round(1000 / repSpeeds[0]));
});

test("le righe per il coach riassumono le ripetute", async () => {
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

// Sessione reale dell'atleta: riscaldamento, poi 4 × (3' veloce + 30" jogging
// + 30" sprint + 2' camminata), FC con buchi. Va riconosciuta da sola.
function athleteSession(seed = 21) {
  const phases: Phase[] = [{ seconds: 320, speed: 2.99, hr: 140 }, { seconds: 40, speed: 1.2, hr: 135 }];
  for (let set = 0; set < 4; set++) {
    phases.push({ seconds: 180, speed: 3.75, hr: 165 }, { seconds: 30, speed: 2.05, hr: 160 }, { seconds: 33, speed: 4.8, hr: 172 });
    if (set < 3) phases.push({ seconds: set === 2 ? 180 : 130, speed: 1.3, hr: 125 });
  }
  phases.push({ seconds: 25, speed: 1.4, hr: 130 });
  const run = simulate(phases, seed);
  // Il sensore perde la FC per qualche decina di secondi ogni tanto.
  run.hr = run.hr.filter((p) => Math.floor(p.t / 50) % 3 !== 1);
  return run;
}

test("riconosce da sola veloce, jogging, sprint e camminata", () => {
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
  // Con i buchi della FC ogni tratto ha comunque un valore.
  assert.ok(main.every((s) => s.avg_hr != null), main.map((s) => s.avg_hr).join(","));
});

test("allunghi alla fine di una corsa facile", () => {
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

test("le salite e discese di una corsa facile non sono ripetute", () => {
  const rnd = random(9);
  const distance: Array<{ t: number; d: number }> = [];
  let d = 0;
  for (let t = 1; t <= 3000; t++) {
    d += 2.9 * (1 + 0.12 * Math.sin((2 * Math.PI * t) / 240)) + rnd() * 0.3;
    distance.push({ t, d });
  }
  assert.equal(analyzeIntervals({ distance }).source, "none");
});

test("lap manuali senza intensità: classificati a più livelli", () => {
  const { distance, hr, bounds } = athleteSession(3);
  const laps = bounds.slice(0, -1).map((start, i) => lap(start, bounds[i + 1] - start, Math.round(distance[bounds[i + 1] - 1].d - (start ? distance[start - 1].d : 0)), i === bounds.length - 2 ? "sessionEnd" : "manual"));
  const result = analyzeIntervals({ distance, hr, laps });
  assert.equal(result.source, "laps");
  const main = result.segments.filter((s) => s.kind !== "warmup" && s.kind !== "cooldown");
  assert.equal(main.filter((s) => s.variant === "sprint").length, 4);
  assert.equal(main.filter((s) => s.variant === "walk").length, 3);
  assert.equal(main.filter((s) => s.variant === "jog").length, 4);
});

test("le fasi del piano sanno essere sprint, jogging o camminata", async () => {
  const { stepKindLabel, describeStep, stepVariant } = await import("../lib/workout-guide.ts");
  const { estimateStep, stepIntensity } = await import("../lib/workout-estimate.ts");
  const { WorkoutStepsInputSchema } = await import("../lib/workout-steps.ts");
  const sprint = { ...step("work", "Sprint a tutta", "time", 20), variant: "sprint" as const };
  const walk = { ...step("recovery", "Cammina", "time", 120), variant: "walk" as const };
  const jog = { ...step("recovery", "Corricchia", "time", 30), variant: "jog" as const };
  assert.equal(stepKindLabel(sprint), "Sprint");
  assert.equal(stepKindLabel(walk), "Recupero camminando");
  assert.equal(stepKindLabel(jog), "Recupero corricchiando");
  assert.equal(describeStep(sprint), '20" a tutta');
  assert.equal(describeStep(walk), "2' camminando");
  // Variante incoerente con il tipo: ignorata, non rompe nulla.
  assert.equal(stepVariant({ kind: "warmup", variant: "sprint" }), null);
  assert.ok(estimateStep(walk).meters < estimateStep(jog).meters * 4 * 0.8, "si cammina più piano");
  assert.ok(stepIntensity(walk) < stepIntensity(jog));
  // Lo schema conserva la variante e scarta valori sconosciuti senza invalidare la seduta.
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

test("la struttura dichiarata con camminata, ma corricchiando: vale il misurato", () => {
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
