# Deploy animated previews to PM Emotes

PM AutoShot writes animated WebP files under `pm-autoshot/shots/animations/`.
The generated images are **not** automatically visible inside PM Emotes NUI:
FiveM requires the destination resource to declare them in its manifest.

## Deployment

Stop both resources before copying files, then run from the PM AutoShot resource directory:

```bash
node tools/install-previews.js /path/to/pm-autoshot /path/to/pm-emotes --dry-run
node tools/install-previews.js /path/to/pm-autoshot /path/to/pm-emotes
```

The installer copies category-qualified WebP assets to
`pm-emotes/client/NUI/previews/`, writes `manifest.json`, and adds
`client/NUI/previews/*` to the existing `fxmanifest.lua` files declaration.
It is idempotent. Restart PM Emotes after deployment.

The manifest uses keys such as `Emotes:wave` and `Dances:dance1`, and
values such as `previews/Emotes_wave.webp`. In NUI, look up the current
button's `data-emotetype` and `data-emoteid` to resolve a matching preview.
For example:

```js
const manifest = await fetch('previews/manifest.json').then(r => r.json());
const key = button.dataset.emotetype + ':' + button.dataset.emoteid;
const src = manifest.entries[key];
if (src) image.src = src;
```

This is the **asset deployment and mapping contract**, not a claim that the
PM Emotes UI currently displays these images. The PM Emotes NUI implementation
must consume the manifest. No files are written to PM Emotes by the capture
server during live gameplay; deployment is an explicit administrative step.

## Limitations

- Only plain dictionary animations are currently captured.
- Scenario, prop, particle, shared, and specialized emotes need dedicated
  playback support before their previews can be considered faithful.
- Native `sharp` support on the FXServer host and live FiveM studio capture
  remain unverified.
- Test using `npm test` in the resource folder with dependencies installed.
