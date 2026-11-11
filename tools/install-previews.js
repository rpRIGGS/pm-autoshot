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
  const files = fs.readdirSync(from).filter(name => /^(Emotes|Dances|Exits)_[A-Za-z0-9_-]+\.webp$/.test(name)).sort();
  for (const filename of files) {
    const stat = fs.statSync(path.join(from, filename));
    if (!stat.isFile() || stat.size < 20 || stat.size > 32 * 1024 * 1024) continue;
    const match = /^(Emotes|Dances|Exits)_(.+)\.webp$/.exec(filename);
    manifest[match[1] + ':' + match[2]] = 'previews/' + filename;
    if (!dryRun) {
      fs.mkdirSync(to, { recursive: true });
      fs.copyFileSync(path.join(from, filename), path.join(to, filename));
    }
  }
  if (!dryRun) {
    fs.mkdirSync(to, { recursive: true });
    fs.writeFileSync(path.join(to, 'manifest.json'), JSON.stringify({ version: 1, entries: manifest }, null, 2) + '\n');
  }
  return { count: Object.keys(manifest).length, destination: to, dryRun };
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
