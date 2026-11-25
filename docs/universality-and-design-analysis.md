# Zitto e Corri for everyone: how universal the app is, and how to improve its design and UX

Date: 1 November 2026. Subject: (1) what prevents an ordinary user from using
the app and setting up their own data today; (2) which Claude Code design and
UX skills are worth it, and which concrete improvements they suggest, with
reference to the installed PWA on iPhone 15 Pro.

Tags: **[CODE]** verified in the repository, **[DOC]** documentation or primary
file read, **[3P]** third-party source, **[TO VERIFY]** not confirmed.

---

## 1. Summary

1. **The app is already multi-user in its data model, not in its experience.** Each
   user has separate data (RLS), separate coach memory, theme, AI keys and
   integrations [CODE]. But four choices make it, in practice, "Lorenzo's app":
   Google-only login, Coach AI only with a Gemini or OpenRouter key brought by the
   user, a fixed Europe/Rome time zone in 27 files, and fixed language and units
   (Italian, km). For an Italian runner with a Google account who is willing to
   get an AI key, it works well; for anyone else it is a wall at the entrance.
2. **The highest wall is the AI key.** Without a key there is no chat, no plan, no
   run analysis: that is the core of the app. The first step to make it universal
   is a **free plan with the app's key and a monthly spending cap per user**, with
   a personal key as the "no limits" option. The repo already tracks per-user costs
   (`ai_usage_events`, migration 0024) [CODE]: only the policy is missing.
3. **Personal data: it can be set in the app, but the data a generic runner needs
   is missing.** Three-step onboarding (HR, goal, key) and an editable profile
   [CODE]. Missing: an automatic max HR estimate from age, sex and weight (for
   calories and estimates), language, units, time zone, first day of the week,
   training-day preferences, and a reference pace or a recent time over a distance
   (for those without imported runs). And account deletion and data export are
   missing from the app entirely.
4. **Design and PWA are already well handled**: design system with tokens, light and
   dark theme in sync, safe areas managed, standalone splash, pill-shaped tab bar,
   skeletons on five screens, 82 ARIA attributes [CODE]. The improvements are
   refinements, not a rebuild. The most urgent is a single line: `userScalable:
   false` and `maximumScale: 1` in `app/layout.tsx` block zoom, an accessibility
   problem that every guide cites.
5. **Recommended skills**: `emilkowalski/skills` (`mobile-native` and
   `apple-design`), `vercel-labs/agent-skills` (`web-design-guidelines`) and
   `pbakaus/impeccable`. Avoid `ui-ux-pro-max` (it generates a new palette instead
   of respecting the brand) and "PWA" skills of uncertain origin.

---

## 2. How universal it is today

### 2.1 What is already there [CODE]

| Area | Status |
| --- | --- |
| Data separation | RLS on all tables; coach, memory, keys and integrations per user |
| Onboarding | 3 steps: max/resting HR and birth date, optional goal, optional Gemini key; gate in `lib/supabase/proxy.ts` |
| Profile | Max HR, resting HR, birth date; watch values with precedence and source shown |
| Settings | Heat, theme (mode, accent, style), push notifications, Gemini, OpenRouter, models per task and costs, coach memory, Zepp, Intervals.icu, import key |
| Goals | Race with date and time, or generic distance |
| Import | Manual, FIT/GPX, iOS Shortcut, automatic Intervals.icu |
| PWA | Manifest, service worker with precache, splash, diagnostics, push notifications |

### 2.2 The barriers, in order of impact

**1. Coach AI only with your own key.** Chat, plan proposals, run analysis, the
Monday summary: everything goes through `getAiConfig`, which returns null without
a Gemini or OpenRouter key [CODE]. A new user sees the link "Add a Gemini or
OpenRouter key to chat with the coach" and stops there: creating a key in Google
AI Studio is a developer step.

Proposal: three tiers, chosen by the server.
- **Included**: the app's key (environment variable), a cheap model, a monthly cap
  per user in euros or tokens, counted with `ai_usage_events`. When the cap is
  exceeded: a clear message and an invitation to add your own key.
