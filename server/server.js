const path = require('path');
const fs   = require('fs');

// pngjs comes from the yarn install on first start. A leftover .yarn.installed
// without node_modules makes yarn skip that install; a bare require would then
// kill this whole file, and every upload would vanish without a trace.
let PNG = null;
try {
    ({ PNG } = require('pngjs'));
} catch (e) {
    console.log('^1[uz_AutoShot]^0 pngjs is not installed, captures are disabled. Delete .yarn.installed in the resource folder and restart the server, or run "npm install" there.');
}

const RESOURCE   = GetCurrentResourceName();
const RES_PATH   = GetResourcePath(RESOURCE);
const OUTPUT_DIR = path.resolve(path.join(RES_PATH, 'shots'));

try {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
} catch (err) {
    console.log('^1[uz_AutoShot]^0 Output dir error: ' + err.message);
}

function stripDataUri(b64) {
    if (typeof b64 !== 'string') return b64;
    if (!b64.startsWith('data:')) return b64;
    const comma = b64.indexOf(',');
    return comma === -1 ? b64 : b64.slice(comma + 1);
}

const ACE_RESTRICTED = GetConvar('uz_autoshot_ace_restricted', 'false') === 'true';
const ACE_COMMAND    = GetConvar('uz_autoshot_command', 'shotmaker');
const ACE_NAME       = 'command.' + ACE_COMMAND;

// Animation exports are intentionally restricted even when the legacy
// clothing thumbnail tool runs without its optional ACE restriction.
// Reuse the existing QBCore admin ACE rather than introducing new grants.
function checkAnimationPermission(src) {
    return src === 0 || IsPlayerAceAllowed(String(src), 'qbcore.admin') ||
        IsPlayerAceAllowed(String(src), 'qbcore.god') ||
        IsPlayerAceAllowed(String(src), ACE_NAME);
}

function checkAce(src) {
    if (!ACE_RESTRICTED) return true;
    return IsPlayerAceAllowed(src.toString(), ACE_NAME);
}

// Operates in place on a decoded PNG (RGBA). Callers decode once and encode
// once: round-tripping a full-res frame through PNG between steps used to cost
// more than the steps themselves, all of it on the server main thread.
function removeChromaKey(png, mode) {
    const d = png.data;
    const w = png.width, h = png.height;
    let removed = 0;
    const isMagenta = mode === 'magenta';

    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        let keyness = 0;

        if (isMagenta) {
            const rOverG = r - g;
            const bOverG = b - g;
            const minOver = rOverG < bOverG ? rOverG : bOverG;
            const primary = r < b ? r : b;
            if (minOver > 0 && primary > 10) {
                // Soft edge: gradual ramp from 0-20 dominance range
                const edgeSoft = minOver < 20 ? minOver / 20 : 1;
                const primarySoft = primary < 40 ? (primary - 10) / 30 : 1;
                keyness = Math.min(1, (rOverG + bOverG) / (r + b + 1)) * edgeSoft * primarySoft;
            }
        } else {
            const gOverR = g - r;
            const gOverB = g - b;
            const minOver = gOverR < gOverB ? gOverR : gOverB;
            if (minOver > 0 && g > 10) {
                const edgeSoft = minOver < 20 ? minOver / 20 : 1;
                const primarySoft = g < 40 ? (g - 10) / 30 : 1;
                keyness = Math.min(1, (gOverR + gOverB) / (g + 1)) * edgeSoft * primarySoft;
            }
        }

        if (keyness > 0) {
            d[i + 3] = (255 * (1 - keyness) + 0.5) | 0;
            // Despill: remove chroma color bleed from RGB
            if (isMagenta) {
                d[i]     = (r - (r - g) * keyness + 0.5) | 0; // pull R toward G
                d[i + 2] = (b - (b - g) * keyness + 0.5) | 0; // pull B toward G
            } else {
                const cap = r > b ? r : b;
                d[i + 1] = (g - (g - cap) * keyness + 0.5) | 0; // pull G toward max(R,B)
            }
            removed++;
        }
    }

    // Two-pass alpha feather: 5x5 box blur on alpha channel for smooth edges
    const RADIUS = 2;
    const KERNEL = (RADIUS * 2 + 1) * (RADIUS * 2 + 1);
    const totalPx = w * h;
    const src = new Uint8Array(totalPx);

    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < totalPx; i++) src[i] = d[(i << 2) + 3];

        for (let y = RADIUS; y < h - RADIUS; y++) {
            for (let x = RADIUS; x < w - RADIUS; x++) {
                const idx = y * w + x;
                const a = src[idx];
                // Skip interior pixels (all neighbors same alpha)
                if ((a === 0 || a === 255) &&
                    src[idx - 1] === a && src[idx + 1] === a &&
                    src[idx - w] === a && src[idx + w] === a) continue;

                let sum = 0;
                for (let ky = -RADIUS; ky <= RADIUS; ky++) {
                    const rowOff = (y + ky) * w + x;
                    for (let kx = -RADIUS; kx <= RADIUS; kx++) {
                        sum += src[rowOff + kx];
                    }
                }
                d[(idx << 2) + 3] = (sum / KERNEL + 0.5) | 0;
            }
        }
    }

    console.log('^2[uz_AutoShot]^0 Chroma key (' + mode + '): ' + removed + '/' + totalPx + ' pixels removed, edges feathered');
}

