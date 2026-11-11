# Project Scope — PM AutoShot

## Goal

Expand the existing uz_AutoShot capture studio to support **automatic animation/emote preview generation** for the full PowerMoves RP PM Emotes library. The output must be usable as **local NUI assets**, without loading external images or requiring AutoShot on the production server.

## Preserve upstream capabilities

Retain the existing screenshot studio, orbit camera, lighting, chroma key/background removal, clothing and accessory captures, tattoos and appearance overlays, vehicles, world objects, wardrobe browser, and existing capture commands. Changes must not break those workflows.

## New capture mode

- Load animation entries from the PM Emotes resource or an exported catalog that preserves exact IDs, dictionaries, clips, flags, durations, and prop/attachment information.
- Drive the studio ped through the animation's actual playback behavior, not merely an emote name lookup.
- Capture a timed sequence of frames with consistent camera, ped framing, backdrop, transparency, and playback timing.
- Encode frames as transparent animated WebP; if the chosen encoder cannot work within FiveM's server runtime, investigate a compatible encoder rather than silently changing the deliverable.
- Write files using stable emote IDs, with an index/manifest so the PM Emotes NUI can resolve the right preview.
- Support start, pause, resume, stop, skipped-existing, retries, failures, and resumable batches.
- Provide progress counters and diagnostic logs without interrupting unattended batches.
- Include configurable resolution, frame count, interval, camera presets, output path, and capture model.
- Treat unsupported animation types explicitly; log them for targeted follow-up rather than falsely marking them complete.

## Coverage

The PM Emotes catalog has been previously estimated at roughly **5,774 distinct entries** (including supplemental catalogs); this is a planning figure, **not a newly verified count**. Catalog parsing must establish the authoritative current count. Categories may include ordinary animations, dances, props, synchronized interactions, scenarios, walkstyles, and expressions. These do **not** all share the same playback API; inventory and classify them before declaring full coverage.

## Output contract

Target: `output/emotes/<stable-emote-id>.webp` (example `output/emotes/airguitar.webp`).

- One correctly mapped animated preview per supported emote.
- Transparent background, correct visible pose and props, consistent dimensions.
- Locally loadable in the PM Emotes NUI with no remote thumbnail dependency.
- Manifest records ID, category, output filename, capture result, and failure reason when applicable.
- Actual NUI asset directory and lookup conventions must be reconciled with the PM Emotes implementation before bulk export.

## Not in scope

- Replacing PM Emotes' player-facing menu or modifying its existing animations.
- Building a new general-purpose animation authoring tool.
- Manually recording thousands of emotes.
- Reusing NewEra/NoPixel preview libraries as a substitute for capture.
- Removing or downgrading existing AutoShot functionality.

## Acceptance

1. A basic animation, looping dance, and prop-based emote produce transparent animated previews in FiveM.
2. Those files display and animate correctly **inside actual PM Emotes NUI tiles**.
3. A multi-entry batch advances automatically, logs failures, resumes after interruption, and skips completed assets.
4. Existing AutoShot modes still operate after the changes.
5. Catalog coverage is reported as successful, unsupported, or failed—never guessed.
6. Full-catalog processing is attempted only after the pipeline and batch controls pass testing.

## Dependencies and limitations

Existing upstream depends on `screenshot-basic` and a FiveM server-side Node/yarn environment. The original transparent pipeline outputs PNG; animated WebP export is **not yet implemented**. The exact encoder/runtime compatibility and performance must be proven through an end-to-end capture test. FiveM client tests require the user's development server.