- **Personal**: as today (Gemini or OpenRouter), no limits.
- **Disabled**: the app stays useful without AI (manual plan, statistics).
One policy column and one check in `getAiConfig` are enough. Estimated cost: 1 day.

**2. Google only.** `signInWithOAuth({ provider: "google" })` is the only route
[CODE]. On iPhone, users expect "Sign in with Apple" and "email link". Supabase
supports both; Apple requires configuring the Services ID. With the email magic
link (OTP), anyone can be covered with no new external configuration. Cost: half a
day for OTP, one day for Apple.

**3. Fixed time zone.** `Europe/Rome` and `romeDay()` appear in 27 files [CODE]:
cron jobs, plan, "today", weekly statistics, weather. For a user outside Italy the
day changes at the wrong time and reminders arrive at the wrong moment. Proposal:
a `profiles.timezone` column (default `Europe/Rome`), read once per request and
passed to the functions that call `romeDay()` today; cron jobs iterate per user
with their own time zone. It is the longest refactor on the list (2–3 days) and
can wait while the audience is Italian.

**4. Language and units.** Interface, coach prompts and methodology are in Italian;
kilometres and min/km everywhere, `it-IT` formatting in 41 places [CODE]. For an
Italian audience this is fine. If the goal is "everyone", the right order is: first
units (miles/min/mi as a preference, 1 day), then English (string extraction, 3–5
days, coach prompts included).

**5. Physiological data missing or too technical.**
- The first onboarding step asks for max and resting HR: most runners don't know
  them. Without them, `hrZones()` returns null and zones, time in zone and part of
  readiness disappear [CODE]. Proposal: an automatic estimate from age (Tanaka:
  208 − 0.7 × age), labelled "estimated", replaced by the watch values or manual
  ones when they arrive.
- **Sex and weight** are missing (calories, VO₂ estimates, reference HRV), and a
  **starting pace**: a recent time over 5 or 10 km, or the level "beginner /
  intermediate / expert". Today the coach's first plan starts with no level data
  if no runs are imported.
- **Available days** and **preferred long-run day** are missing: the coach infers
  them from chat, but they belong in the profile.

**6. Account and data.** There is no "Delete account" or "Export my data" [CODE].
For a service open to others these are required (GDPR) and belong in Settings →
App: deletion with confirmation (an RPC that deletes `auth.users`; the cascades
handle the rest) and JSON export of activities, plan and chat. Cost: 1 day.

**7. Watch integrations are not neutral.** The "Zepp watch" section assumes an
Amazfit; Intervals.icu, however, also covers Garmin, Coros, Polar, Suunto and Wahoo
[3P: Intervals.icu connects the main brands]. It is enough to rename the section
"Watch and platforms" and explain that Intervals.icu works with any brand; Zepp
stays one more option.

### 2.3 Proposed priority (universality)

| # | Intervention | Effort | Effect |
| --- | --- | --- | --- |
| 1 | AI "included" with monthly cap + optional personal key | 1 d | Removes the main barrier |
| 2 | Email login (OTP) and Apple | 0.5–1.5 d | Everyone can get in |
| 3 | Estimated max HR from age; sex, weight, level/pace in profile and onboarding | 1 d | Sensible plans from day one |
| 4 | Account deletion and data export | 1 d | Requirement to open up to others |
| 5 | Units (km/mi) as a preference | 1 d | English-speaking audience |
| 6 | Time zone per user | 2–3 d | Users outside Italy |
| 7 | English (i18n) | 3–5 d | Only with a real audience |

---

## 3. Design and UX skills: which are worth it

The organisation's skill catalogue has nothing on design. Among the public ones,
read directly in the repositories:

