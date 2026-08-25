# Zitto e Corri for Zepp OS

This directory contains the Zepp OS companion for Zitto e Corri. It runs on an
Amazfit Active 3 Premium and sends health summaries to the main PWA through the
Zepp phone app.

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

- Amazfit Active 3 Premium with Zepp OS 4.2 or later
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

Select **Amazfit Active 3 Premium**, then scan the QR code from the Zepp phone
app while Developer Mode is active.

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

The watch schedules synchronization at 08:00 and 23:00 local time after the
connection is active. **Sync now** is available both on the watch and in the
Zepp phone settings.

If the phone or network is unavailable, the watch keeps up to 14 pending
summaries and retries them later. Disconnecting the integration revokes its
token and clears the local queue.

## Development

| Command | Purpose |
| --- | --- |
| `npm run build` | Create the Zepp OS package |
| `npm run preview` | Install a preview build on a physical watch |
| `npm run dev` | Run against Zepp OS Simulator |

`npm run dev` requires Zepp OS Simulator with the Active 3 Premium device
simulator running on its default local port. The physical watch is the reliable
environment for testing background synchronization and Bluetooth interruptions.

## Privacy and troubleshooting

The dedicated access token stays in the Mini Program's private settings
storage. Diagnostic logs never include it, but they can contain health data.

If synchronization fails, open **Zitto e Corri → Settings** in the Zepp phone
app and enable **Show technical details** under synchronization diagnostics.
The panel shows the last endpoint, payload size, HTTP status, and server
response. Share its contents only after reviewing the health information it may
contain.