// Takes a decoded PNG, returns a new one (or the same object if no resize is needed)
function resizePNG(src, targetW, targetH) {
    if (src.width === targetW && src.height === targetH) return src;

    // Center-crop to target aspect ratio first, then resize
    const srcAspect = src.width / src.height;
    const dstAspect = targetW / targetH;

    let cropX = 0, cropY = 0, cropW = src.width, cropH = src.height;
    if (srcAspect > dstAspect) {
        // Source is wider -> crop sides
        cropW = Math.round(src.height * dstAspect);
        cropX = Math.round((src.width - cropW) / 2);
    } else if (srcAspect < dstAspect) {
        // Source is taller -> crop top/bottom
        cropH = Math.round(src.width / dstAspect);
        cropY = Math.round((src.height - cropH) / 2);
    }

    const dst = new PNG({ width: targetW, height: targetH, fill: true });
    const sd = src.data, dd = dst.data;
    const sw = src.width;
    const xRatio = cropW / targetW;
    const yRatio = cropH / targetH;

    // Use area averaging for downscale (sharper), bilinear for upscale
    const isDownscale = cropW > targetW || cropH > targetH;

    if (isDownscale) {
        // Area averaging: each dst pixel = average of all overlapping src pixels
        for (let y = 0; y < targetH; y++) {
            const sy0 = cropY + y * yRatio;
            const sy1 = cropY + (y + 1) * yRatio;
            const iy0 = sy0 | 0;
            const iy1 = Math.min((sy1 | 0) + 1, cropY + cropH);

            for (let x = 0; x < targetW; x++) {
                const sx0 = cropX + x * xRatio;
                const sx1 = cropX + (x + 1) * xRatio;
                const ix0 = sx0 | 0;
                const ix1 = Math.min((sx1 | 0) + 1, cropX + cropW);

                let r = 0, g = 0, b = 0, a = 0, totalW = 0;

                for (let sy = iy0; sy < iy1; sy++) {
                    // Vertical weight: how much of this row overlaps the dst pixel
                    const wy = (sy < sy0 ? 1 - (sy0 - sy) : sy + 1 > sy1 ? sy1 - sy : 1);
                    const rowOff = sy * sw;

                    for (let sx = ix0; sx < ix1; sx++) {
                        // Horizontal weight: how much of this column overlaps
                        const wx = (sx < sx0 ? 1 - (sx0 - sx) : sx + 1 > sx1 ? sx1 - sx : 1);
                        const w = wx * wy;
                        const si = (rowOff + sx) << 2;
                        r += sd[si]     * w;
                        g += sd[si + 1] * w;
                        b += sd[si + 2] * w;
                        a += sd[si + 3] * w;
                        totalW += w;
                    }
                }

                const di = (y * targetW + x) << 2;
                const inv = 1 / totalW;
                dd[di]     = (r * inv + 0.5) | 0;
                dd[di + 1] = (g * inv + 0.5) | 0;
                dd[di + 2] = (b * inv + 0.5) | 0;
                dd[di + 3] = (a * inv + 0.5) | 0;
            }
        }
    } else {
        // Bilinear interpolation for upscale
        const maxCropX = cropX + cropW - 1;
        const maxCropY = cropY + cropH - 1;

        for (let y = 0; y < targetH; y++) {
            const srcY = cropY + y * yRatio;
            const y0 = srcY | 0;
            const y1 = y0 < maxCropY ? y0 + 1 : maxCropY;
            const yf = srcY - y0;
            const yf1 = 1 - yf;
            const rowA = y0 * sw;
            const rowB = y1 * sw;

            for (let x = 0; x < targetW; x++) {
                const srcX = cropX + x * xRatio;
                const x0 = srcX | 0;
                const x1 = x0 < maxCropX ? x0 + 1 : maxCropX;
                const xf = srcX - x0;
                const xf1 = 1 - xf;

                const i00 = (rowA + x0) << 2;
                const i10 = (rowA + x1) << 2;
                const i01 = (rowB + x0) << 2;
                const i11 = (rowB + x1) << 2;
                const di  = (y * targetW + x) << 2;

                const w00 = xf1 * yf1, w10 = xf * yf1, w01 = xf1 * yf, w11 = xf * yf;
                dd[di]     = (sd[i00]     * w00 + sd[i10]     * w10 + sd[i01]     * w01 + sd[i11]     * w11 + 0.5) | 0;
                dd[di + 1] = (sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11 + 0.5) | 0;
                dd[di + 2] = (sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11 + 0.5) | 0;
                dd[di + 3] = (sd[i00 + 3] * w00 + sd[i10 + 3] * w10 + sd[i01 + 3] * w01 + sd[i11 + 3] * w11 + 0.5) | 0;
            }
        }
    }

    // Light sharpen on RGB after downscale (3x3 unsharp: center 5, neighbors -1)
    if (isDownscale) {
        const STRENGTH = 0.3;
        for (let y = 1; y < targetH - 1; y++) {
            for (let x = 1; x < targetW - 1; x++) {
                const ci = (y * targetW + x) << 2;
                // Skip fully transparent pixels
                if (dd[ci + 3] === 0) continue;
                const t = (ci - (targetW << 2));     // top row
                const b = (ci + (targetW << 2));     // bottom row
                for (let c = 0; c < 3; c++) {
                    const sharp = 5 * dd[ci + c] - dd[t + c] - dd[b + c] - dd[ci - 4 + c] - dd[ci + 4 + c];
                    const blended = dd[ci + c] + (sharp - dd[ci + c]) * STRENGTH;
                    dd[ci + c] = blended < 0 ? 0 : blended > 255 ? 255 : (blended + 0.5) | 0;
                }
            }
        }
    }

    console.log('^2[uz_AutoShot]^0 Crop+Resize: ' + src.width + 'x' + src.height + ' -> ' + cropW + 'x' + cropH + ' -> ' + targetW + 'x' + targetH + (isDownscale ? ' (area avg + sharpen)' : ' (bilinear)'));
    return dst;
}



