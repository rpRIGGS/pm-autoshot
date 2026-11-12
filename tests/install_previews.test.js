const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install } = require('../tools/install-previews');
function fakeWebP() {
  const chunk = (name, payload) => {
    const header = Buffer.alloc(8);
    header.write(name, 0);
    header.writeUInt32LE(payload.length, 4);
    return Buffer.concat([header, payload, payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x12;
  const anim = Buffer.alloc(6);
  const frame = Buffer.alloc(16);
  const parts = [chunk('VP8X', vp8x), chunk('ANIM', anim), chunk('ANMF', frame), chunk('ANMF', frame)];
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0);
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8);
  return Buffer.concat([header, body]);
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-autoshot-test-'));
try {
  const source = path.join(root, 'pm-autoshot');
  const target = path.join(root, 'pm-emotes');
  const shots = path.join(source, 'shots', 'animations');
  fs.mkdirSync(shots, { recursive: true });
  fs.mkdirSync(path.join(target, 'client', 'NUI'), { recursive: true });
  fs.writeFileSync(path.join(target, 'fxmanifest.lua'), "game 'gta5'\nfiles {\n    'client/NUI/index.html',\n}\n");
  fs.mkdirSync(path.join(target, 'client', 'NUI', 'js'), { recursive: true });
  const loader = path.join(target, 'client', 'NUI', 'js', 'autoshot-previews.js');
  fs.writeFileSync(loader, '// PM AutoShot preview loader');
  fs.writeFileSync(path.join(target, 'client', 'NUI', 'index.html'),
    '<html><script type="module" src="js/autoshot-previews.js"></script></html>');
  for (const name of ['Emotes_wave.webp', 'Dances_wave.webp', 'not-an-emote.webp']) {
    fs.writeFileSync(path.join(shots, name), fakeWebP());
  }
  fs.writeFileSync(path.join(target, 'client', 'AnimationList.lua'), `
RP.Dances = {
    ["wave"] = { "dict@dance", "clip", "Dance wave" },
}
RP.Emotes = {
    ["wave"] = { "dict@wave", "clip", "Wave" },
    ["wave hello"] = { "dict@hello", "clip", "Wave hello" },
}
RP.PropEmotes = {
    ["coffee"] = { "dict@coffee", "clip", "Coffee", AnimationOptions = { Prop = "prop_coffee" } },
}
`);
  fs.writeFileSync(path.join(shots, 'Emotes_wave_hello.webp'), fakeWebP());
  fs.writeFileSync(path.join(shots, 'PropEmotes_coffee.webp'), fakeWebP());
  fs.unlinkSync(loader);
  assert.throws(() => install(source, target, { dryRun: true }), /missing the AutoShot preview loader/);
  fs.writeFileSync(loader, '// PM AutoShot preview loader');
  const nuiIndex = path.join(target, 'client', 'NUI', 'index.html');
  const originalIndex = fs.readFileSync(nuiIndex, 'utf8');
  fs.writeFileSync(nuiIndex, '<html></html>');
  assert.throws(() => install(source, target, { dryRun: true }), /missing the AutoShot preview loader/);
  fs.writeFileSync(nuiIndex, originalIndex);
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
  // Installing another capture batch must retain previews from the first.
  for (const filename of fs.readdirSync(shots)) {
    if (filename !== 'PropEmotes_coffee.webp') fs.unlinkSync(path.join(shots, filename));
  }
  const secondBatch = install(source, target);
  assert.equal(secondBatch.count, 4);
  assert.equal(secondBatch.entries['Emotes:wave'], 'previews/Emotes_wave.webp');
  assert.equal(secondBatch.entries['PropEmotes:coffee'], 'previews/PropEmotes_coffee.webp');
  const oldPreview = path.join(target, 'client', 'NUI', 'previews', 'Emotes_wave.webp');
  const oldBytes = fs.readFileSync(oldPreview);
  fs.writeFileSync(oldPreview, Buffer.from('corrupt'));
  assert.throws(() => install(source, target, { dryRun: true }), /Previously installed preview is invalid/);
  fs.writeFileSync(oldPreview, oldBytes);
  // Restore fixtures for subsequent collision and corruption checks.
  for (const filename of ['Emotes_wave.webp', 'Dances_wave.webp', 'Emotes_wave_hello.webp']) {
    fs.writeFileSync(path.join(shots, filename), fakeWebP());
  }
  const fx = fs.readFileSync(path.join(target, 'fxmanifest.lua'), 'utf8');
  assert.ok(fx.includes("'client/NUI/previews/*'"));
  install(source, target);
  assert.equal(fs.readFileSync(path.join(target, 'fxmanifest.lua'), 'utf8'), fx, 'manifest patch must be idempotent');
  assert.equal(fs.existsSync(path.join(target, 'client', 'NUI', 'previews', 'not-an-emote.webp')), false);
  // Two different emote names may sanitize to the same WebP filename.
  // Refuse to assign that asset to an arbitrary button.
  fs.appendFileSync(path.join(target, 'client', 'AnimationList.lua'), `
RP.Exits = {
    ["say hello"] = { "dict@one", "clip", "One" },
    ["say?hello"] = { "dict@two", "clip", "Two" },
}
`);
  fs.writeFileSync(path.join(shots, 'Exits_say_hello.webp'), fakeWebP());
  assert.throws(() => install(source, target, { dryRun: true }), /Ambiguous preview filename/);
  const previousManifest = fs.readFileSync(path.join(target, 'client', 'NUI', 'previews', 'manifest.json'), 'utf8');
  assert.throws(() => install(source, target), /Ambiguous preview filename/);
  assert.equal(fs.readFileSync(path.join(target, 'client', 'NUI', 'previews', 'manifest.json'), 'utf8'), previousManifest);
  assert.equal(fs.existsSync(path.join(target, 'client', 'NUI', 'previews', 'Exits_say_hello.webp')), false);
  fs.unlinkSync(path.join(shots, 'Exits_say_hello.webp'));
  fs.writeFileSync(path.join(shots, 'Emotes_corrupt.webp'), Buffer.alloc(40, 1));
  assert.throws(() => install(source, target, { dryRun: true }), /Invalid WebP capture/);


  fs.unlinkSync(path.join(shots, 'Emotes_corrupt.webp'));
  fs.writeFileSync(path.join(shots, 'Emotes_Wave.webp'), fakeWebP());
  assert.throws(() => install(source, target, { dryRun: true }), /case-insensitive/);
  assert.throws(() => install(source, target), /case-insensitive/);
  fs.unlinkSync(path.join(shots, 'Emotes_Wave.webp'));

  fs.writeFileSync(path.join(shots, 'Emotes_orphan.webp'), fakeWebP());
  assert.throws(() => install(source, target, { dryRun: true }), /does not match installed PM Emotes catalog/);
  fs.unlinkSync(path.join(shots, 'Emotes_orphan.webp'));

  for (const filename of fs.readdirSync(shots)) fs.unlinkSync(path.join(shots, filename));
  const retainedManifest = fs.readFileSync(path.join(target, 'client', 'NUI', 'previews', 'manifest.json'), 'utf8');
  assert.throws(() => install(source, target, { dryRun: true }), /No animated WebP captures/);
  assert.throws(() => install(source, target), /No animated WebP captures/);
  assert.equal(fs.readFileSync(path.join(target, 'client', 'NUI', 'previews', 'manifest.json'), 'utf8'), retainedManifest);

  // A malformed installed manifest must fail before replacing any files.
  fs.writeFileSync(path.join(shots, 'Emotes_wave.webp'), fakeWebP());
  const installedManifest = path.join(target, 'client', 'NUI', 'previews', 'manifest.json');
  const goodManifest = fs.readFileSync(installedManifest, 'utf8');
  fs.writeFileSync(installedManifest, '{invalid-json');
  assert.throws(() => install(source, target), /Unexpected token|Expected property|JSON/);
  assert.equal(fs.readFileSync(installedManifest, 'utf8'), '{invalid-json');
  fs.writeFileSync(installedManifest, goodManifest);
  assert.equal(install(source, target).count, 4);
  const residue = fs.readdirSync(path.join(target, 'client', 'NUI', 'previews'));
  assert.equal(residue.some(name => name.includes('.pm-autoshot-')), false);

  fs.writeFileSync(path.join(shots, 'Emotes_wave.webp'), Buffer.alloc(4));
  assert.throws(() => install(source, target, { dryRun: true }), /Invalid preview capture size/);
  fs.unlinkSync(path.join(shots, 'Emotes_wave.webp'));
  fs.symlinkSync(path.join(target, 'fxmanifest.lua'), path.join(shots, 'Emotes_wave.webp'));
  assert.throws(() => install(source, target, { dryRun: true }), /not a regular file/);
  fs.unlinkSync(path.join(shots, 'Emotes_wave.webp'));

  console.log('PM Emotes preview installer fixture passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
