# Watch integration ↔ Zitto e Corri: analysis for Amazfit Balance 2

Date: 22 October 2026. Subject: how to sync the watch data automatically twice a
day, how to bring the training plan to the Balance 2, and how to simplify every
step from watch → phone → app.

Sources: repository code, official Zepp OS documentation (docs.zepp.com sources at
the 15 October 2026 commit), official Zepp samples, the `@zeppos/zml` library
0.0.43, the Intervals.icu forum, Zepp/Amazfit announcements. Every statement is
tagged: **[DOC]** documented, **[CODE]** read in the repo, **[3P]** third-party
source or forum, **[TO VERIFY]** not confirmed. The list of links is at the bottom.

---

## 1. Summary

1. **Scheduled sync has never worked because of a platform limit, not a network
   bug.** An App Service started by an alarm is "single execution": the system
   kills it after **600 ms** and grants it no timers [DOC]. Our service tries a
   BLE → phone → HTTPS round trip, which lasts seconds and uses zml's timers. It
   cannot succeed, on any watch. Moreover, alarms are not persistent (`store` is
   false) and disappear at every reboot [DOC]. The Balance 2 has the same API level
   4.2 as the Active 3: by itself, that changes nothing.
2. **On the Balance 2 there is an official channel that solves much more than the
   health sync: Zepp ↔ Intervals.icu.** Amazfit officially supports it on Balance 2
   [DOC]. Outbound, it sends Intervals.icu the complete activities (FIT with GPS and
   HR) and the wellness data (sleep, resting HR, HRV, steps, SpO2) [3P]; inbound, it
   brings structured workouts from the Intervals calendar onto the watch as native
   sessions in the Workout app [DOC]. Intervals.icu has a free public API with a
   personal key [DOC]. The server can therefore, on its own with a cron job, import
   activities (goodbye manual FIT export) and wellness data, and can publish the
   plan for the next 7 days. It is the recommended route for both phases.
3. **No route guarantees "zero taps" 100% on iPhone**, because all data leaves the
   watch only when the Zepp app on the phone does the BLE sync, and iOS can suspend
   it [3P]. Intervals.icu minimises the problem: it is enough for the Zepp app to
   sync once, and everything else is server-to-server.
4. **The health Mini App is only useful for Zepp's proprietary numbers** (training
   load, recovery time, VO₂max, HR zones) that Intervals does not receive. It should
   be fixed cheaply: persistent repeating alarms, a service that *collects and
   queues* in under 600 ms, and sending at the first useful moment (opening the
   page, or the page woken by the alarm).
5. **Watch face: feasible, but not the best choice.** Mini App storage is isolated
   [DOC]; since July 2026 `ShareLocalStorage` exists to share data between apps
   [DOC], but it is not verified that a watch face can read it. The **Secondary
   Widget** (a swipe left of the dial) is supported on Balance 2 [DOC], is part of
   the Mini App, reads its storage and shows "today's session + readiness" with one
   day of work. Recommended instead of the watch face.
6. **The Workout Extension should be downgraded to a complement.** Physical buttons
   are never supported in extensions [DOC] (the double click will never work), it
   stops when not in the foreground [DOC], and support on Balance 2 is not
   documented [TO VERIFY]. With native workouts via Intervals.icu, the phased
   guidance, alerts and laps are handled by the watch itself.

---

## 2. What exists today (inventory) [CODE]

| Component | Where | What it does | Status |
| --- | --- | --- | --- |
| Health Mini App | `zepp-app/` | Collects load, VO₂max, recovery, HR zones, resting/max HR, sleep, stress, SpO2, PAI, steps; sends to `POST /api/zepp/sync` via app-side; 6-digit pairing; queue of 14 sends | Works only with "Sync now" |
| Scheduled sync | `zepp-app/shared/schedule.js`, `app-service/sync.js` | One-shot alarms at 08:00 and 23:00 → App Service → `collectAndSync` (BLE + HTTP) | **Cannot work** (§3) |
| Workout Extension | `zepp-workout-extension/` | Data page inside Exercise: phase, remaining, target, HR with zones, km projection, vibrations, sounds; plan downloaded from `POST /api/zepp/workouts/pull` | Never tested on real hardware (README) |
| Zepp backend | `app/api/zepp/*`, `lib/zepp/*` | Pairing (code usable once per `health` and `workout` client), revocable tokens, `zepp_sync_events` (audit) + `zepp_daily_metrics` (merge per day), Zepp-assisted readiness, effective HR zones, 14-day plan with heat applied | Solid, well tested |
| Use of Zepp data | profile, AI coach, zones, activity import | Readiness (recovery 45 %, load 15 %, sleep 20 %, resting HR 8 %, stress 7 %, internal load 5 %), watch HR zones for analysis and plans, full context to the coach | OK; freshness 36 h for readiness, 3 days for metrics, 30 days for zones |
| Activity import | `POST /api/import/file`, activity form | FIT/GPX exported by hand from Zepp (iOS share sheet → Shortcut) | **Manual** on every run |
| Notifications and cron | `vercel.json`, `app/api/cron/*` | PWA push: session reminder (16:30 UTC), Monday summary | OK |

