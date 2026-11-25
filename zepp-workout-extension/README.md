# Zitto e Corri Coach — Workout Extension Zepp OS

This folder contains a second Zepp application, independent of the `zepp-app` Mini App.

- **Health Mini App (`zepp-app`)**: reads the health summaries available on the device and sends them to ZittoAndCorri.
- **Workout Extension (`zepp-workout-extension`)**: opens inside the system **Exercise/Allenamento** app (Exercise) while a run is in progress. Exercise keeps handling GPS, pause, resume, saving and activity files; the extension adds phase guidance, targets and alerts.

The two applications have separate tokens, pairing and `appId`. You can install and link both, or just one.

## Prerequisites

- ZittoAndCorri backend reachable at a public HTTPS URL.
- Supabase migration `0016_zepp_workout_extension.sql` applied.
- Node.js and dependencies installed with `npm ci` in the root and in this folder.
- Zeus CLI included in the project dependencies.
- Zepp Developer account and a device/firmware that exposes Workout Extension.
- API level 4.2 on the device.

The manifest contains the placeholder `appId` `1000000`. In the Zepp Developer portal, create a **new Workout Extension application**, separate from the health Mini App, copy the new ID and replace `app.appId` in `app.json`. Do not reuse `1124767` or the ID of another application.

> Active 3 Premium note: the project includes the four `deviceSource` values already used by the repository. The public Zepp documentation does not yet list every Active 3 variant among the Workout Extension models. Before publishing, check in the portal and on the installed firmware that the Workout Extension entry is actually available.

## Setup and pairing

1. Publish ZittoAndCorri on an HTTPS domain. `localhost` and HTTP URLs are not accepted by the App Side Service.
2. Apply the Supabase migration and deploy the backend that contains `POST /api/zepp/workouts/pull`.
3. In ZittoAndCorri, open **Settings → Connections → Zepp OS** and generate a 6-digit linking code. The code is valid for 5 minutes.
4. In the Zepp app on your phone, open the settings of **Zitto e Corri Coach** (Zitto e Corri Coach).
5. Enter the public origin, for example `https://corri.example.it`, without adding the API path.
6. Enter the code and tap **Collega Zitto e Corri Coach** (Link Zitto e Corri Coach).

The code is consumed by the `workout` client; a `health` connection, if any, remains independent. To switch accounts, use **Disconnetti estensione** (Disconnect extension) and repeat the pairing.

## Build, simulator and physical installation

From the `zepp-workout-extension` folder:

```bash
npm ci
npm run build
```

The `.zab` package is written to `dist/`.

For development in the simulator:

```bash
npm run dev
```

To create and send a preview through Zeus:

```bash
npm run preview
```

In the simulator the extension may appear in the application list to make development easier. On a physical device it is not opened like a normal app: install the preview by following the QR/flow shown by Zeus, then enable it from Exercise.

## Activation inside Exercise

The position of the menu items may vary slightly between firmware versions:

1. Open **Exercise/Allenamento** (Exercise) on the watch.
2. Select **Corsa all'aperto** (Outdoor run) or **Tapis roulant** (Treadmill).
3. Before starting, open the settings for the activity type.
4. Go to **Workout Extension**, **Estensioni allenamento** (Workout extensions) or **Altre pagine dati** (Other data pages).
5. Add/enable **Zitto e Corri Coach**.
6. Start the run and scroll through Exercise's data pages until you reach the Coach page.

The extension supports only the Zepp subtypes `1` (Outdoor run) and `2` (Treadmill). It is set to full screen (`isPinned: 1`).

## Plan sync

The backend returns the planned workouts for the next 14 days and a deterministic revision.

- At **06:00** and **18:00** local time, an App Service runs an incremental check.
- Every time the extension page loads the first plan, another check runs.
- **Aggiorna piano ora** (Update plan now) in the settings forces a download.
- If an override is set and still falls within the 14-day window, it is chosen.
- Without an override, today's workout is chosen automatically only when there is exactly one. With zero or more than one workout today, the selection stays empty/ambiguous.

The downloaded list and the revision are stored both by the phone service and on the watch. If the phone or network is unreachable, the last valid version remains usable. A plan is not replaced once the session has started; an update received during the run will be available in the next session.

To manually choose a session, open the **Zitto e Corri Coach** settings, select **Allenamento da guidare** (Workout to follow) and sync. The automatic option removes the override.

## Run screen

The page shows:

- name of the current phase;
- remaining time or distance, or `Manuale` (Manual);
- target pace and heart rate range;
- Exercise's native pace and HR via the `SPORT_DATA` widget;
- predicted completion of the current kilometre;
- name of the next phase;
- status of the alerts and of the HR sensor, if any.

