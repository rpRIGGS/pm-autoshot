# PM AutoShot — Development Reference

This folder is the source of truth for planning and implementation decisions for **PM AutoShot**, the PowerMoves RP fork of [uz_AutoShot](https://github.com/uz-scripts/uz_AutoShot).

## Mission

Preserve the original AutoShot functionality and extend its existing FiveM studio to generate accurate, transparent animated previews from the **actual PM Emotes catalog**. The generated assets are copied into PM Emotes' NUI; PM AutoShot is a development-only tool, not a dependency of the player-facing menu.

## Documents

- [PROJECT-SCOPE.md](PROJECT-SCOPE.md) — approved boundaries, workflow, deliverables, and acceptance criteria
- [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) — ordered engineering tasks, checkpoints, and test protocol
- [DECISIONS-AND-STATUS.md](DECISIONS-AND-STATUS.md) — fixed decisions, current state, and outstanding technical questions

## Working rules

1. **No replacement menu and no third-party preview substitutions.** Capture our own animation assets.
2. **Do not gut upstream AutoShot.** Existing clothing, prop, tattoo, vehicle, object, wardrobe, and camera functionality must remain available.
3. **Do not modify PM Emotes from this repository.** Coordinate only the preview asset contract.
4. **Implement substantial functional increments**, not just plans or isolated snippets. Update status and documentation alongside commits.
5. **Do not claim in-server verification** until tested in the FiveM development server.
6. Preserve upstream license, notices, and attribution.

## First deliverable

A real FiveM animation played in the AutoShot studio and exported as a transparent, animated preview that loads correctly in a PM Emotes NUI tile. After that, automate catalog-wide capture and recovery.