| Skill | What it does | Verdict |
| --- | --- | --- |
| **`emilkowalski/skills` → `mobile-native`, `apple-design`** (Emil Kowalski, ex Vercel/Linear) [DOC] | CSS and meta fixes that separate "site in a browser" from "installed app": hover only with `(hover: hover)`, tap highlight, `100dvh`, inputs ≥ 16px, `touch-action: manipulation`, overscroll, `viewport-fit=cover` + safe area, theme-color per scheme, `inputmode`/`enterkeyhint`; `apple-design` translates the WWDC principles (latency, interruptions, springs, reduced motion) | **Install.** The only one made for our exact case. Rule 4: "never disable zoom" |
| **`vercel-labs/agent-skills` → `web-design-guidelines`** [DOC] | Pulls ~100 rules (accessibility, focus, forms, animations, safe area, dark mode, i18n) and returns `file:line` findings | **Install** as a repeatable reviewer before merges. It does not generate design |
| **`pbakaus/impeccable`** (Paul Bakaus) [DOC] | 24 commands: `critique`, `audit` (accessibility, performance, theme, responsive), `polish`, `onboard` (first use and empty states), `typeset`, `quieter`; a deterministic "slop" detector | **Install** for visual hierarchy, typography, empty states. Decline the automatic hook and turn off telemetry (`DO_NOT_TRACK=1`) |
| `anthropics/skills` → `frontend-design` [DOC] | Taste and anti-cliché guidance for new pages | Redundant with Impeccable; aimed at landing pages |
| `nextlevelbuilder/ui-ux-pro-max` [DOC] | Design-system generator from CSV (palette, fonts, styles); requires Python | **Avoid**: it proposes a new palette instead of respecting the brand; its mobile rules are written for native apps |
| various "PWA" skills (`dotagents/pwa`, `mobile-ux-optimizer`) [3P] | Manifest and safe-area boilerplate | Avoid: uncertain author, duplicates `mobile-native` |

Installation (from the project folder):

```bash
npx skills@latest add emilkowalski/skills
npx skills add vercel-labs/agent-skills
npx impeccable install   # or /plugin marketplace add pbakaus/impeccable
```

Conflicts to decide and write into `AGENTS.md`:
- **Capitalisation**: Vercel wants English Title Case; for Italian, sentence case
  applies, as the app already does.
- **Overscroll**: Emil turns it off globally, Vercel only with a fine pointer. In a
  standalone PWA on iPhone there is no browser pull-to-refresh: Emil's rule, already
  applied in `globals.css` (`overscroll-behavior-y: none`), is fine.
- **Hover**: in Tailwind v4 `hover:` is already limited to `(hover: hover)`; never
  write `:hover` in plain CSS.
- **Zoom**: the example in the Next 16 documentation (`generate-viewport.md`) uses
  `maximumScale: 1, userScalable: false`; the skills flag it as an error. Follow the
  skills.
- Do not install Impeccable and ui-ux-pro-max together: they are two "sources of
  truth" for the design system.

No skill covers the PWA install and update prompts: they have to be done by hand
(point 4.3).

---

## 4. UX review of the PWA on iPhone 15 Pro

Screen 393×852 pt, Dynamic Island, iOS 26, standalone mode. The code was checked
against each point in the guides (Apple HIG, WCAG 2.2, Vercel, Emil Kowalski).

### 4.1 Already in place [CODE]

- `viewportFit: "cover"`, top and bottom safe area in `globals.css` and in the tab
  bar; full-screen chat with `100dvh` and safe-area padding.
- Light and dark theme with `color-scheme`, `theme-color` per scheme, an anti-flash
  init script, preferences saved in the profile.
- Inputs and textareas at 16px (`text-base`) and 44px height (`h-11`): no automatic
  iOS zoom; default buttons 44px.
- `inputMode` numeric/decimal on numeric fields; `prefers-reduced-motion` respected
  in `globals.css`; 82 ARIA attributes; `aria-live` on saves.
- Skeleton (`loading.tsx`) on 5 screens; confirmations (`window.confirm`) on the 7
  destructive actions; empty state with an invitation ("Log your first runs").
- Standalone splash aligned to the manifest `background_color`; watchdog for
  navigations that hang on iOS.

### 4.2 To fix (small, high value)

1. **Zoom blocked** (`app/layout.tsx`, `maximumScale: 1`, `userScalable: false`):
   a WCAG 1.4.4 violation and an explicit rule of both skills. Remove the two lines;
   inputs at 16px already avoid unwanted zoom. Check the double tap on cards on the
   iPhone.
2. **Native touch**: `-webkit-tap-highlight-color: transparent`,
   `touch-action: manipulation` and `user-select: none` are missing on controls
   [CODE: absent from `globals.css`]. Three CSS rules; they remove the grey flash on
   tap and the residual 300 ms delay.