Details:

- `zepp_connections.auto_sync` exists, but nothing reads or writes it beyond the
  default; `last_error` is only reset, never set when a sync fails.
- The server answers pairing with a `schedule` (08:00/23:00 or 06:00/18:00) that the
  watch ignores: the times are fixed in the watch code.
- The watch page asks for the phone connection status on every opening; if the phone
  doesn't respond, it shows "Telefono non raggiungibile" (phone not reachable) but
  still lets you sync, which is good.
- The two Zepp projects have separate `appId`, tokens, pairing, app-side and storage:
  two links to set up, two pairs of times, and no data shared between "health" and
  "plan" on the watch.
- `client_id` is prefixed `active3-` and `deviceName` defaults to "Active 3 Premium":
  cosmetic, but misleading on the Balance 2.
- `tmp.json` in the root (217 KB, satellite passes) is unrelated to the project:
  remove it.

---

## 3. Phase 1: automatic sync twice a day

### 3.1 Why it never worked

Current chain: alarm → `app-service/sync` → `collectHealthPayload()` →
`enqueueSync()` → `this.request({method:"SYNC_PAYLOAD"})` (zml, BLE) → app-side on
the phone → `fetch` to the PWA → response → `acknowledgeSync`.

Documented limits that break it:

1. **600 ms.** "The system limits the execution time for a single execution of the
   App Service to 600ms" [DOC, App Service guide]. The alarm starts a "single
   execution" service. zml's BLE handshake has a 5 s timeout and the request a 60 s
   one: the service is terminated long before.
2. **No timers.** The table of APIs available in the App Service marks `setTimeout`
   and the like as NOT available [DOC]. zml uses `@zos/timer` for every `request()`:
   in the service, it can already fail at import time.
3. **Volatile alarms.** `set()` has `store: false` by default: it "can still be
   executed successfully after device reboot" only with `store: true` [DOC]. Alarms
   are one-shot and are re-armed only by the service itself or when the app is
   opened: after a reboot they disappear until the next manual opening.
4. **Phone.** The side service runs inside the Zepp app; Zepp does not document when
   it is started or suspended [DOC: absent]. On iPhones, users report that it must be
   kept open in the background [3P]. At 23:00 and 08:00 is the worst case.

What probably happens today: the service starts, collects and queues the payload
(synchronous, fast operations), then dies on the BLE request. On the next "Sync now",
`flushPending` also ships the queued payloads.
Immediate check, no code: in Supabase
`select trigger, captured_at from zepp_sync_events order by captured_at desc`.

If rows appear with `trigger = 'morning'/'evening'` and `captured_at` at 08:00/23:00,
the alarms do fire and the problem is only delivery.

### 3.2 What changes with the Balance 2

- Official device list: API level **4.2**, Zepp OS 5.0, `deviceSource` `9568512`
  (China), `9568513`, `9568515`, round screen **480×480**, 2 buttons,
  **Secondary Widget: yes** [DOC]. No new API in 4.x/5.0 for background, network or
  new sensors (HRV, readiness) [DOC].
- Since August 2026 the Balance 2 has **Zepp OS 6** (firmware 6.2.208.7) with the
  Training Calendar on the watch and HRV to Apple Health [3P]; there is no developer
  documentation for OS 6 [TO VERIFY whether the API level goes up].
- Since October 2025 the Balance 2 is among the first two devices with the official
  **TrainingPeaks and Intervals.icu** connection [DOC].
- Our apps won't install on the Balance 2 as long as `platforms` in `app.json` lists
  only the four Active 3 `deviceSource` values [CODE]. `designWidth` 466 can stay:
  `px()` scales to 480.

### 3.3 Possible routes

