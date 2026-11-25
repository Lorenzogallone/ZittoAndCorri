#!/usr/bin/env node
// Records the README demo video (iPhone 15 Pro, light, English) and turns it into
// docs/screenshots/demo.gif and demo.mp4 with ffmpeg.
//
// Needs `playwright-core` (not a project dependency) and ffmpeg on the PATH:
//   mkdir -p /tmp/demo-tools && cd /tmp/demo-tools && npm init -y && npm i playwright-core
//   DEMO_TOOLS_DIR=/tmp/demo-tools node scripts/demo/record.mjs
//
// Run scripts/demo/seed.mjs first (it writes .out/session.json) and start the app
// against the LOCAL Supabase (see README). Uses the installed Google Chrome.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const toolsDir = resolve(process.env.DEMO_TOOLS_DIR ?? process.cwd());
const { chromium } = createRequire(join(toolsDir, "noop.js"))("playwright-core");

const session = JSON.parse(readFileSync(join(here, ".out", "session.json"), "utf8"));
const appUrl = new URL(session.appUrl);
if (!["localhost", "127.0.0.1"].includes(appUrl.hostname) || !["127.0.0.1", "localhost"].includes(new URL(session.supabaseUrl).hostname)) {
  console.error("record: refusing to run against a non-local app or Supabase.");
  process.exit(1);
}
const outDir = resolve(process.env.DEMO_OUT ?? join(here, "..", "..", "docs", "screenshots"));
const workDir = join(here, ".out", "video");
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const GIF_WIDTH = Number(process.env.DEMO_GIF_WIDTH ?? 360);
const GIF_FPS = Number(process.env.DEMO_GIF_FPS ?? 8);
const GIF_COLORS = Number(process.env.DEMO_GIF_COLORS ?? 28);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

function newContext(extra = {}) {
  return browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: "Europe/Rome",
    colorScheme: "light",
    serviceWorkers: "block",
    ...extra,
  });
}

async function signIn(context) {
  await context.addCookies([
    ...session.alex.cookies.map(({ name, value }) => ({ name, value, url: session.appUrl, sameSite: "Lax" })),
    { name: "NEXT_LOCALE", value: "en", url: session.appUrl, sameSite: "Lax" },
  ]);
}

// Warm-up: the app fills in derived metrics in the background after the first visit.
const warm = await newContext();
await signIn(warm);
for (const path of ["/", "/plan", "/activities", `/activities/${session.showcaseActivityId}`]) {
  const page = await warm.newPage();
  await page.goto(new URL(path, appUrl).href, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  await page.close();
}
await warm.close();
await pause(3000);

// The recording itself. Video size = viewport, so the file is 393×852.
const context = await newContext({ recordVideo: { dir: workDir, size: { width: 393, height: 852 } } });
await signIn(context);
const page = await context.newPage();
const t0 = Date.now();

/** Eased scroll of an element (the app scrolls inside <main>, not the window). */
async function scroll(selector, to, ms) {
  await page.evaluate(
    ([sel, target, duration]) =>
      new Promise((done) => {
        const el = document.querySelector(sel);
        const from = el.scrollTop;
        const end = target === "end" ? el.scrollHeight : target === "start" ? 0 : target;
        const begin = performance.now();
        const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
        const tick = (now) => {
          const p = Math.min(1, (now - begin) / duration);
          el.scrollTop = from + (end - from) * ease(p);
          p < 1 ? requestAnimationFrame(tick) : done();
        };
        requestAnimationFrame(tick);
      }),
    [selector, to, ms],
  );
}
const tab = async (href) => {
  await page.locator(`a[href="${href}"]:visible`).last().click();
  await page.waitForLoadState("networkidle");
};

// 1. Home: today's workout.
await page.goto(appUrl.href, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
const start = (Date.now() - t0) / 1000;
await page.waitForTimeout(1300);
await scroll("main", 260, 1200);
await page.waitForTimeout(500);

// 2. Coach chat: open it full screen and read back through the conversation.
await page.getByLabel("Expand the chat to full screen").first().click();
await page.waitForTimeout(700);
await scroll("div.overflow-y-auto.overscroll-contain", "start", 2400);
await page.waitForTimeout(300);
await page.getByLabel(/collapse/i).first().click();
await page.waitForTimeout(400);

// 3. 14-day plan.
await tab("/plan");
await page.waitForTimeout(900);
await scroll("main", 520, 1600);
await page.waitForTimeout(300);

// 4. Run detail: map and splits.
await tab("/activities");
await page.waitForTimeout(300);
await page.locator(`a[href="/activities/${session.showcaseActivityId}"]`).first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);
await scroll("main", 900, 2400);
await page.waitForTimeout(800);
const end = (Date.now() - t0) / 1000;

const videoPath = await page.video().path();
await context.close();
await browser.close();

// Convert: trim the page-load lead-in, then palette-based GIF + lighter MP4.
const length = Math.min(end, Number(process.env.DEMO_MAX_SECONDS ?? 14) + start) - start;
const source = readdirSync(workDir).find((f) => f.endsWith(".webm")) ?? videoPath;
const input = join(workDir, source);
const trim = ["-ss", start.toFixed(2), "-t", length.toFixed(2), "-i", input];
const gif = join(outDir, "demo.gif");
const mp4 = join(outDir, "demo.mp4");
const scale = `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...trim, "-vf", `${scale},split[a][b];[a]palettegen=max_colors=${GIF_COLORS}:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, "-loop", "0", gif], { stdio: "inherit" });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...trim, "-vf", "scale=720:-2:flags=lanczos,fps=30", "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4], { stdio: "inherit" });
console.log(`demo.gif / demo.mp4 written to ${outDir} (${length.toFixed(1)} s)`);
