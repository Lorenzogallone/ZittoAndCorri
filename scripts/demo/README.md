# Demo data and README screenshots

The screenshots in `docs/screenshots/` are generated from a **local** Supabase
stack filled with **invented** data. No production URL, key or user is ever
involved.

- `seed.mjs` creates "Alex Runner" (`demo@example.com`): a half-marathon goal in
  about ten weeks, eight weeks of runs with synthetic GPS tracks, splits and heart
  rate, a 14-day plan, 30 days of sleep/HRV/resting HR, a short coach conversation,
  coach memory and guidelines, and fake Gemini/Intervals.icu/Zepp connections. It
  also creates a second user (`newrunner@example.com`) that has not finished
  onboarding, for the welcome screen.
- `record.mjs` records a 14-second walk through the app (home, coach chat, 14-day
  plan, run detail with map and splits) as `docs/screenshots/demo.gif` and a lighter
  `demo.mp4`.
- `capture.mjs` opens the app in Chrome as an iPhone 15 Pro (393×852, light theme,
  English), signs in with the session cookies the seed wrote, and saves optimized
  PNGs.

## Safety

- The seed **refuses to run** unless `DEMO_SUPABASE_URL` (default
  `http://127.0.0.1:54321`) points at `127.0.0.1` or `localhost`. It never reads
  `.env*` files; the local keys come from `npx supabase status` or from the
  `DEMO_SUPABASE_SECRET_KEY` / `DEMO_SUPABASE_PUBLISHABLE_KEY` variables.
- It deletes and recreates the two demo users, so re-running is safe.
- The "API keys" it stores in the local Vault are obvious fakes; the UI only shows
  their last four characters. The coach messages are plain database rows, so no AI
  key is needed.
- Google login is not available locally. The seed creates the users with the
  Supabase admin API, signs in with a password through `@supabase/ssr` and
  `capture.mjs` installs those cookies. The app code is unchanged.
- The track is a hand-drawn loop over a public park in London; the places, race,
  names and numbers are made up. The map tiles (OpenFreeMap) and the weather
  forecast (Open-Meteo, rounded coordinates) are the only network calls.

## Regenerate the screenshots

Requirements: Docker (or Colima), Node, and Google Chrome.

1. Start the local Supabase stack. This applies every file in `supabase/migrations`.

   ```bash
   npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,realtime,storage-api,postgres-meta,supavisor
   ```

2. Seed it.

   ```bash
   node scripts/demo/seed.mjs
   ```

3. Build and start the app against the local stack, with the variables passed at
   runtime (do not use your real `.env.local`):

   ```bash
   eval "$(npx supabase status -o env | grep -E '^(PUBLISHABLE_KEY|SECRET_KEY)=')"
   export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" \
     SUPABASE_SECRET_KEY="$SECRET_KEY" CRON_SECRET=demo
   npm run build && npx next start -p 3100
   ```

   A production build avoids the Next.js dev overlay in the images. The URL must be
   `http://localhost:3100` (or set `DEMO_APP_URL` when seeding).

4. Install the capture tools **outside the repo** and take the screenshots.

   ```bash
   mkdir -p /tmp/demo-tools && (cd /tmp/demo-tools && npm init -y && npm i playwright-core sharp)
   DEMO_TOOLS_DIR=/tmp/demo-tools node scripts/demo/capture.mjs            # all shots
   DEMO_TOOLS_DIR=/tmp/demo-tools node scripts/demo/capture.mjs home plan  # some of them
   ```

   `DEMO_OUT` changes the output folder, `DEMO_SCALE` the pixel ratio (default 2).

5. Stop everything.

   ```bash
   npx supabase stop --no-backup
   ```

The demo story ("today's 5 × 1 km" in the chat) is written for a **Wednesday**; the
seed warns on other days.

Run steps 2 and 4 within ten minutes of each other: the seed marks the fake
Intervals.icu connection as just synced, and opening the app later than that would
try to import from the real Intervals.icu API with the fake key and show a sync
error banner.

## Regenerate the demo video

Same stack as above (steps 1-3: Supabase, seed, app), then:

```bash
brew install ffmpeg                                   # the GIF and MP4 are encoded with it
(cd /tmp/demo-tools && npx playwright-core install ffmpeg)   # Playwright's own recorder
DEMO_TOOLS_DIR=/tmp/demo-tools node scripts/demo/record.mjs
```

`record.mjs` visits every page once without recording (the app computes derived
metrics in the background), then records a 393×852 Chrome video with Playwright's
`recordVideo`, trims the page-load lead-in and encodes it with ffmpeg
(`palettegen`/`paletteuse`). The GIF is 360 px wide, 8 fps, 28 colours (about
2.9 MB); the MP4 is 720 px wide (about 1.3 MB). `DEMO_GIF_WIDTH`, `DEMO_GIF_FPS`,
`DEMO_GIF_COLORS` and `DEMO_MAX_SECONDS` tune size and length. The 10-minute rule
above applies here too: seed, then record.

## Screenshots

| File | Screen |
| --- | --- |
| `home.png` | Today's workout, week at a glance, coach chat |
| `coach.png` | Full-screen coach chat |
| `plan.png` | Goal, training phases and the 14-day plan |
| `activity.png` | Run detail with map and key numbers |
| `splits.png` | The same run, km by km |
| `profile.png` | Fitness status, goal, trends |
| `predictions.png` | Race predictions and pace in speed sessions |
| `settings.png` | Connections (Intervals.icu, Zepp) |
| `onboarding.png` | Welcome screen (optional: `capture.mjs onboarding`) |
