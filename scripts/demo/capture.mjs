#!/usr/bin/env node
// Takes the README screenshots of the demo app (iPhone 15 Pro, light, English).
//
// Needs `playwright-core` and `sharp`, which are NOT project dependencies:
//   mkdir -p /tmp/demo-tools && cd /tmp/demo-tools && npm init -y && npm i playwright-core sharp
//   DEMO_TOOLS_DIR=/tmp/demo-tools node scripts/demo/capture.mjs [shot ...]
//
// Run scripts/demo/seed.mjs first (it writes .out/session.json) and start the
// app against the LOCAL Supabase (see README). Uses the installed Google Chrome.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const toolsDir = resolve(process.env.DEMO_TOOLS_DIR ?? process.cwd());
const require = createRequire(join(toolsDir, "noop.js"));
const { chromium } = require("playwright-core");
const sharp = require("sharp");

const session = JSON.parse(readFileSync(join(here, ".out", "session.json"), "utf8"));
const appUrl = new URL(session.appUrl);
if (!["localhost", "127.0.0.1"].includes(appUrl.hostname) || !["127.0.0.1", "localhost"].includes(new URL(session.supabaseUrl).hostname)) {
  console.error("capture: refusing to run against a non-local app or Supabase.");
  process.exit(1);
}
const outDir = resolve(process.env.DEMO_OUT ?? join(here, "..", "..", "docs", "screenshots"));
mkdirSync(outDir, { recursive: true });

/**
 * One entry per screenshot. `who` picks the signed-in user, `scrollText` is the
 * text of an element to bring near the top of the page before shooting and
 * `click` the aria-label of a button to press first.
 */
const SHOTS = [
  { name: "home", path: "/", who: "alex", settle: 1500 },
  { name: "coach", path: "/", who: "alex", settle: 1500, click: "Expand the chat to full screen" },
  { name: "plan", path: "/plan", who: "alex", settle: 1000 },
  { name: "activity", path: `/activities/${session.showcaseActivityId}`, who: "alex", settle: 5000 },
  { name: "profile", path: "/profile", who: "alex", settle: 1500 },
  { name: "predictions", path: "/profile", who: "alex", settle: 1500, scrollText: "Performance" },
  { name: "settings", path: "/settings?tab=links", who: "alex", settle: 1500 },
  { name: "onboarding", path: "/onboarding", who: "newcomer", settle: 1200 },
];

const wanted = process.argv.slice(2);
const shots = wanted.length ? SHOTS.filter((shot) => wanted.includes(shot.name)) : SHOTS;

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function contextFor(who) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: Number(process.env.DEMO_SCALE ?? 2),
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: "Europe/Rome",
    colorScheme: "light",
    serviceWorkers: "block",
  });
  await context.addCookies([
    ...session[who].cookies.map(({ name, value }) => ({ name, value, url: session.appUrl, sameSite: "Lax" })),
    { name: "NEXT_LOCALE", value: "en", url: session.appUrl, sameSite: "Lax" },
  ]);
  // Hide the framework portal if a dev build is being used.
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  });
  return context;
}

const contexts = {};
for (const who of new Set(shots.map((shot) => shot.who))) contexts[who] = await contextFor(who);

async function open(page, shot) {
  await page.goto(new URL(shot.path, appUrl).href, { waitUntil: "networkidle" });
  await page.waitForTimeout(shot.settle ?? 1000);
}

// Warm-up: the app fills in derived metrics (records, moving time) in the
// background after the first visit, so everything is visited once before shooting.
for (const shot of shots) {
  const page = await contexts[shot.who].newPage();
  await open(page, shot);
  await page.close();
}
await new Promise((resolveWait) => setTimeout(resolveWait, 4000));

for (const shot of shots) {
  const page = await contexts[shot.who].newPage();
  await open(page, shot);
  if (shot.click) {
    await page.getByLabel(shot.click).first().click();
    await page.waitForTimeout(800);
  }
  if (shot.scrollText) {
    // The app scrolls inside <main>, not the window.
    await page.evaluate((text) => {
      const heading = [...document.querySelectorAll("h1,h2,h3,p,span")].find((el) => el.textContent?.trim() === text);
      const main = document.querySelector("main");
      if (heading && main) main.scrollTop += heading.getBoundingClientRect().top - main.getBoundingClientRect().top - 24;
    }, shot.scrollText);
    await page.waitForTimeout(600);
  }
  const raw = await page.screenshot({ type: "png" });
  const optimized = await sharp(raw).png({ palette: true, quality: 85, effort: 10, compressionLevel: 9 }).toBuffer();
  const file = join(outDir, `${shot.name}.png`);
  writeFileSync(file, optimized);
  console.log(`${shot.name}.png  ${(optimized.length / 1024).toFixed(0)} KB`);
  await page.close();
}

await browser.close();