| | Route | Automation | Health data | Activities (FIT) | Risks |
| --- | --- | --- | --- | --- | --- |
| **C** | **Intervals.icu** (official) + server cron | High: activity webhook, wellness polling | Sleep, resting HR, **HRV**, steps, SpO2, stress [3P]; not Zepp load/recovery/VO₂ | **Yes, automatic**, with GPS and HR | Wellness sometimes visible only after a web visit to Intervals [3P]; depends on the Zepp app sync |
| A | Mini App "collect and queue" | Medium: data captured at the right time, delivered at the next opening | All current ones + Zepp proprietary | No | One tap on the watch remains (but "the right time" is no longer needed) |
| B | Alarm that wakes a **page** instead of a service | High if the Zepp app responds | As A | No | Lights the screen at the scheduled times; works only if the Zepp app is alive in background [3P]; verify the page's automatic exit [TO VERIFY] |
| D | Apple Health + iOS Shortcuts | Medium | Steps, HR, sleep, SpO2, HRV (OS 6) | No | The phone must be unlocked when the automation runs [DOC Apple]; depends on the Zepp app |
| E | Unofficial Zepp cloud API from the server | High | Everything, readiness included | Yes | Unsupported, token captured with a proxy, possible ToS violation, can break at any time [3P] |

Continuous service (`@zos/app-service start`): it exists, survives reboots, and has
`@zos/ble` available [DOC], but there too timers are not available, and developers
report zml requests that work in the simulator but not on the device [3P]. I don't
recommend it as a base.

### 3.4 Recommendation for Phase 1

**Route C as the main channel + route A as hygiene for the Mini App.**

1. **Connect Zepp to Intervals.icu** (no code): in the Zepp app, Profile → third-party
   account linking → Intervals.icu; in Intervals.icu, Settings → Amazfit panel:
   enable "download wellness" and HRV. Create the API key in Settings → Developer.
2. **Server: new `lib/intervals/` module** with cron `GET /api/cron/intervals`
   (protected by `CRON_SECRET`, called twice a day) which:
   - reads `GET /athlete/0/activities?oldest=…` and, for each new activity, downloads
     `/activity/{id}/fit-file` (FIT generated by Intervals, always valid) and passes
     it to the existing ingest (`ingestActivity`) with `external_id` for
     deduplication; the AI analysis starts as today;
   - reads `GET /athlete/0/wellness?oldest=…` and writes sleep, resting HR, HRV,
     steps, SpO2 into a `wellness_daily` table (or into `zepp_daily_metrics` with a
     `source` column), without touching the Zepp audit.
   - The API key goes into Supabase Vault, like the Gemini key.
3. **Readiness v2**: today the Zepp weights (recovery 45 %, load 15 %) dominate. With
   Intervals.icu they are missing, but HRV arrives, which is the standard readiness
   signal: rMSSD against the median of the last 7–14 days, plus sleep, resting HR and
   internal load (ATL/CTL, which the server already calculates). When the proprietary
   Zepp numbers arrive from the Mini App, they are added as today.
4. **Mini App, minimal fixes** (`zepp-app/`):
   - `set({ url: "app-service/sync", time, repeat_type: REPEAT_DAY, store: true })`,
     armed once and verified with `getAllAlarms`;
   - the service only does `enqueueSync(collectHealthPayload(trigger))` and exits: it
     stays under 600 ms and doesn't use BLE;
   - sending from the page and from the widget (which opens the page), with the
     existing queue; evaluate route B (alarm on `page/sync`) as a separate experiment;
   - morning trigger with the system event `event:os.health.sleep_status` (sleep is
     finalised on waking, better than a fixed time) [DOC].
5. **Scheduler**: `vercel.json` has only daily crons. Check the Vercel plan: on the
   Hobby plan, crons run at most once a day; for two runs a day, use a Pro cron or an
   external trigger (GitHub Actions schedule, cron-job.org) that calls the endpoint
   with the bearer `CRON_SECRET`, as the README already foresees.

What stays manual: opening the Zepp app on the iPhone now and then, so the watch can
download data (in most cases it does this by itself in the background). Everything
else becomes automatic, including run imports.

---

## 4. Phase 2: the training plan on the watch

### 4.1 Native option: Intervals.icu → "My plan" → Workout app (recommended)

