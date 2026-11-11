# Implementation Plan — PM AutoShot

This is an **ordered execution checklist**, not a requirement for the user to approve each step. Keep the scope narrow and deliver functional code with each phase. Mark completed items only after code is committed; mark FiveM validation only after an actual in-server test.

## Phase 1 — Establish the working baseline

- [ ] Inspect the fork's manifest, server processing, studio capture, NUI, settings, and resource-name assumptions.
- [ ] Record exact existing commands and runtime dependencies.
- [ ] Make resource-name handling compatible with the fork name `pm-autoshot` without breaking asset paths or original functions.
- [ ] Preserve upstream license and existing workflows.

**Exit:** Existing AutoShot resource can be installed under the intended name, with upstream modes intact (FiveM verification required).

## Phase 2 — Working animated capture pipeline (critical path)

- [ ] Add an animation test entry and studio playback using the actual dictionary/clip.
- [ ] Capture multiple frames at defined offsets from a single animation playback.
- [ ] Reuse upstream chroma-key/background removal for each frame.
- [ ] Add a server-compatible transparent animated WebP encoder.
- [ ] Save a correctly named animated preview.
- [ ] Confirm transparency, visible motion, timing, and local NUI loading.
- [ ] Test a basic animation, a looping dance, and a prop animation.

**Exit:** Actual animated WebP files from FiveM are displayed in PM Emotes NUI tiles. Do not describe the pipeline as working until this passes.

## Phase 3 — Catalog support and capture profiles

- [ ] Inventory PM Emotes' current animation definitions and supplemental catalogs.
- [ ] Import stable IDs and actual playback data.
- [ ] Implement capture profiles for ordinary loops, one-shots, prop attachments, and compatible scenarios.
- [ ] Classify special cases (synced, walkstyles, expressions, multi-ped actions) and report unsupported entries.
- [ ] Handle asset loading, animation start/end, prop cleanup, and ped reset between entries.

**Exit:** Catalog loads without dropped IDs, and each entry has a capture path or explicit unsupported status.

## Phase 4 — Reliable unattended batches

- [ ] Queue entries and capture sequentially.
- [ ] Start, pause, resume, stop; expose clear status.
- [ ] Persist completed IDs and failures; skip existing valid previews.
- [ ] Retry recoverable errors with limits and continue past failed entries.
- [ ] Add progress counts, estimated remaining entries (not unsupported time promises), and failure reports.
- [ ] Add bounded upload/processing queue and cleanup temporary frames.

**Exit:** Batch survives errors and interruption without losing previously generated previews.

## Phase 5 — Output validation and handoff

- [ ] Validate sample exports against their actual PM Emotes animations.
- [ ] Check file size, playback, transparency, framing, and correct ID mapping.
- [ ] Reconcile final output layout and manifest with PM Emotes NUI loader.
- [ ] Verify original AutoShot modes still work.
- [ ] Document installation, operation, re-capture, and export steps.
- [ ] Run the catalog in batches; record exact coverage and unresolved entries.

**Exit:** Repeatable capture workflow and a measured preview coverage report.

## Immediate next five implementation tasks

1. Audit the current fork and identify all hardcoded `uz_AutoShot` paths/resource-name checks.
2. Implement safe fork naming and verify existing manifest/UI references.
3. Add one studio animation playback test with deterministic camera framing.
4. Add multi-frame capture and chroma-key processing for that test.
5. Implement animated WebP assembly and verify the first actual preview.

## Testing responsibilities

**Assistant:** code, commits, documentation, validation possible from source, targeted fixes.

**User:** install/update resource in the FiveM development server and run brief in-game acceptance tests when a functional build is ready. No manual capture of thousands of emotes is expected.
