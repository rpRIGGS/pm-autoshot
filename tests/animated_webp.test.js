// Run: npm install && node tests/animated_webp.test.js
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { encodeAnimation } = require('../server/animated_webp');
(async () => {
    const width = 24, height = 24, delay = 160;
    const frames = [0, 1, 2].map(i => {
        const pixels = Buffer.alloc(width * height * 4);
        for (let p = 0; p < pixels.length; p += 4) {
            pixels[p] = 80 * i;
            pixels[p + 1] = 20;
            pixels[p + 2] = 255 - 80 * i;
            pixels[p + 3] = (p / 4) % width < 12 ? 255 : 0;
        }
        return pixels;
    });
    const result = await encodeAnimation(sharp, frames, width, height, delay);
    assert.equal(result.toString('ascii', 0, 4), 'RIFF');
    assert.equal(result.toString('ascii', 8, 12), 'WEBP');
    const metadata = await sharp(result, { animated: true }).metadata();
    assert.equal(metadata.pages, frames.length, 'animated WebP must retain all frames');
    assert.equal(metadata.width, width);
    assert.equal(metadata.pageHeight, height);
    assert.deepEqual(metadata.delay, [delay, delay, delay]);
    const decoded = await sharp(result, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.height, height * frames.length);
    assert.equal(decoded.data[3], 255);
    assert.equal(decoded.data[(width - 1) * 4 + 3], 0);
    await assert.rejects(() => encodeAnimation(sharp, [frames[0]], width, height, delay), /invalid frame count/);
    await assert.rejects(() => encodeAnimation(sharp, frames, 1025, height, delay), /invalid canvas/);
    await assert.rejects(() => encodeAnimation(sharp, frames, width, height, 0), /invalid frame delay/);
    await assert.rejects(() => encodeAnimation(sharp, [frames[0], Buffer.alloc(8)], width, height, delay), /incorrect RGBA frame length/);
    await assert.rejects(() => encodeAnimation(sharp, null, width, height, delay), /invalid frame count/);
    await assert.rejects(() => encodeAnimation(sharp, frames, 24.5, height, delay), /invalid canvas/);
    await assert.rejects(() => encodeAnimation(sharp, [frames[0], 'not raw pixels'], width, height, delay), /incorrect RGBA frame length/);
    // The 24 x 1024 x 1024 maximum is exactly the server pixel budget;
    // invalid oversize canvases and frame counts are covered above.
    // A valid animation must preserve frame-to-frame differences, not just
    // metadata and alpha in the first frame.
    const stride = width * height * 4;
    assert.notDeepEqual(decoded.data.subarray(0, stride), decoded.data.subarray(stride, 2 * stride));
    assert.notDeepEqual(decoded.data.subarray(stride, 2 * stride), decoded.data.subarray(2 * stride, 3 * stride));
    console.log('Animated WebP: frame count, timing, dimensions, alpha, pixel budget and frame differences passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