let sharp = null;
try { sharp = require('sharp'); }
catch (e) { console.log('[PM AutoShot] Animated WebP encoder unavailable: ' + e.message); }

const animationSessions = new Map();
const MAX_ANIMATION_SESSIONS = 8;
const ANIMATION_SESSION_TTL = 5 * 60 * 1000;

function animationKey(src, name) { return String(src) + ':' + name; }
function disposeAnimationSession(key) {
    const session = animationSessions.get(key);
    if (!session) return false;
    if (session.encoding) {
        session.cancelled = true;
        return false;
    }
    animationSessions.delete(key);
    // Remove only the staging directory owned by this session. Never touch
    // finished WebP files in shots/animations/.
    if (session.folder) {
        try { fs.rmSync(session.folder, { recursive: true, force: true }); }
        catch (e) { console.log('[PM AutoShot] Staging cleanup failed: ' + e.message); }
    }
    return true;
}
function cleanupAnimationSessions() {
    const now = Date.now();
    for (const [key, session] of animationSessions) {
        if (!session.encoding && now - session.created > ANIMATION_SESSION_TTL) disposeAnimationSession(key);
    }
}
setInterval(cleanupAnimationSessions, 60 * 1000);
on('onResourceStop', (resourceName) => {
    if (resourceName !== RESOURCE) return;
    for (const [playerId, bucket] of originalCaptureBuckets) {
        try {
            if (GetPlayerName(String(playerId)) !== null)
                SetPlayerRoutingBucket(String(playerId), bucket);
        } catch (error) {
            console.log('[PM AutoShot] Could not restore routing bucket for ' + playerId + ': ' + error.message);
        }
    }
    originalCaptureBuckets.clear();
    for (const [key, session] of animationSessions) {
        if (session.encoding) session.cancelled = true;
        else disposeAnimationSession(key);
    }
});

