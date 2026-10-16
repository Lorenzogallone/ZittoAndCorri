# Zitto e Corri

Zitto e Corri is a mobile-first running coach delivered as a Progressive Web
App. It combines activity tracking, training plans, performance insights, and a
personal Gemini-powered coach in one installable web app.

The interface is currently in Italian.

## What it does

- Tracks running and other sports through manual entries or FIT/GPX imports.
- Shows routes, splits, heart-rate data, training load, and activity feedback.
- Manages race goals and a rolling 14-day training plan.
- Provides a conversational coach that can suggest plan changes for approval.
- Keeps each athlete's coach memory, preferences, and data separate.
- Supports automatic imports through a personal access key.
- Optionally uses health summaries from a compatible Zepp OS watch.
- Works as an installable PWA on mobile and desktop browsers.

## Requirements

- Node.js 20.9 or later
- npm
- A Supabase project
- Google OAuth configured in Supabase Authentication
- A Gemini API key for each user who wants AI coaching

## Getting started

Install the dependencies and create the local environment file:

```bash
npm install
cp .env.example .env.local
```

Set the following values in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-server-side-secret-key
```

Initialize the Supabase database with the SQL files in
`supabase/migrations`, then enable Google as an authentication provider. Add
your application's `/auth/callback` URL to the allowed redirect URLs in
Supabase.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, and
complete the onboarding flow. AI features remain disabled until the user adds a
personal Gemini key under **Settings → Coach**.

## Main areas

- **Coach** — dashboard, upcoming workout, weekly distance, and AI chat.
- **Activities** — manual entries, FIT/GPX uploads, maps, metrics, and feedback.
- **Plan** — the next 14 days of planned training.
- **Profile** — goals, training status, readiness, and account settings.
- **Settings** — athlete data, appearance, Gemini, imports, and Zepp OS.

## Activity imports

FIT and GPX files can be reviewed and imported directly from the Activities
screen. External services can use the personal import key generated in
**Settings → Imports** as a bearer token:

| Endpoint | Input |
| --- | --- |
| `POST /api/import` | One activity or an array of activities as JSON |
| `POST /api/import/gpx` | Raw GPX content |
| `POST /api/import/file` | A FIT or GPX file |

Send the key with `Authorization: Bearer <personal-import-key>`. Regenerating
the key immediately invalidates the previous one.

## Zepp OS integration

The optional Zepp OS companion sends health and recovery summaries from an
Amazfit Active 3 Premium. It does not replace FIT/GPX activity imports and it
does not create workouts automatically.

Enable Zepp OS in Settings, generate the six-digit pairing code, and complete
the connection from the Zepp phone app. Build and installation instructions are
available in the [Zepp OS companion README](zepp-app/README.md).

## Notifications

Push notifications are optional: workout reminder for tomorrow, "analysis
ready" after each activity, and a Monday recap from the coach. Apply
`supabase/migrations/0019_push_notifications.sql`, then generate a VAPID key
pair and set the variables listed in `.env.example`:

```bash
npx web-push generate-vapid-keys
```

Users enable notifications per device in **Settings → Notifiche** (on iPhone,
the app must be added to the Home Screen first). The section is hidden when
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is not set.

The scheduled jobs are plain endpoints protected by `CRON_SECRET`:

| Endpoint | Schedule (UTC) | Purpose |
| --- | --- | --- |
| `GET /api/cron/daily` | `30 16 * * *` | Reminder for tomorrow's planned workout |
| `GET /api/cron/weekly` | `0 6 * * 1` | Recap of the previous week, saved in the coach chat |

On Vercel they run automatically from `vercel.json` (Vercel sends
`CRON_SECRET` as the bearer token). Any other scheduler can call them with
`Authorization: Bearer <CRON_SECRET>`.

## PWA installation

Deploy the app over HTTPS, open it in a supported browser, and choose **Install
app** or **Add to Home Screen**. The installed PWA uses the same account and data
as the browser version.

## Security and data

- Supabase Row Level Security separates user data.
- The Supabase secret key is used only by server-side code.
- Gemini keys are supplied by users and stored encrypted through Supabase
  Vault.
- Zepp OS uses a dedicated revocable token created during pairing.
- Import keys and pairing codes should be treated as private credentials.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build |
| `npm run test:core` | Run the core test suite |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Run ESLint |

Before deploying, run:

```bash
npm run test:core
npm run typecheck
npm run lint
npm run build
```

The production environment uses the same three Supabase variables shown above.
Make sure the public application URL is configured in Supabase Authentication
and that the deployment supports HTTPS.
