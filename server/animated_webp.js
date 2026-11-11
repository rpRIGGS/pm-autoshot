// Animated WebP muxer: encodes each RGBA frame with sharp as lossless WebP,
// then wraps the frame bitstreams in RIFF ANIM/ANMF chunks.
// Avoids sharp's unsupported raw multi-page input.
function uint24(value) {
    const b = Buffer.alloc(3);
    b.writeUIntLE(value, 0, 3);
    return b;
}
function chunk(type, payload) {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32LE(payload.length, 4);
    return Buffer.concat([header, payload, payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}
function extractFrameChunks(webp) {
    if (webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP')
        throw new Error('invalid WebP frame');
    const parts = [];
    for (let pos = 12; pos + 8 <= webp.length;) {
        const type = webp.toString('ascii', pos, pos + 4);
        const len = webp.readUInt32LE(pos + 4);
        const end = pos + 8 + len + (len % 2);
        if (end > webp.length) throw new Error('truncated WebP frame');
        if (type === 'ALPH' || type === 'VP8 ' || type === 'VP8L') parts.push(webp.subarray(pos, end));
        pos = end;
    }
    if (!parts.some(part => ['VP8 ', 'VP8L'].includes(part.toString('ascii', 0, 4))))
        throw new Error('missing WebP image chunk');
    return Buffer.concat(parts);
}
async function encodeAnimation(sharp, rgbaFrames, width, height, delayMs) {
    if (rgbaFrames.length < 2 || rgbaFrames.length > 24) throw new Error('invalid frame count');
    if (width < 1 || height < 1 || width > 1024 || height > 1024) throw new Error('invalid canvas');
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x12; // animation + alpha
    uint24(width - 1).copy(vp8x, 4);
    uint24(height - 1).copy(vp8x, 7);
    const anim = Buffer.alloc(6); // transparent background, infinite loop
    const parts = [chunk('VP8X', vp8x), chunk('ANIM', anim)];
    for (const rgba of rgbaFrames) {
        if (rgba.length !== width * height * 4) throw new Error('incorrect RGBA frame length');
        const still = await sharp(rgba, { raw: { width, height, channels: 4 } })
            .webp({ lossless: true, effort: 4 }).toBuffer();
        const header = Buffer.alloc(16);
        uint24(width - 1).copy(header, 6);
        uint24(height - 1).copy(header, 9);
        uint24(delayMs).copy(header, 12);
        header[15] = 0x02; // no blend; replace full canvas on each frame
        parts.push(chunk('ANMF', Buffer.concat([header, extractFrameChunks(still)])));
    }
    const payload = Buffer.concat(parts);
    const riff = Buffer.alloc(12);
    riff.write('RIFF', 0, 4, 'ascii');
    riff.writeUInt32LE(payload.length + 4, 4);
    riff.write('WEBP', 8, 4, 'ascii');
    return Buffer.concat([riff, payload]);
}
module.exports = { encodeAnimation };
