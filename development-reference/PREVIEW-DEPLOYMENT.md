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
the installed PM Emotes catalog are available. This is a dependency
check, not proof of successful image capture.

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