on('playerDropped', () => {
    originalCaptureBuckets.delete(source);
    const prefix = String(source) + ':';
    for (const key of animationSessions.keys()) {
        if (key.startsWith(prefix)) disposeAnimationSession(key);
    }
});
const activePreviewEncodes = new Set();
onNet('pm-autoshot:server:finishAnimation', async (payload) => {
    const src = source;
    const id = payload && payload.id;
    let ok = false, detail = 'invalid request';
    let encodingSession = null;
    let reservedPreviewName = null;
    try {
        if (!checkAnimationPermission(src)) throw new Error('permission denied');
        if (!sharp || !PNG) throw new Error('sharp or pngjs unavailable on FXServer');
        if (!payload || typeof payload !== 'object') throw new Error('invalid request');
        const { name, frames } = payload;
        if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(name)) throw new Error('invalid animation name');
        if (!Number.isInteger(frames) || frames < 2 || frames > 24) throw new Error('invalid frame count');
        const interval = Math.max(1, Math.min(10000, parseInt(payload.interval, 10) || 200));
        const key = animationKey(src, name);
        const session = animationSessions.get(key);
        if (!session || session.frames.size !== frames) throw new Error('incomplete capture session');
        if (session.encoding) throw new Error('animation encoding already in progress');
        const previewName = name.toLowerCase();
        if (activePreviewEncodes.has(previewName))
            throw new Error('another administrator is encoding this preview: ' + name);
        activePreviewEncodes.add(previewName);
        reservedPreviewName = previewName;
        session.encoding = true;
        encodingSession = session;
        const buffers = [];
        let width = 0, height = 0;
        for (let i = 1; i <= frames; i++) {
            const frame = session.frames.get(i);
            if (!frame) throw new Error('missing frame ' + i);
            const rawFrame = fs.readFileSync(frame);
            if (rawFrame.length < 24 || rawFrame.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
                rawFrame.toString('ascii', 12, 16) !== 'IHDR') throw new Error('invalid staged PNG header');
            const frameWidth = rawFrame.readUInt32BE(16);
            const frameHeight = rawFrame.readUInt32BE(20);
            if (!frameWidth || !frameHeight || frameWidth > 1024 || frameHeight > 1024 ||
                frameWidth * frameHeight * frames > 1024 * 1024 * 24)
                throw new Error('animation pixel budget exceeded');
            if (i === 1) { width = frameWidth; height = frameHeight; }
            if (frameWidth !== width || frameHeight !== height) throw new Error('frame dimensions mismatch');
            const png = PNG.sync.read(rawFrame);
            if (png.width !== frameWidth || png.height !== frameHeight) throw new Error('staged PNG dimensions mismatch');
            buffers.push(png.data);
        }
        if (width * height * frames > 1024 * 1024 * 24) throw new Error('animation pixel budget exceeded');
        // Keep a failed/cancelled capture from consuming a large amount of
        // memory while the encoder is still working.
        if (session.cancelled) throw new Error('animation capture cancelled');
        const outputPath = path.join(OUTPUT_DIR, 'animations', name + '.webp');
        const tmpPath = outputPath + '.tmp-' + String(src);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        const encoded = await require('./animated_webp').encodeAnimation(sharp, buffers, width, height, interval);
        // Encoding yields to the event loop. A disconnect, abort or restart
        // can invalidate the session while the encoder is working.
        if (animationSessions.get(key) !== session || !session.encoding || session.cancelled)
            throw new Error('animation capture was cancelled during encoding');
        // An administrator may deliberately recapture an existing emote.
        // The completed temporary file replaces the previous preview only
        // after encoding succeeds; the name reservation prevents parallel
        // encoders from racing to publish the same asset.
        fs.writeFileSync(tmpPath, encoded);
        fs.renameSync(tmpPath, outputPath);
        session.encoding = false;
        disposeAnimationSession(key);
        ok = true;
        detail = 'animations/' + name + '.webp';
        console.log('[PM AutoShot] Animated WebP saved: ' + detail);
    } catch (e) {
        detail = e.message || String(e);
        console.log('[PM AutoShot] WebP encode failed: ' + detail);
        if (payload && typeof payload.name === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(payload.name)) {
            const sessionKey = animationKey(src, payload.name);
            const current = animationSessions.get(sessionKey);
            // Only unwind the exact session owned by this encoder. An abort
            // may have replaced it with a newer capture while we awaited sharp.
            if (encodingSession && current === encodingSession) {
                encodingSession.encoding = false;
                disposeAnimationSession(sessionKey);
            }
            // An interrupted encoder must not leave an orphaned temporary WebP.
            const partial = path.join(OUTPUT_DIR, 'animations', payload.name + '.webp.tmp-' + String(src));
            try { if (fs.existsSync(partial)) fs.unlinkSync(partial); }
            catch (cleanupError) { console.log('[PM AutoShot] Partial WebP cleanup failed: ' + cleanupError.message); }
        }
    }
    if (reservedPreviewName !== null) activePreviewEncodes.delete(reservedPreviewName);
    if (id !== undefined) emitNet('pm-autoshot:client:animationFinished', src, id, ok, detail);
});

