# Decisions and Status — PM AutoShot

Updated: 2026-11-11

## Confirmed decisions

| Topic | Decision |
|---|---|
| Repository | `rpRIGGS/pm-autoshot` |
| Upstream | `uz-scripts/uz_AutoShot` |
| Project type | Expanded full AutoShot fork, **not** a stripped emote-only recorder |
| Original functionality | Preserve it |
| New capability | Automated PM Emotes animation capture |
| Preview output | Transparent **animated WebP** |
| Capture method | Studio ped, real animation playback, timed screenshots, background removal, animated export |
| Batch processing | Unattended, recoverable, progress and failures tracked |
| PM Emotes integration | Local NUI preview assets, copied into separate PM Emotes resource |
| Third-party preview files | Not a replacement for capturing our own catalog |
| Runtime dependency | PM AutoShot is a development tool; PM Emotes must not require it in production |
| GitHub workflow | Save work in repository commits; keep these documents synchronized |
| Naming | `pm-autoshot`; upstream resource-name assumptions must be fixed |

## Current state

- [x] User created and authorized access to the GitHub fork.
- [x] Root README updated to explain the PowerMoves expansion and preserve original upstream documentation.
- [x] Development reference folder and planning documents established.
- [x] Initial resource audit completed; fixed hardcoded `cfx-nui-uz_AutoShot` shot URLs, manifest identity and npm package name for `pm-autoshot`. FiveM validation pending.
- [ ] Animation playback implemented.
- [ ] Multi-frame capture implemented.
- [ ] Animated WebP export implemented.
- [ ] Batch catalog capture implemented.
- [ ] FiveM in-server tests passed.
- [ ] Complete PM Emotes preview library generated.

**Status:** Initial naming compatibility changes committed. Existing upstream event names remain intentionally unchanged to preserve internal client/server compatibility. Animation capture and animated WebP code are not yet implemented or validated.

## Technical issues to resolve through implementation

1. Server-side animated WebP encoder compatibility with the actual FiveM Node runtime.
2. Upstream hardcoded resource name and paths when installed as `pm-autoshot`.
3. PM Emotes catalog loading and exact playback metadata for special animation categories.
4. File naming and manifest agreement with the PM Emotes NUI loader.
5. Reliable failure recovery and bounded disk/memory use during large batch runs.

These are implementation checks, **not reasons to replace the agreed approach or ask the user to restart planning**.

## Audit findings

- `fxmanifest.lua` declares `screenshot-basic` and `yarn`; client uses screenshot-basic screenshot callbacks and latent server uploads.
- `server/server.js` processes individual screenshots with `pngjs`, chroma key removal, resizing, and writes into `shots/`.
- `client/client.lua` used hardcoded `https://cfx-nui-uz_AutoShot/shots` URLs, now adjusted for `pm-autoshot`.
- Original `uz_autoshot:*` events and `uz_autoshot_*` convars remain paired across client and server; renaming only one side would break existing capture functionality.
- Animated WebP encoding requires a separate implementation and runtime verification.

## Change log

- **2026-11-11:** Fork README updated and original documentation retained.
- **2026-11-11:** Added development-reference planning, scope, implementation checklist, and decision log.
- **2026-11-11:** Audited source and committed initial fork naming and NUI URL compatibility updates.


## Animation capture implementation checkpoint (2026-11-11)

- Added `client/animation_capture.lua` with `/shotanim <dict> <clip>`, `/shotanimstop`, and `/shotanimframes <dict> <clip> [2-24 frames] [100-1000 ms interval]`.
- Frame capture now opens the original AutoShot studio via `pm-autoshot:client:openAnimationStudio`, reusing its camera, routing bucket, chroma environment, and appearance restoration. This is code integration, not a FiveM-tested claim.
- Server validates and stores intermediate alpha PNGs under `shots/animations/<name>/` and attempts to encode `shots/animations/<name>.webp` using `sharp`.
- **Blocker to verify before claiming functional WebP:** native `sharp` availability in FXServer/yarn and actual multi-page encoding. No runtime validation has been performed. If native module fails, replace with a tested FXServer-compatible encoder rather than treating PNG frames as the final deliverable.
- **Remaining:** actual PM Emotes catalog ingestion, batch scheduling/recovery, emote-type-specific scenarios/props, preview UI handoff, end-to-end test.
- Existing clothing, vehicle, object, and other AutoShot capture commands must remain operational.