How it works: the server creates `WORKOUT` events on the Intervals.icu calendar
(`POST /athlete/0/events/bulk?upsert=true`, text in `description`); Intervals uploads
the next 7 days to Zepp, about three times a day and on every change [3P]; on the
watch, the session appears in Workout → My plan (Zepp OS 6: Training Calendar) and
starts as a native structured workout, with phases, targets, alerts, screen off, and
laps recorded in the FIT. The FIT goes back to Intervals.icu and from there to our
server: the repeat analysis (`lib/metrics/intervals.ts`) finds the laps.

Mapping of our phases (`WorkoutStep`) onto Intervals syntax [3P]:

| Our field | Intervals syntax | Note |
| --- | --- | --- |
| `completion_type: time`, `completion_value` s | `- 10m`, `- 90s` | `m` = minutes |
| `completion_type: distance`, metres | `- 1km`, `- 400mtr` | |
| `pace_min_s_km` / `pace_max_s_km` | `4:20-4:10/km Pace` | absolute pace, supported since 17 Nov 2025 |
| `hr_min_bpm` / `hr_max_bpm` | `80-88% HR` or `Z2 HR` | absolute bpm are not documented: convert to % of the effective max HR (`getEffectiveHrConfig`) |
| `kind: warmup/cooldown` | `Warmup` / `Cooldown` sections | |
| repeats | `6x` line before the block | no nested repeats; our phases are flat, so it's fine |
| `completion_type: manual` | long-time phase or "lap button" | to decide |

Constraints and known bugs to test on the Balance 2 before trusting it:

- One target per phase: pace **or** HR [3P].
- On T-Rex 3, a user reports pace targets lost after the Zepp sync (April 2026) [3P];
  verify with a test session "4×1 km at pace".
- Phases arrive labelled "Training" instead of Warmup/Cooldown [3P].
- On Balance 2 XT the planned session is not marked as done [3P].
- A synced plan can't be matched to route navigation [3P].
- Only events created in Intervals.icu (including via API) are pushed [3P].

Heat: the server today slows the day's steps at pull time. With Intervals, the plan
must be republished the evening before with the next day's forecast (the
`adjustStepsForHeat` function already exists).