Every second, the extension reads Exercise's net duration, distance and speed. Pauses therefore do not consume a time phase and do not add distance. When you return to the page, the state is realigned with the native metrics.

### Next kilometre prediction

The speed is averaged over the last 15 seconds and converted into pace. At each kilometre boundary, the exact time is interpolated between the two samples surrounding the boundary. The prediction is:

`time elapsed in the km + remaining distance × rolling average pace`

For example, `Km 4 previsto 5:12` (Km 4 expected 5:12) means the estimated time for the fourth kilometre, not the total workout time. If the extension was opened after the start and has not yet observed a boundary, it shows `—` until the next crossing.

## Alerts, sounds and controls

Vibrations:

- phase change or completion: four pulses;
- pace too fast: two short pulses;
- pace too slow: one long pulse;
- HR above the limit: urgent sequence.

Pace must stay outside the range for 20 consecutive seconds before an alert; HR must stay above the limit for 30 consecutive seconds. Each type of alert has a 60-second cooldown. If the `HeartRate` sensor is not available, `SPORT_DATA` keeps showing the native value but HR alerts are disabled.

Sounds are used only at phase change and completion. They play only if enabled in the Coach settings and if the watch's system sounds are on.

Controls:

- double press of `KEY_DOWN`: next phase;
- double press of `KEY_UP`: previous phase;
- Home, Back and single clicks are passed back to Exercise;
- touch areas **PRECEDENTE** (Previous) and **SUCCESSIVA** (Next): an always-visible fallback.

Zepp documents `CLICK` as a guaranteed interaction, while warning that key responses may not be exposed to Workout Extensions. If the double press does not work on your firmware, use the two touch areas; this is not an error in the plan or the pairing.

## First-plan limitation

When the page loses focus, Zepp pauses the Workout Extension: timers, callbacks and real-time alerts do not keep running on another Exercise page. Native GPS, recording and pause keep working normally. When you return to the Coach page, the engine realigns phase and boundaries using net duration and distance, but it cannot recover a vibration that should have happened while the page was out of focus.

For continuous guidance, keep **Zitto e Corri Coach** as the visible page.

## Diagnostics and common problems

The settings show the client type, revision, cache availability, override, last update and last status.

- **Invalid public URL**: use the full HTTPS origin, with no spaces, `/api/...` or repeated slashes.
- **Code rejected/expired**: generate a new code in the PWA; each code is single-use per app.
- **Empty plan**: check that there is exactly one `planned` workout for today, or choose an override.
- **Override disappeared**: it was deleted, completed, or is outside the next 14 days; the server removes it automatically.
- **Offline with no plan**: at least one successful sync must happen before going out without phone/network.
- **No HR alerts**: check the HR permission, sensor availability, and whether `hr_max_bpm` is set in the phase.
- **No sound**: check both the Coach toggle and the watch's sound/silent setting.
- **Double presses ignored**: use the touch controls; some firmware versions do not forward `onKey` to extensions.
- **Extension does not appear in Exercise**: check the new `appId`, API level, model/firmware compatibility, subtype 1/2 and the preview installation.
- **Build with wrong ID**: replace the placeholder in `app.json`; Zeus can build the placeholder, but it does not allow a correct distribution.

## First run checklist

- [ ] Migration `0016_zepp_workout_extension.sql` applied.
- [ ] Public backend updated and reachable via HTTPS.
- [ ] New Workout Extension `appId` created and entered in `app.json`.
- [ ] `npm ci` and `npm run build` completed without errors.
- [ ] `.zab`/preview installed on the Active 3 Premium.
- [ ] Extension linked with the `workout` client and status **Piano aggiornato** (Plan updated).
- [ ] Test workout with warm-up, repeat, recovery and cool-down present in the plan.
- [ ] Extension enabled for both Corsa all'aperto (Outdoor run) and Tapis roulant (Treadmill).
- [ ] Phase, remaining time, target, pace, HR and next phase visible.
- [ ] Exercise pause verified: the remaining time does not decrease.
- [ ] Automatic advance verified on a time-based phase.
- [ ] Automatic advance verified on a distance-based phase.
- [ ] PRECEDENTE/SUCCESSIVA touch controls verified.
- [ ] Physical double presses verified; any firmware limitation noted.
- [ ] Phase-change vibration, fast/slow pace and high HR verified.
- [ ] Phase-change sound verified with system sounds on, and absence verified in silent mode.
- [ ] `Km N previsto` prediction verified after an observed boundary.
- [ ] Override selected, synced and then removed, returning to automatic.
- [ ] Start without network verified using the local cache.
- [ ] Update during a session verified: the active plan does not change.
- [ ] Page switch and return verified: state realigned and alerts re-enabled in the foreground.

Physical testing of vibrations, sounds, buttons and Workout Extension availability cannot be replaced by the simulator: it must be completed on real firmware before publication.
