# Deploy animated previews to PM Emotes

PM AutoShot saves animated WebP files under `shots/animations/`. PM Emotes
now contains an optional animated-preview overlay
(`client/NUI/js/autoshot-previews.js`) that reads the deployed manifest.
Without assets, the ordinary emote menu continues to work.

## Deployment

Stop both resources before copying, then run:

```bash
node tools/install-previews.js /path/to/pm-autoshot /path/to/pm-emotes --dry-run
node tools/install-previews.js /path/to/pm-autoshot /path/to/pm-emotes
```

The installer copies `Emotes`, `Dances`, `Exits`, and `PropEmotes`
WebP files into `pm-emotes/client/NUI/previews/`, writes `manifest.json`,
and registers the files in `fxmanifest.lua`. Restart PM Emotes.

The installer reads the destination's animation-list Lua files to restore
original emote names, including names containing spaces. It refuses
ambiguous filenames when two keys sanitize to the same filename.
The NUI resolves each image by `data-emotetype:data-emoteid`.

## In-server readiness check

With `pm-autoshot`, `pm-emotes`, and `screenshot-basic` started,
run `/shotanimdoctor` in the FiveM client. The console reports whether
`sharp`, `pngjs`, both resources, the writable output directory, and
the installed PM Emotes catalog are available. The command now also
encodes and decodes a real two-frame WebP on FXServer and reports
`encoder-test=OK` only when the frames and timing survive. This validates
the server encoder, not screenshot capture or NUI display.

Next, capture one simple emote using
`/shotanimbatch 1 1 8 200` (or select the desired catalog index after
`/shotanimcatalog`). Confirm a WebP appears under
`shots/animations/`, deploy it with the installer above, restart
PM Emotes, and verify the matching menu button displays an animated
preview. Expand batches only after that smoke test succeeds.

## Capture status

- Plain dictionary animations: direct `TaskPlayAnim` capture path.
- Props and scenarios: native PM Emotes playback path, with playback-start
  verification and native cancellation. This path is implemented but not
  yet validated in a live FiveM session.
- Shared, animal, and other special categories: not yet fully supported.
- Native `sharp` loading on FXServer and end-to-end WebP output remain
  unverified; `npm test` and GitHub Actions cover Node-side regressions
  but do not replace server testing.

Deployment is an explicit administrator operation, not a live server write
into the PM Emotes resource.

## Permissions and first live verification

Animation capture, catalog retrieval and diagnostics now require the **existing**
`qbcore.admin` or `qbcore.god` ACE, or the configured legacy
`command.<uz_autoshot_command>` ACE. No new ACE grant is needed for QBCore
admins. The legacy clothing thumbnail tool retains its own configured policy.

On a development server, start `screenshot-basic`, `pm-emotes` and
`pm-autoshot` (with its Node dependencies installed). As an admin:

1. Run `/shotanimdoctor`. Check that sharp, pngjs, screenshot-basic,
   pm-emotes, output write access and **encoder-test** all show OK.
2. Run `/shotanimcatalog` and verify a nonzero catalog count.
3. Run `/shotanimbatch 1 1 8 200` and confirm a finished animated WebP
   appears in `pm-autoshot/shots/animations/`. Use `/shotanimbatchstop`
   to abort if the studio fails to restore the player.
4. Stop both resources, run `node tools/install-previews.js
   <path-to-pm-autoshot> <path-to-pm-emotes> --dry-run`, then run without
   `--dry-run`. Restart the resources and inspect the emote's preview in NUI.

The encoder self-test is not proof of a successful in-game screenshot or NUI
render. Those steps require a running FiveM client and server.