Effort: 1–2 days of code (a pure, testable mapping + publisher + a "Send to
Intervals" button in settings) plus a field test.

TrainingPeaks: the API is reserved for commercial partners [DOC], not feasible.

### 4.2 Workout Extension: keep it as a complement, not as the base

Documented limits that weigh on the current project [DOC]:

- "Does not support button response": the double click on `KEY_UP/KEY_DOWN` will not
  work on any firmware; touches remain (already planned);
- "the registered timer will pause" outside the foreground: phase progression and
  alerts live only while the page is visible;
- listed devices: T-Rex 3, Cheetah, T-Rex Ultra, Falcon (old list); Active 3 Premium
  works according to a third-party tester [3P]; Balance 2 **[TO VERIFY]**;
- it can use the app-side via BLE (official sample "Running Pace Master with Side
  Service") [DOC].

What to do: add the Balance 2 `deviceSource` values, install once, and try. If it
appears in Exercise, keep it as a "coach" data page (text instructions, km
projection, coloured HR zone) to sit alongside the native session; remove the button
code; avoid double alerts (vibrations only if the native session has no targets). If
it doesn't appear, archive it.

### 4.3 Watch face and dial alternatives

Facts [DOC]:

- each Mini App has an isolated `/data`; third-party tests confirm that a watch face
  does not read the files or SessionStorage of another app [3P];
- since July 2026 the docs add `ShareLocalStorage` (write) in `@zos/storage` and
  `LocalStorage(appId, path)` (read) in `@zos/share-storage`, declared from API level
  3.0; the official example uses the scope `watchface-data`, a sign that it is
  designed for dials too; whether the Balance 2 watch-face runtime imports it is
  **[TO VERIFY]**;
- a watch face has no documented network or app-side: it can only show what the Mini
  App published at the last sync;
- the **Secondary Widget** (left swipe, full screen) and the **Shortcut Card** (right
  swipe) are part of the Mini App, read its LocalStorage, update in `onResume`, and
  respond to a tap by opening the app's page; Balance 2 supports them; they cannot do
  BLE directly.

Recommendation, in order:

1. **Secondary Widget "Today"** in the Mini App: session title, phases in summary,
   target pace, readiness and the time of the last sync; tap → page with "Sync now".
   One day of work, with no compromise on the dial the user prefers.
2. **Shortcut Card** with the same two lines, for those who use the right swipe.
3. **Watch face** only later: a light JS watch face that reads the Mini App's
   `ShareLocalStorage` (today's session + readiness) and, on tap, opens the Mini App
   with `launchApp`. Half-day prototype to verify that `@zos/share-storage` works in
   the watch-face runtime; a full dial (time, date, complications, AOD, editor) is a
   separate graphic project.
4. With Intervals.icu active, Zepp OS 6's native Training Calendar already shows the
   planned session on the watch: it covers part of the need with no code.

Watch notifications: `@zos/notification` is available in the App Service [DOC]; a
single-run service woken by the alarm at 07:00 can show "Today: 6×1000 repeats"
reading the cached plan, with a button that opens the page. Small and useful.

---

## 5. Cross-cutting improvements to processes and interfaces

1. **One Zepp project** (page + app-side + setting + app-service + secondary-widget,
   plus the `data-widget` if the Workout Extension survives): one pairing, one token,
   one storage shared between health data, plan and widget. The official sample shows
   `data-widget` + `app-side` in the same project; the combination with `page` is
   **[TO VERIFY]**. If it is not allowed, have the health Mini App also download the
   plan (same endpoint, `health` client) to feed the widget.
2. **`app.json` for Balance 2**: add `9568513`, `9568515` (`9568512` for the Chinese
   version) or a generic entry `{"st":"r"}`; update the default `deviceName`, the
   `client_id` prefix, the README and the names in the Zepp Developer portal.
   `apiVersion` stays 4.2.
3. **Alarms and triggers**: `store: true`, `REPEAT_DAY`, deduplication with
   `getAllAlarms`, the `sleep_status` event for the morning collection, and respect
   for the `schedule` the server already returns at pairing.
4. **Observability**: save `last_error` when a sync fails, count sends by `trigger`
   and show them in Settings → Zepp ("last automatic send: yesterday 08:02"); on the
   watch, show "next alarm" and queue size. Today there is no way to tell from the
   PWA whether the automation is running.
5. **Pairing**: show the public URL and the code together in the PWA, copyable with
   one tap; codes are valid for 10 minutes and must be typed into the Zepp app on
   iPhone, where a QR code cannot be pasted. With Intervals.icu, Zepp pairing becomes
   optional.
6. **Activity import**: with Intervals.icu, the import becomes automatic and
   deduplicated by `external_id`; keep the iOS Shortcut as a fallback. For users
   without an API key: no change.
7. **Data schema**: separate "Zepp proprietary metrics" (load, recovery, VO₂, PAI,
   zones) from "generic wellness" (sleep, resting HR, HRV, steps, SpO2), with a
   `source` column (`zepp_app`, `intervals`, `manual`), so readiness knows what
   weighs and freshness is computed per source.
8. **Cleanup**: `auto_sync` (use it or remove it), `tmp.json`, the "active3" prefixes,
   and the READMEs of the two Zepp projects to realign.
9. **Tests**: the pure functions (phase → Intervals text mapping, readiness v2,
   activity deduplication) follow the style of the existing `tests/*.test.ts`.

---

## 6. Proposed work plan

| # | Activity | Effort | Who | Depends on |
| --- | --- | --- | --- | --- |
| 0 | Connect Zepp ↔ Intervals.icu, create the API key, check `zepp_sync_events.trigger` in Supabase, enable Developer Mode on the Balance 2 | 30 min, no code | Lorenzo | — |
| 1 | `app.json` Balance 2 + persistent alarms + "collect and queue" service + prefixes/README | ½ day | Opus (mechanical, clear spec) | 0 |
| 2 | Intervals.icu server module: key in Vault, cron, activity import via FIT, wellness import, `source` table | 2–3 days | Fable (data design and dedup) | 0 |
| 3 | Readiness v2 with HRV and per-source weights; indicators in Settings | 1 day | Fable | 2 |
| 4 | Plan → Intervals.icu publisher (phase mapping, 7-day upsert, evening republish with heat) + test of one session on the Balance 2 | 1–2 days + field test | Fable for the mapping, manual test | 0 |
| 5 | Secondary Widget "Today" + Shortcut Card in the Mini App | 1 day | Opus (UI from spec) | 1 |
| 6 | Workout Extension: test on Balance 2, button removal, keep/archive decision | ½ day | Opus | 1 |
| 7 | Watch-face prototype with `ShareLocalStorage` | ½ day verification, then graphic project | optional | 5 |
| 8 | Route B experiment (alarm waking the page) | ½ day | optional | 1 |

Recommended order: 0 → 2 → 4 → 1 → 5 → 3, with 6, 7 and 8 only if there is time.
Activities 1, 5 and 6 suit an Opus agent with this document's spec; 2, 3 and 4
require design choices and should be done with Fable.

First decision: open an Intervals.icu account and connect it to Zepp. Without this
step, phases 2 and 4 don't start; with it, the manual FIT export goes away right away.

---

## 7. Sources

Zepp OS documentation (docs.zepp.com sources, commit 2b7b79e of 15 October 2026):

- App Service, 600 ms limit, available APIs: https://docs.zepp.com/docs/guides/framework/device/app-service/
- Alarm `set` (`store`, `repeat_type`): https://docs.zepp.com/docs/reference/device-app-api/newAPI/alarm/set/
- App Service `start` (`reload`, error codes): https://docs.zepp.com/docs/reference/device-app-api/newAPI/app-service/start/
- System events (`event:os.health.sleep_status`): https://docs.zepp.com/docs/guides/framework/device/system-event/
- Device list (Balance 2: 4.2, 480×480, 9568512/13/15, Secondary Widget yes): https://docs.zepp.com/docs/reference/related-resources/device-list/
- Secondary Widget and Shortcut Card: https://docs.zepp.com/docs/guides/framework/device/secondary-widget/
- Isolated storage per app: https://docs.zepp.com/docs/guides/framework/device/fs/
- `ShareLocalStorage` and `@zos/share-storage`: https://docs.zepp.com/docs/reference/device-app-api/newAPI/storage/ShareLocalStorage/ and https://docs.zepp.com/docs/reference/device-app-api/newAPI/share-storage/LocalStorage/
- Workout Extension (devices, limits): https://docs.zepp.com/docs/guides/workout-extension/intro/ and https://docs.zepp.com/docs/guides/workout-extension/quick-start/
- Workout sensor (read only): https://docs.zepp.com/docs/reference/device-app-api/newAPI/sensor/Workout/
- Watch notifications: https://docs.zepp.com/docs/reference/device-app-api/newAPI/notification/notify/
- Architecture (all network traffic goes through the side service): https://docs.zepp.com/docs/guides/architecture/arc/
- Official samples: https://github.com/zepp-health/zeppos-samples (3.0-feature, workout-extensions/3.5)
- zml 0.0.43 (timers and timeouts in `request`): https://github.com/zepp-health/zml
- Reports on zml in App Services: https://github.com/orgs/zepp-health/discussions/351 and https://github.com/orgs/zepp-health/discussions/125

Zepp / Amazfit:

- TrainingPeaks and Intervals.icu on T-Rex 3 Pro and Balance 2: https://os.zepp.com/news/train-smarter-with-trainingpeaks-and-intervalsicu
- Zepp OS 6 on Balance 2 (Training Calendar, HRV → Apple Health): https://us.amazfit.com/blogs/product-update/amazfit-balance-2-series-august-2026-update-a-smarter-training-experience-with-zepp-os-6 and https://os.zepp.com/zepp-os-6-overview
- Training Template on Balance 2: https://support.amazfit.com/en/amazfit_balance_2/docs/VmQgdsYH8oW0GRxsnMwcT6NNned
- Sync only with the Zepp app open / Bluetooth on: https://support.amazfit.com/en/faq/1161

Intervals.icu:

- Amazfit/Zepp support announcement and thread with reports: https://forum.intervals.icu/t/amazfit-zepp-support-available/107652
- Zepp wellness visible after a web visit: https://forum.intervals.icu/t/wellness-data-sleep-only-syncs-from-zepp-after-manual-web-login/122754
- Session not marked as done (Balance 2 XT): https://forum.intervals.icu/t/zepp-planned-workout-not-marked-as-done/126413
- Public API (personal key, events/activities/wellness endpoints): https://intervals.icu/api/v1/docs and https://forum.intervals.icu/t/api-access-to-intervals-icu/609
- Integration cookbook (webhooks OAuth only): https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090
- Workout syntax: https://forum.intervals.icu/t/workout-builder-syntax-quick-guide/123701

Other:

- TrainingPeaks API for partners only: https://www.trainingpeaks.com/blog/an-update-on-trainingpeaks-partner-api/
- Terra (TrainingPeaks ↔ Zepp plumbing, 7-day window): https://tryterra.co/community/zepp-and-structured-workouts
- Apple HealthKit and a locked phone: https://developer.apple.com/documentation/healthkit/hkerror
- Unofficial Zepp cloud API (2025 research): https://github.com/weddle/zepp-cloud-sdk