onNet('pm-autoshot:server:abortAnimation', (name) => {
    const src = source;
    if (!checkAnimationPermission(src) || typeof name !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(name)) return;
    disposeAnimationSession(animationKey(src, name));
});

const MAX_ANIM_FRAME_BYTES = 12 * 1024 * 1024;
onNet('pm-autoshot:server:animationFrame', (payload) => {
    const src = source;
    const id = payload && payload.id;
    let ok = false, detail = 'invalid frame';
    try {
        if (!checkAnimationPermission(src)) throw new Error('permission denied');
        if (!PNG) throw new Error('pngjs unavailable');
        if (!payload || typeof payload !== 'object') throw new Error('invalid payload');
        const name = payload.name;
        const frame = payload.frame;
        if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(name)) throw new Error('invalid animation name');
        if (!Number.isInteger(frame) || frame < 1 || frame > 24) throw new Error('invalid frame index');
        const encoded = payload.imageData;
        if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_ANIM_FRAME_BYTES * 4 / 3) + 128) throw new Error('frame too large');
        const base64 = stripDataUri(encoded);
        if (typeof base64 !== 'string' || base64.length === 0 ||
            base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
            throw new Error('invalid base64 screenshot');
        const raw = Buffer.from(base64, 'base64');
        if (!raw.length || raw.length > MAX_ANIM_FRAME_BYTES) throw new Error('invalid frame data');
        // Reject oversized PNG dimensions before pngjs allocates decoded RGBA.
        if (raw.length < 24 || raw.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
            raw.toString('ascii', 12, 16) !== 'IHDR') throw new Error('invalid PNG header');
        const sourceWidth = raw.readUInt32BE(16), sourceHeight = raw.readUInt32BE(20);
        if (!sourceWidth || !sourceHeight || sourceWidth > 4096 || sourceHeight > 4096 ||
            sourceWidth * sourceHeight > 4096 * 4096) throw new Error('frame dimensions too large');
        let png = PNG.sync.read(raw);
        if (png.width > 4096 || png.height > 4096 || png.width * png.height > 4096 * 4096) throw new Error('frame dimensions too large');
        if (payload.transparent === true) removeChromaKey(png, payload.chromaKey === 'magenta' ? 'magenta' : 'green');
        const width = Math.max(32, Math.min(1024, parseInt(payload.width, 10) || 256));
        const height = Math.max(32, Math.min(1024, parseInt(payload.height, 10) || 256));
        png = resizePNG(png, width, height);
        cleanupAnimationSessions();
        const key = animationKey(src, name);
        if (frame === 1) {
            const prior = animationSessions.get(key);
            if (prior && prior.encoding) throw new Error('prior animation still encoding');
            disposeAnimationSession(key);
        }
        if (!animationSessions.has(key)) {
            if (frame !== 1) throw new Error('capture session must begin with frame 1');
            if (animationSessions.size >= MAX_ANIMATION_SESSIONS) throw new Error('too many active sessions');
            animationSessions.set(key, { created: Date.now(), frames: new Map(), folder: path.join(OUTPUT_DIR, 'animations', String(src), name) });
        }
        const session = animationSessions.get(key);
        if (session.encoding) throw new Error('session is encoding');
        if (frame !== session.frames.size + 1) throw new Error('out-of-order animation frame');
        const folder = path.join(OUTPUT_DIR, 'animations', String(src), name);
        fs.mkdirSync(folder, { recursive: true });
        const filename = String(frame).padStart(3, '0') + '.png';
        const framePath = path.join(folder, filename);
        fs.writeFileSync(framePath, PNG.sync.write(png, { colorType: 6 }));
        animationSessions.get(key).frames.set(frame, framePath);
        ok = true;
        detail = 'animations/' + String(src) + '/' + name + '/' + filename;
    } catch (e) {
        detail = e.message || String(e);
        console.log('[PM AutoShot] Animation frame rejected: ' + detail);
    }
    if (id !== undefined) emitNet('pm-autoshot:client:frameSaved', src, id, ok, detail);
});


