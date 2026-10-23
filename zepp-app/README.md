# Zitto e Corri for Zepp OS

This directory contains the Zepp OS companion for Zitto e Corri (version
1.0.7, version code 8). It runs on an Amazfit Balance 2 or Active 3 Premium and
sends health summaries to the main PWA through the Zepp phone app. On watches
that support it, it also adds a **Today** widget with the planned workout and
readiness.

It is a standalone Zeus project and is built separately from the Next.js app.

## What it syncs

When available on the watch, the companion sends:

- training load, VO₂ max, recovery time, and heart-rate zones;
- resting, latest, and maximum heart rate;
- sleep and naps;
- stress, blood oxygen, and PAI;
- steps, calories, standing time, and their targets;
- basic device and user-profile information.

These summaries support readiness and training insights in Zitto e Corri. The
companion does not record workouts, use GPS, or turn Zepp workout history into
activities. FIT and GPX imports remain separate.

## Requirements

- One of these watches with API level 4.2 (Zepp OS 5.0) or later:

  | Watch | `deviceSource` | Screen | Today widget |
  | --- | --- | --- | --- |
  | Amazfit Balance 2 | `9568512` (China), `9568513`, `9568515` | Round 480 × 480 | Yes |
  | Amazfit Active 3 Premium | `10944768`, `10944769`, `10944771`, `10948867` | Round 466 × 466 | No (not supported by the device) |

  The layout is designed at 466 px and scaled by `px()` to the 480 px screen of
  the Balance 2.
- Zepp on the paired phone with Developer Mode enabled
- A Zepp Developer account
- Node.js and npm
- A public HTTPS deployment of the Zitto e Corri PWA

## Install on a watch

From this directory, install the dependencies and sign in to Zepp Developer:

```bash
npm install
NODE_PATH=./node_modules/@zeppos/zeus-cli/private-modules npx zeus login
```

Build and install the preview:

```bash
npm run preview
```

Select **Amazfit Balance 2** or **Amazfit Active 3 Premium**, then scan the QR
code from the Zepp phone app while Developer Mode is active.

## Connect to Zitto e Corri

1. In the PWA, open **Settings → Zepp OS**, enable the integration, and generate
   a six-digit pairing code.
2. In the Zepp phone app, open the watch's app list and select **Zitto e Corri →
   Settings**.
3. Enter the public HTTPS URL of the PWA and the pairing code, then select
   **Connect**.
4. Open Zitto e Corri on the watch and select **Sync now**.

The access token is created and stored automatically; it never needs to be
copied by the user. Pairing codes expire after ten minutes and can be used only
once.

## Synchronization

Synchronization has two separate steps: **capture** (on the watch, automatic)
and **delivery** (watch → phone → PWA, when an app screen is open).

### Automatic capture

After the connection is active, the watch registers two persistent daily alarms
(`store: true`, `REPEAT_DAY`) at 08:00 and 23:00 local time. The hours come from
the `schedule` the server returns at pairing; 08:00 and 23:00 are the defaults.
The alarms survive a reboot and are re-armed only when missing or when the
hours change; any other alarm of the app is removed.

The app also listens to the system event `event:os.health.sleep_status`: the
first sleep-state change between 04:00 and 14:00 (waking up) captures a
`morning` summary, because the night's sleep is final at that point.

Each alarm or event starts the App Service, which reads the health data, adds
the summary to the local queue (up to 14 entries), records the capture time and
exits. It does not use Bluetooth or the network.

### Delivery

Queued summaries are sent when:

- the app page is opened on the watch (if the phone answers and the queue is
  not empty, it is flushed automatically);
- the Today widget is tapped (it opens the app page);
- **Sync now** is selected on the watch or in the Zepp phone settings.

The page shows the time of the last automatic capture ("Raccolta auto") and the
number of queued summaries.

### Why delivery is not done in the background

Zepp OS runs an App Service started by an alarm or a system event as a
"single execution" service: the system stops it after **600 ms** and timers
(`setTimeout` and similar) are not available. A Bluetooth request to the phone
and an HTTPS call to the PWA take seconds and need timers, so they cannot finish
there. Capturing at the right time and delivering later is the reliable split.

If the phone or network is unavailable, the queue is kept and retried later.
Disconnecting the integration revokes its token, removes the alarms and clears
the local queue.

## Today widget

On the Balance 2, add the widget from **Settings → Preferences → Widget** on
the watch, then swipe left from the watch face. It shows:

- today's workout title and its first steps (for example
  `risc 15:00 · 1 km 4:20–4:10 · rec 2:00 · …`);
- the readiness from the last successful sync (`Readiness 72 · pronto`);
- the time of the last successful sync and the queue size
  (`Sync 08:02 · coda 1`).

The widget reads only data already stored on the watch; widgets cannot use
Bluetooth. Tap it to open the app page, which sends the queue and downloads the
plan (`POST /api/zepp/workouts/pull`, with the health access token) for the
widget.

## Development

| Command | Purpose |
| --- | --- |
| `npm run build` | Create the Zepp OS package |
| `npm run preview` | Install a preview build on a physical watch |
| `npm run dev` | Run against Zepp OS Simulator |

`npm run dev` requires Zepp OS Simulator with the Balance 2 or Active 3
Premium device simulator running on its default local port. The physical watch
is the reliable environment for testing alarms, the sleep event, the widget and
Bluetooth interruptions.

Before publishing, the Zepp Developer portal may ask for a widget preview image
(480 × 480 for the Balance 2): Zepp OS requires one for widgets of Mini
Programs above API level 3.0.

## Privacy and troubleshooting

The dedicated access token stays in the Mini Program's private settings
storage. Diagnostic logs never include it, but they can contain health data.

If synchronization fails, open **Zitto e Corri → Settings** in the Zepp phone
app and enable **Show technical details** under synchronization diagnostics.
The panel shows the last endpoint, payload size, HTTP status, and server
response. Share its contents only after reviewing the health information it may
contain.

### "Connect" does nothing

The phone-side service runs inside the Zepp app. Since 1.0.7 the request is
completed in three independent ways: Zepp starts the service for the settings
change (zml's `onSettingsChange` receives `sideService.launchArgs`), the
service picks it up at `onInit`, and the watch app completes it when it asks
for the connection state at every opening. So if the status stays on
"Richiesta inviata…", open **Zitto e Corri on the watch**: the pairing finishes
as long as the code has not expired (10 minutes). A network error is retried at
the next opening; an invalid code needs a new code and a new press of
**Collega a ZittoAndCorri**. The status line "Richiesta inviata…" appears only
from 1.0.6: if it does not, the phone is still running an older build.
