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
- [ ] Resource renaming and baseline code audit completed.
- [ ] Animation playback implemented.
- [ ] Multi-frame capture implemented.
- [ ] Animated WebP export implemented.
- [ ] Batch catalog capture implemented.
- [ ] FiveM in-server tests passed.
- [ ] Complete PM Emotes preview library generated.

**Status:** Documentation and scope are established. Capture code has not yet been implemented or validated.

## Technical issues to resolve through implementation

1. Server-side animated WebP encoder compatibility with the actual FiveM Node runtime.
2. Upstream hardcoded resource name and paths when installed as `pm-autoshot`.
3. PM Emotes catalog loading and exact playback metadata for special animation categories.
4. File naming and manifest agreement with the PM Emotes NUI loader.
5. Reliable failure recovery and bounded disk/memory use during large batch runs.

These are implementation checks, **not reasons to replace the agreed approach or ask the user to restart planning**.

## Change log

- **2026-11-11:** Fork README updated and original documentation retained.
- **2026-11-11:** Added development-reference planning, scope, implementation checklist, and decision log.
