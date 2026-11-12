# PM AutoShot — decisions, inventory and handoff

Updated: 2026-11-11. This document supersedes the earlier chronological, sometimes contradictory implementation checkpoints.

## Non-negotiable decisions

- Repository: `rpRIGGS/pm-autoshot`, expanded fork of `uz-scripts/uz_AutoShot`; retain original clothing, tattoo, accessory, vehicle and object functionality.
- Resource name: `pm-autoshot`; keep existing paired `uz_autoshot:*` event and convar names where legacy integrations use them.
- Framework: PowerMoves RP QBCore; reuse existing `qbcore.admin` / `qbcore.god` ACE and configured command ACE; no new ACE requirement.
- Purpose: administrator-side development capture tool, **not** a runtime dependency of PM Emotes.
- Output: transparent animated WebP files, deployed explicitly into the separate `rpRIGGS/pm-emotes` NUI through a validated installer.
- Work principle: do not delay PM Emotes UI or feature completion while waiting for preview generation. Missing preview assets must be nonfatal.

## Implemented in the repository

| Workstream | Current evidence | Boundary |
|---|---|---|
| Legacy AutoShot functionality | Existing commands retained; permission/bucket regression fixed | Not retested in live FiveM |
| Catalog | Parses PM Emotes base and custom Lua lists; mapped identifiers | Heuristic parser; verify real catalog |
| Playback | Dictionary capture and native PM Emotes playback for supported prop/scenario entries | Shared/animal/specialized entries not fully supported |
| Capture | Studio camera, timed screenshot-basic frames, latent upload | Real screenshot timing/appearance not verified |
| WebP | PNG chroma key, multi-frame encode, atomic publication | Sharp must load on actual FXServer |
| Batch | Catalog batches, stop, abort, status/failure handling | Large unattended runs not benchmarked |
| Recovery | Bucket acknowledgement, timeout and late-response reset, player/camera cleanup | Live restart/teleport recovery not verified |
| Installer | WebP validation, catalog identity checks, manifest merge, dry-run and rollback | Must run against actual installed resource |
| PM Emotes | Optional hover/focus preview overlay and NUI manifest loading | In-game NUI appearance not verified |

## Verification evidence and release status

- Node regression suite: passed in GitHub Actions, including [run 43149552482](https://github.com/rpRIGGS/pm-autoshot/actions/runs/43149552482). Automated tests do **not** simulate the FiveM runtime.
- The manifest declares `screenshot-basic` and `yarn`; Node dependencies are `sharp` and `pngjs`. The built NUI entry point and preview installer exist.
- **Release status: implemented, awaiting first development-server smoke test. NOT end-to-end verified, NOT approved as production-ready.**
- No captured production-quality preview library has been verified or deployed through this conversation.

## Remaining acceptance gates — finite, in order

1. **Deployment check:** verify resource folder, Node dependency installation, startup order, command ACE, resource manifests and output write permissions on the development server.
2. **Encoder check:** run `/shotanimdoctor`; require `sharp`, `pngjs`, `screenshot-basic`, `pm-emotes`, output write and encoder self-test all OK.
3. **Single capture:** `/shotanimcatalog` then `/shotanimbatch 1 1 8 200`; confirm WebP exists, has actual animated frames/transparency, and the player returns safely.
4. **Playback samples:** capture one ordinary dance and representative prop/scenario entries; verify props, framing, timing and cancellation. Test stop and restart restoration in development.
5. **NUI handoff:** dry-run installer, install into PM Emotes while stopped, restart PM Emotes, verify correct hover preview and no broken menu when preview absent.
6. **After smoke test:** only fix defects actually found. Full-catalog generation is a later batch operation, not a blocker to finishing PM Emotes.

## Division of responsibility

**PM AutoShot:** capture, encode, validate, install preview files. **PM Emotes:** finish menu design, navigation, animations, placement and normal gameplay independently. PM Emotes must remain fully functional with zero preview files.

## Operator instructions

See [PREVIEW-DEPLOYMENT.md](PREVIEW-DEPLOYMENT.md). Do not describe offline CI as FiveM-tested; record actual server observations and failures here once available.
