#!/usr/bin/env node
// Deploy completed animation WebP files to the PM Emotes NUI assets directory.
// Run after server capture is complete and both resources are stopped.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function install(source, destination, { dryRun = false } = {}) {
  const from = path.resolve(source, 'shots', 'animations');
  const to = path.resolve(destination, 'client', 'NUI', 'previews');
  const manifest = {};
  if (!fs.existsSync(from)) throw new Error('Missing capture directory: ' + from);
  if (!fs.existsSync(path.join(destination, 'fxmanifest.lua'))) throw new Error('Destination is not a FiveM resource');
  if (!fs.existsSync(path.join(destination, 'client', 'NUI', 'index.html'))) throw new Error('Destination is not PM Emotes NUI');
  // Recover original (possibly spaced/punctuated) emote keys from the
  // installed PM Emotes catalog; capture filenames contain sanitized keys.
  const knownKeys = new Map();
  const { parseCatalog } = require('../server/emote_catalog');
  for (const relative of ['client/AnimationList.lua', 'client/AnimationListCustom.lua']) {
    const file = path.join(destination, relative);
    if (!fs.existsSync(file)) continue;
    for (const entry of parseCatalog(fs.readFileSync(file, 'utf8'))) {
      const encoded = (entry.category + '_' + entry.key).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 96) + '.webp';
      const keys = knownKeys.get(encoded) || [];
      const original = entry.category + ':' + entry.key;
      if (!keys.includes(original)) keys.push(original);
      knownKeys.set(encoded, keys);
    }
  }
  const files = fs.readdirSync(from).filter(name => /^(Emotes|Dances|Exits|PropEmotes)_[A-Za-z0-9_-]+\.webp$/.test(name)).sort();
  // Resolve and validate the entire plan before changing the destination.
  const plan = [];
  for (const filename of files) {
    const file = path.join(from, filename);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size < 20 || stat.size > 32 * 1024 * 1024) continue;
    const match = /^(Emotes|Dances|Exits|PropEmotes)_(.+)\.webp$/.exec(filename);
    const keys = knownKeys.get(filename);
    if (keys && keys.length > 1) throw new Error('Ambiguous preview filename: ' + filename + ' (' + keys.join(', ') + ')');
    const key = keys ? keys[0] : match[1] + ':' + match[2];
    manifest[key] = 'previews/' + filename;
    plan.push({ file, filename });
  }
  const fxPath = path.join(destination, 'fxmanifest.lua');
  const fx = fs.readFileSync(fxPath, 'utf8');
  const needsManifestPatch = !fx.includes("'client/NUI/previews/*'");
  const filesBlock = /files\s*\{([\s\S]*?)\}/m;
  if (needsManifestPatch && !filesBlock.test(fx)) throw new Error('PM Emotes manifest has no files block');
  if (!dryRun) {
    fs.mkdirSync(to, { recursive: true });
    for (const item of plan) fs.copyFileSync(item.file, path.join(to, item.filename));
    fs.writeFileSync(path.join(to, 'manifest.json'), JSON.stringify({ version: 1, entries: manifest }, null, 2) + '\n');
    if (needsManifestPatch) {
      const updated = fx.replace(filesBlock, (block, body) =>
        block.replace(body, body + "\n    'client/NUI/previews/*',"));
      fs.writeFileSync(fxPath, updated);
    }
  }
  return { count: Object.keys(manifest).length, destination: to, dryRun, entries: manifest };
}
if (require.main === module) {
  const [, , source, destination, option] = process.argv;
  if (!source || !destination) {
    console.error('Usage: node tools/install-previews.js <pm-autoshot-resource-path> <pm-emotes-resource-path> [--dry-run]');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(install(source, destination, { dryRun: option === '--dry-run' }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
module.exports = { install };