// Lightweight runtime readiness check for the full preview pipeline.
onNet('pm-autoshot:server:diagnoseAnimation', async () => {
    const src = source;
    if (!checkAnimationPermission(src)) return;
    const results = {
        sharp: Boolean(sharp),
        pngjs: Boolean(PNG),
        emotes: GetResourceState('pm-emotes') === 'started',
        screenshot: GetResourceState('screenshot-basic') === 'started',
        outputWritable: false,
        encoderFunctional: false,
        catalogCount: 0,
        catalogError: null,
        encoderError: null
    };
    try {
        fs.mkdirSync(path.join(OUTPUT_DIR, 'animations'), { recursive: true });
        const probe = path.join(OUTPUT_DIR, 'animations', '.write-check-' + String(src));
        fs.writeFileSync(probe, '');
        fs.unlinkSync(probe);
        results.outputWritable = true;
    } catch (e) { results.catalogError = 'output path: ' + e.message; }
    try { results.catalogCount = require('./emote_catalog').readCatalog('pm-emotes').length; }
    catch (e) { results.catalogError = (results.catalogError ? results.catalogError + '; ' : '') + e.message; }
    if (sharp) {
        try {
            const width = 4, height = 4;
            const rgba = Buffer.alloc(width * height * 4);
            rgba[0] = 255; rgba[3] = 255;
            const encoded = await require('./animated_webp').encodeAnimation(sharp, [rgba, rgba], width, height, 100);
            const metadata = await sharp(encoded, { animated: true }).metadata();
            results.encoderFunctional = metadata.pages === 2 && metadata.pageHeight === height &&
                metadata.delay && metadata.delay[0] === 100;
            if (!results.encoderFunctional) results.encoderError = 'encoded WebP did not retain both timed frames';
        } catch (e) { results.encoderError = e.message || String(e); }
    } else results.encoderError = 'sharp is unavailable';
    emitNet('pm-autoshot:client:diagnostics', src, results);
});