## Encoder validation checkpoint

- Locally exercised the animated RIFF WebP assembly with Node.js 22 and Sharp using three synthetic 24×24 RGBA frames. Sharp successfully decoded the result as 3 frames, page height 24, 160 ms per frame, alpha enabled, infinite loop. This was a local algorithm check, **not** an FXServer integration test.
- Added `npm run test:webp` for repeatable regression validation. The committed regression test still needs to be run from a checked-out repository with dependencies installed.
- Published WebP files are now written to a temporary path and renamed on success to reduce the chance of incomplete output being consumed by the UI.
- **Important timing caveat:** the current capture loop waits for each screenshot upload acknowledgement before starting the next screenshot. If processing takes longer than the requested interval, actual sampled motion can be slower than the declared WebP frame delay. This must be corrected before claiming faithful animation timing.


## Buffered frame capture update

- Screenshot sampling and latent server upload are now separate phases; screenshot timestamps are measured and average sample spacing is passed as WebP delay. This avoids server upload latency distorting animation playback.
- Individual screenshots are capped at 8 MiB before buffering; at the maximum 24-frame batch this still allows substantial temporary client memory, so memory usage and large-catalog throughput need testing.
- The current encoder accepts one uniform average frame delay, not individual variable delays. Screenshot-basic capture latency can still produce uneven sampling, especially on slow clients.
- **Not production-ready:** requires actual FiveM screenshot/basic test, sharp native-module compatibility check, complete emote-type coverage, and PM Emotes NUI asset integration.


## Session consistency hardening

- Server rejects out-of-order frame uploads and refuses to overwrite a session while its WebP encoder is running.
- Encoding locks are released on errors, allowing recovery rather than leaving a permanently blocked capture name.
- WebP frame delay now accepts measured sampling intervals down to 1 ms and up to 10 seconds; previous 100–1000 ms clamp could silently misrepresent screenshot capture timing.
- Remaining validation: execute regression tests in checked-out repo, verify native Sharp installation on the actual FXServer runtime, and exercise capture/restoration in FiveM.


## Catalog and batch hardening

- Catalog now reads both `client/AnimationList.lua` and `client/AnimationListCustom.lua`, recognizing both `RP` and `CustomDP` declarations. The custom file in the current PM Emotes repository is empty, but support is present for later entries.
- The standalone capture command currently supports dictionary/clip animations only. Entries with prop or particle metadata are excluded rather than captured inaccurately; scenario, shared, animal, and other special emote types still need native playback integration.
- Batch output filenames include the category and key, avoiding collisions between dances, emotes, and exits. Batch execution now checks export success and stops when a preview fails.
- **Outstanding for completion:** validate Lua/JS runtime in FiveM; integrate full PM Emotes playback including props, scenarios and specialized categories; connect generated WebP files to the PM Emotes NUI; validate the complete workflow and release a server-testable build. Do not describe the current state as finished.


## Catalog parser and batch failure checkpoint

- Base and custom animation-list parsing now share a single parser, with custom entries overriding matching base entries by category/key.
- Parser targets top-level entries using the indentation of the actual PM Emotes animation list; fixture tests now use the same layout. This remains a heuristic parser, not a Lua interpreter, and must be validated against the full live catalog.
- Dictionary-loading and studio-startup failures now publish failure results to the batch controller so it can stop instead of reporting misleading progress.
- The production goal remains **unfinished**: full native emote playback and PM Emotes NUI integration are not yet implemented, and actual FXServer validation is still required.


## PM Emotes NUI integration checkpoint

- The PM Emotes repository now contains `client/NUI/js/autoshot-previews.js`, loaded by its NUI index. It displays generated animated WebP previews for focused/hovered emote buttons, using the deployment manifest; absent entries fall back silently.
- PM Emotes `fxmanifest.lua` declares `client/NUI/previews/*` and `development-reference/PM-AUTOSHOT-PREVIEWS.md` documents deployment.
- PM AutoShot includes `tools/install-previews.js` and an installer regression fixture; deployment is an explicit server-admin action after capture.
- **Still required:** actual FiveM screenshot/encoder validation, full native PM Emotes playback for prop/scenario/specialized entries, and complete end-to-end verification. The NUI connection exists but is not proof of production readiness.
