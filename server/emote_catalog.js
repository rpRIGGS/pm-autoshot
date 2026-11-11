// Read-only catalog adapter for the installed PM Emotes resource.
// Extracts dictionary/clip pairs from actual AnimationList.lua, not a guessed list.
// This intentionally skips scenarios, expressions, prop and synchronized emotes
// until their dedicated capture strategies are implemented.
const fs = require('fs');
const path = require('path');

function parseCatalog(source) {
    const categories = ['Emotes', 'Dances', 'Exits'];
    const result = [];
    for (const category of categories) {
        const baseStart = source.indexOf('RP.' + category + ' = {');
        const customStart = source.indexOf('CustomDP.' + category + ' = {');
        const start = baseStart >= 0 ? baseStart : customStart;
        if (start < 0) continue;
        const nextBase = source.indexOf('\nRP.', start + 1);
        const nextCustom = source.indexOf('\nCustomDP.', start + 1);
        const next = nextBase < 0 ? nextCustom : nextCustom < 0 ? nextBase : Math.min(nextBase, nextCustom);
        const section = source.slice(start, next < 0 ? source.length : next);
        // Match entry headers and inspect only the first two values.
        const header = /\["([^"]+)"\]\s*=\s*\{/g;
        const matches = Array.from(section.matchAll(header));
        for (let i = 0; i < matches.length; i++) {
            const key = matches[i][1];
            const begin = matches[i].index + matches[i][0].length;
            const end = i + 1 < matches.length ? matches[i + 1].index : section.length;
            const body = section.slice(begin, Math.min(end, begin + 3000));
            // A nested options/props table cannot be mistaken for a top-level entry.
            if (key === 'AnimationOptions' || key === 'Prop' || key === 'Ptfx') continue;
            const values = body.match(/^\s*["']([^"'\r\n]+)["']\s*,\s*["']([^"'\r\n]+)["']/);
            if (!values) continue;
            const dict = values[1], clip = values[2];
            if (dict.length > 200 || clip.length > 200) continue;
            result.push({ key, category, dict, clip });
        }
    }
    return result;
}

function readCatalog(resourceName = 'pm-emotes') {
    const root = GetResourcePath(resourceName);
    if (!root) throw new Error('PM Emotes resource is not installed: ' + resourceName);
    const files = ['client/AnimationList.lua', 'client/AnimationListCustom.lua'];
    const seen = new Set();
    const combined = [];
    for (const relative of files) {
        const file = path.join(root, relative);
        if (!fs.existsSync(file)) continue;
        for (const item of parseCatalog(fs.readFileSync(file, 'utf8'))) {
            const id = item.category + ':' + item.key;
            if (seen.has(id)) continue;
            seen.add(id);
            combined.push(item);
        }
    }
    return combined;
}

module.exports = { parseCatalog, readCatalog };
