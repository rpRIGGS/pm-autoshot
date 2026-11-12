#!/usr/bin/env node
// Deploy completed animation WebP files to the PM Emotes NUI assets directory.
// Run after server capture is complete and both resources are stopped.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function validateAnimatedWebP(file, stat) {
  const bytes = fs.readFileSync(file);
  if (bytes.length !== stat.size || bytes.length < 64 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP' ||
      bytes.readUInt32LE(4) + 8 !== bytes.length)
    return false;
  let offset = 12, hasAnimation = false, frameCount = 0, hasCanvas = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length & 1);
    if (end > bytes.length) return false;
    if (type === 'VP8X') {
      if (length < 10) return false;
      hasCanvas = (bytes[offset + 8] & 0x02) !== 0;
    }
    if (type === 'ANIM') hasAnimation = length >= 6;
    if (type === 'ANMF') {
      if (length < 16) return false;
      frameCount++;
    }
    offset = end;
  }
  return offset === bytes.length && hasCanvas && hasAnimation && frameCount >= 2;
}

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
      const collisionKey = encoded.toLowerCase();
      const keys = knownKeys.get(collisionKey) || [];
      const original = entry.category + ':' + entry.key;
      if (!keys.includes(original)) keys.push(original);
      knownKeys.set(collisionKey, keys);
    }
  }
  const files = fs.readdirSync(from).filter(name => /^(Emotes|Dances|Exits|PropEmotes)_[A-Za-z0-9_-]+\.webp$/.test(name)).sort();
  if (files.length === 0)
    throw new Error('No animated WebP captures found; refusing to replace the existing preview manifest');
  // Resolve and validate the entire plan before changing the destination.
  const plan = [];
  const plannedNames = new Set();
  for (const filename of files) {
    const lowerName = filename.toLowerCase();
    if (plannedNames.has(lowerName))
      throw new Error('Ambiguous preview filename (case-insensitive): ' + filename);
    plannedNames.add(lowerName);
    const file = path.join(from, filename);
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error('Preview capture is not a regular file: ' + filename);
    if (stat.size < 20 || stat.size > 32 * 1024 * 1024)
      throw new Error('Invalid preview capture size: ' + filename);
    // Only deploy structurally valid animated WebP captures with 2+ frames.
    if (!validateAnimatedWebP(file, stat))
      throw new Error('Invalid WebP capture: ' + filename);
    const match = /^(Emotes|Dances|Exits|PropEmotes)_(.+)\.webp$/.exec(filename);
    const keys = knownKeys.get(filename.toLowerCase());
    if (!keys || keys.length === 0)
      throw new Error('Preview does not match installed PM Emotes catalog: ' + filename);
    if (keys.length > 1) throw new Error('Ambiguous preview filename: ' + filename + ' (' + keys.join(', ') + ')');
    const key = keys[0];
    manifest[key] = 'previews/' + filename;
    plan.push({ file, filename });
  }
  if (plan.length === 0)
    throw new Error('No valid animated WebP captures found; refusing to replace the preview manifest');
  // Deployments may be intentionally batched. Preserve previously installed
  // previews unless their assets are missing or the catalog no longer lists
  // their emote key. Do not discard earlier successful capture batches.
  const existingManifestPath = path.join(to, 'manifest.json');
  if (fs.existsSync(existingManifestPath)) {
    const previous = JSON.parse(fs.readFileSync(existingManifestPath, 'utf8'));
    if (!previous || previous.version !== 1 || !previous.entries ||
        typeof previous.entries !== 'object' || Array.isArray(previous.entries))
      throw new Error('Existing preview manifest has an unsupported format');
    const catalogIdentities = new Set([].concat(...Array.from(knownKeys.values())));
    for (const [key, asset] of Object.entries(previous.entries)) {
      if (Object.hasOwn(manifest, key) || !catalogIdentities.has(key)) continue;
      if (typeof asset !== 'string' || !/^previews\/[A-Za-z0-9_-]+\.webp$/.test(asset))
        throw new Error('Unsafe existing preview manifest entry: ' + key);
      if (fs.existsSync(path.join(to, path.basename(asset))))
        manifest[key] = asset;
    }
  }
  const fxPath = path.join(destination, 'fxmanifest.lua');
  const fx = fs.readFileSync(fxPath, 'utf8');
  const needsManifestPatch = !fx.includes("'client/NUI/previews/*'");
  const filesBlock = /files\s*\{([\s\S]*?)\}/m;
  if (needsManifestPatch && !filesBlock.test(fx)) throw new Error('PM Emotes manifest has no files block');
  if (!dryRun) {
    fs.mkdirSync(to, { recursive: true });
    const staged = [];
    const backups = [];
    const suffix = '.pm-autoshot-' + process.pid + '-' + Date.now();
    const stage = (destinationFile, bytes) => {
      const temp = destinationFile + suffix + '.tmp';
      fs.writeFileSync(temp, bytes);
      staged.push({ temp, destinationFile });
    };
    try {
      for (const item of plan) stage(path.join(to, item.filename), fs.readFileSync(item.file));
      stage(path.join(to, 'manifest.json'),
        JSON.stringify({ version: 1, entries: manifest }, null, 2) + '\n');
      if (needsManifestPatch) {
        const updated = fx.replace(filesBlock, (block, body) =>
          block.replace(body, body + "\n    'client/NUI/previews/*',"));
        stage(fxPath, updated);
      }
      for (const { temp, destinationFile } of staged) {
        const backup = destinationFile + suffix + '.bak';
        const existed = fs.existsSync(destinationFile);
        if (existed) fs.copyFileSync(destinationFile, backup);
        backups.push({ destinationFile, backup, existed });
        fs.renameSync(temp, destinationFile);
      }
    } catch (error) {
      for (const { destinationFile, backup, existed } of backups.reverse()) {
        try {
          if (existed && fs.existsSync(backup)) fs.copyFileSync(backup, destinationFile);
          else if (!existed && fs.existsSync(destinationFile)) fs.unlinkSync(destinationFile);
        } catch (rollbackError) {
          error.message += '; rollback failed for ' + destinationFile + ': ' + rollbackError.message;
        }
      }
      throw error;
    } finally {
      for (const { temp } of staged) {
        try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) {}
      }
      for (const { backup } of backups) {
        try { if (fs.existsSync(backup)) fs.unlinkSync(backup); } catch (_) {}
      }
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