// Catalog is always loaded from the live PM Emotes installation, not a frozen list.
onNet('pm-autoshot:server:requestCatalog', () => {
    const src = source;
    if (!checkAnimationPermission(src)) return;
    try {
        const catalog = require('./emote_catalog').readCatalog('pm-emotes');
        emitNet('pm-autoshot:client:catalog', src, catalog);
        console.log('[PM AutoShot] PM Emotes dictionary animations indexed: ' + catalog.length);
    } catch (e) {
        console.log('[PM AutoShot] Catalog unavailable: ' + e.message);
        emitNet('pm-autoshot:client:catalog', src, [], e.message);
    }
});

const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024;

onNet('uz_autoshot:server:processCapture', (payload) => {
    const src = source;
    const uploadId = payload && typeof payload === 'object' ? payload.id : undefined;
    try {
        processCapture(src, payload);
    } finally {
        // Ack every upload, saved or refused, so the client frees its upload slot
        if (uploadId !== undefined) emitNet('uz_autoshot:client:captureProcessed', src, uploadId);
    }
});

function processCapture(src, payload) {
    if (!checkAnimationPermission(src)) {
        console.log('^1[uz_AutoShot]^0 Refused capture: player ' + src + ' lacks ' + ACE_NAME);
        return;
    }
    if (!payload || typeof payload !== 'object') return;

    const xFilename  = typeof payload.filename === 'string' ? payload.filename : '';
    const wantFormat = typeof payload.format === 'string' ? payload.format.toLowerCase() : 'png';
    const wantTransp = payload.transparent === true || payload.transparent === '1' || payload.transparent === 1;
    const chromaKey  = typeof payload.chromaKey === 'string' ? payload.chromaKey.toLowerCase() : 'green';
    const wantWidth  = parseInt(payload.width)  || 0;
    const wantHeight = parseInt(payload.height) || 0;
    const imageData  = payload.imageData;

    if (!xFilename || /[\\/]\.\.(?:[\\/]|$)/.test(xFilename) || path.isAbsolute(xFilename)) {
        console.log('^1[uz_AutoShot]^0 Refused capture: invalid filename: ' + xFilename);
        return;
    }
    if (typeof imageData !== 'string' || imageData.length === 0) {
        console.log('^1[uz_AutoShot]^0 Refused capture: empty image data for ' + xFilename);
        return;
    }
    if (imageData.length > Math.ceil(MAX_PAYLOAD_BYTES * 4 / 3) + 64) {
        console.log('^1[uz_AutoShot]^0 Refused capture: payload too large for ' + xFilename);
        return;
    }

    try {
        let outputData = Buffer.from(stripDataUri(imageData), 'base64');
        if (!outputData || outputData.length === 0) {
            console.log('^1[uz_AutoShot]^0 Refused capture: invalid base64 for ' + xFilename);
            return;
        }

        // The client forces PNG encoding whenever bg removal is on
        const ext = wantTransp ? 'png' : wantFormat;
        const wantResize = wantWidth > 0 && wantHeight > 0;

        // Saving the raw full-screen frame instead would silently fill shots/ with unusable images
        if (!PNG && ext === 'png' && (wantTransp || wantResize)) {
            console.log('^1[uz_AutoShot]^0 Refused capture: pngjs is not installed (' + xFilename + ')');
            return;
        }

        if (ext === 'png' && (wantTransp || wantResize)) {
            let png = null;
            try {
                png = PNG.sync.read(outputData);
            } catch (e) {
                console.log('^3[uz_AutoShot]^0 PNG decode failed, saving original: ' + e.message);
            }

            if (png) {
                let changed = false;

                if (wantTransp) {
                    try {
                        removeChromaKey(png, chromaKey);
                        changed = true;
                    } catch (e) {
                        console.log('^3[uz_AutoShot]^0 Chroma key skipped: ' + e.message);
                    }
                }

                if (wantResize) {
                    const MAX_DIM = 4096;
                    const clampedW = Math.min(Math.max(wantWidth, 16), MAX_DIM);
                    const clampedH = Math.min(Math.max(wantHeight, 16), MAX_DIM);
                    try {
                        const resized = resizePNG(png, clampedW, clampedH);
                        if (resized !== png) {
                            png = resized;
                            changed = true;
                        }
                    } catch (e) {
                        console.log('^3[uz_AutoShot]^0 Resize skipped: ' + e.message);
                    }
                }

                if (changed) outputData = PNG.sync.write(png, { colorType: 6 });
            }
        } else if (wantResize) {
            console.log('^3[uz_AutoShot]^0 Resize requires PNG format; skipping for ' + ext);
        }

        const outputPath = path.resolve(path.join(OUTPUT_DIR, xFilename + '.' + ext));
        if (!outputPath.startsWith(OUTPUT_DIR + path.sep)) {
            console.log('^1[uz_AutoShot]^0 Refused capture: path traversal blocked for ' + xFilename);
            return;
        }

        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, outputData);

        const sizeKB = Math.round(outputData.length / 1024);
        const label = wantTransp ? 'bg removed' : ext;
        console.log('^2[uz_AutoShot]^0 Saved: ' + xFilename + '.' + ext + ' (' + sizeKB + ' KB, ' + label + ')');
    } catch (err) {
        console.log('^1[uz_AutoShot]^0 Process error: ' + (err && err.message ? err.message : err));
    }
}

