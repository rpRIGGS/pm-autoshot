const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install } = require('../tools/install-previews');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-autoshot-test-'));
try {
  const source = path.join(root, 'pm-autoshot');
  const target = path.join(root, 'pm-emotes');
  const shots = path.join(source, 'shots', 'animations');
  fs.mkdirSync(shots, { recursive: true });
  fs.mkdirSync(path.join(target, 'client', 'NUI'), { recursive: true });
  fs.writeFileSync(path.join(target, 'fxmanifest.lua'), "game 'gta5'\nfiles {\n    'client/NUI/index.html',\n}\n");
  fs.writeFileSync(path.join(target, 'client', 'NUI', 'index.html'), '<html></html>');
  for (const name of ['Emotes_wave.webp', 'Dances_wave.webp', 'not-an-emote.webp']) {
    fs.writeFileSync(path.join(shots, name), Buffer.alloc(40, 1));
  }
  fs.writeFileSync(path.join(target, 'client', 'AnimationList.lua'), `
RP.Emotes = {
    ["wave"] = { "dict@wave", "clip", "Wave" },
    ["wave hello"] = { "dict@hello", "clip", "Wave hello" },
}
RP.PropEmotes = {
    ["coffee"] = { "dict@coffee", "clip", "Coffee", AnimationOptions = { Prop = "prop_coffee" } },
}
`);
  fs.writeFileSync(path.join(shots, 'Emotes_wave_hello.webp'), Buffer.alloc(40, 1));
  fs.writeFileSync(path.join(shots, 'PropEmotes_coffee.webp'), Buffer.alloc(40, 1));
  const preview = install(source, target, { dryRun: true });
  assert.equal(preview.count, 4);
  assert.equal(fs.existsSync(path.join(target, 'client', 'NUI', 'previews')), false);
  const result = install(source, target);
  assert.equal(result.count, 4);
  assert.deepEqual(result.entries, {
    'Dances:wave': 'previews/Dances_wave.webp',
    'Emotes:wave': 'previews/Emotes_wave.webp',
    'Emotes:wave hello': 'previews/Emotes_wave_hello.webp',
    'PropEmotes:coffee': 'previews/PropEmotes_coffee.webp'
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(target, 'client', 'NUI', 'previews', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.entries, result.entries);
  const fx = fs.readFileSync(path.join(target, 'fxmanifest.lua'), 'utf8');
  assert.match(fx, /'client\\/NUI\\/previews\\/\\*'/);
  install(source, target);
  assert.equal(fs.readFileSync(path.join(target, 'fxmanifest.lua'), 'utf8'), fx, 'manifest patch must be idempotent');
  assert.equal(fs.existsSync(path.join(target, 'client', 'NUI', 'previews', 'not-an-emote.webp')), false);
  console.log('PM Emotes preview installer fixture passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