3. **Forms**: only 6 uses of `autoComplete`/`enterKeyHint`/`autoCapitalize` [CODE].
   Add `enterKeyHint="send"` to the chat, `"done"` to forms, `autoCapitalize="none"`
   and `spellCheck={false}` to key/code fields, `autoComplete="one-time-code"` to the
   pairing code.
4. **`window.confirm`** for the 7 destructive actions: on iOS standalone it opens an
   off-theme system alert. Replace it with a confirmation sheet (bottom sheet) or,
   where reversible, with a timed "undo" (e.g. delete a run).
5. **Manifest**: add `id`, `scope`, an icon with `purpose: "maskable"`, `shortcuts`
   (New run, Today's plan) and `screenshots`; the manifest `theme_color` is fixed dark
   while the page is light by day.
6. **Haptic feedback**: `navigator.vibrate` does not exist on iOS [CODE,
   `lib/haptics.ts`]. On iOS 18+ Safari gives haptic feedback on
   `<input type="checkbox" switch>` controls [TO VERIFY on the iPhone]: it can be used
   for the settings switches and as a "trick" for the confirm tap.

### 4.3 To add

7. **Install invitation**: iOS has no `beforeinstallprompt`. When the app runs in the
   browser (not standalone), show once a dismissible hint: "Share → Add to Home
   Screen", with the iOS icon. Today, whoever opens the link in Safari doesn't know
   it's an app.
8. **Update**: the service worker calls `skipWaiting()` silently [CODE]. Add a toast
   "New version ready · Reload" when a waiting worker exists, so users don't stay on
   old builds (the problem seen with the Zepp Mini App).
9. **Guided first use**: after onboarding, the home screen is the empty chat. A
   three-box path ("Import a run", "Connect your watch", "Ask for a plan") with
   done/to-do status makes it clear what to do. It is exactly the field of
   Impeccable's `onboard` command.
10. **Contrast**: check the `text-micro` texts (11px) on the `muted` background in
    the light theme with `impeccable audit`; 11px is below the comfort threshold on
    iPhone for non-decorative labels.
11. **Touch targets**: the `size="sm"` buttons are 36px (`h-9`) [CODE]. Where they are
    the only action (e.g. "Edit" in the profile), bring the clickable area to 44px
    with padding, keeping the compact look.

### 4.4 Work plan

| Step | What | Effort |
| --- | --- | --- |
| 1 | Install the three skills; write the conflict rules in `AGENTS.md` | 1 h |
| 2 | Run `web-design-guidelines` and `impeccable audit` on the app; collect findings | 1 h |
| 3 | Fixes 1–3 and 5 (zoom, native touch, forms, manifest) | 0.5 d |
| 4 | Update toast and install invitation | 0.5 d |
| 5 | Confirmation sheet instead of `window.confirm`; 44px targets | 0.5 d |
| 6 | Guided first use (`impeccable onboard`) and `text-micro` contrast | 1 d |

The whole design block is worth about 3 days; the universality part is 4 to 12
days, depending on how far beyond Italy you want to go.

---

## 5. Sources

- Emil Kowalski, `mobile-native` and README: https://github.com/emilkowalski/skills
- Vercel Web Interface Guidelines: https://github.com/vercel-labs/web-interface-guidelines and skill https://github.com/vercel-labs/agent-skills
- Impeccable: https://github.com/pbakaus/impeccable
- Anthropic `frontend-design`: https://github.com/anthropics/skills
- UI UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- WCAG 2.2: zoom 1.4.4 https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html · contrast 1.4.3 https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html · target 2.5.8 https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html · animations 2.3.3 https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- Apple HIG, accessibility and 44 pt targets: https://developer.apple.com/design/human-interface-guidelines/accessibility
- MDN `env()` and safe area: https://developer.mozilla.org/en-US/docs/Web/CSS/env · `inputmode`: https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inputmode · `theme-color`: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name/theme-color
- web.dev PWA installation and update: https://web.dev/learn/pwa/installation-prompt · https://web.dev/learn/pwa/update
- Local Next 16 documentation: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`