// Readiness check sent by the client before it enters the studio. No reply at
// all means this file failed to load; a reply with a reason means it loaded
// but can't save captures.
onNet('uz_autoshot:server:ping', () => {
    const src = source;
    let reason = null;
    if (!checkAnimationPermission(src)) reason = 'You lack ' + ACE_NAME + ' on the server.';
    else if (!PNG) reason = 'pngjs missing on server. Delete .yarn.installed and restart the server.';
    emitNet('uz_autoshot:client:pong', src, { ok: reason === null, reason: reason });
});

const originalCaptureBuckets = new Map();
onNet('uz_autoshot:server:setBucket', (bucket) => {
    const src = source;
    if (!checkAnimationPermission(src)) return;
    const studioBucket = Number(GetConvar('uz_autoshot_studio_bucket', '999'));
    // Only the configured studio bucket is permitted; clients must not
    // choose arbitrary routing buckets via this server event.
    if (!Number.isSafeInteger(bucket) || bucket !== studioBucket) {
        console.log('[PM AutoShot] Refused invalid studio bucket from player ' + src);
        return;
    }
    if (!originalCaptureBuckets.has(src))
        originalCaptureBuckets.set(src, GetPlayerRoutingBucket(String(src)));
    SetPlayerRoutingBucket(String(src), studioBucket);
});

onNet('uz_autoshot:server:resetBucket', () => {
    const src = source;
    if (!checkAnimationPermission(src)) return;
    if (!originalCaptureBuckets.has(src)) return;
    SetPlayerRoutingBucket(String(src), originalCaptureBuckets.get(src));
    originalCaptureBuckets.delete(src);
});