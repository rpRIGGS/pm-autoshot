// Read-only PM Emotes catalog parser. Only plain dictionary animations are
// eligible for standalone capture; complex emotes require native playback.
const fs = require('fs');
const path = require('path');

function parseCatalog(source) {
    const categories = ['Emotes', 'Dances', 'Exits'];
    const results = [];
    for (const category of categories) {
        const declaration = new RegExp('(?:RP|CustomDP)\\.' + category + '\\s*=\\s*\\{', 'g');
        const found = declaration.exec(source);
        if (!found) continue;
        const start = found.index + found[0].length;
        // A section ends at the next top-level category declaration.
        const rest = source.slice(start);
        const next = /(?:^|\n)\s*(?:RP|CustomDP)\.[A-Za-z]+\s*=\s*\{/m.exec(rest);
        const section = next ? rest.slice(0, next.index) : rest;
        const entry = /^    \[["']([^"'\r\n]+)["']\]\s*=\s*\{/gm;
        let match;
        while ((match = entry.exec(section))) {
            const key = match[1];
            if (['AnimationOptions', 'Prop', 'Ptfx'].includes(key)) continue;
            const body = section.slice(entry.lastIndex);
            const values = /^\s*["']([^"'\r\n]+)["']\s*,\s*["']([^"'\r\n]+)["']/.exec(body);
            if (!values) continue;
            // Inspect the complete entry until the next same-level declaration.
            // Nested animation options are not eligible for plain playback if
            // they require props, attached objects, or particle effects.
            const nextEntry = /\n    \["'][^"'\r\n]+["']\s*=\s*\{/g;
            const remaining = section.slice(entry.lastIndex);
            const following = nextEntry.exec(remaining);
            const detail = following ? remaining.slice(0, following.index) : remaining;
            if (/\b(?:Prop|SecondProp|PtfxAsset|PtfxName)\s*=/.test(detail)) continue;
            const [dict, clip] = values.slice(1);
            if (dict.length > 200 || clip.length > 200) continue;
            results.push({ key, category, dict, clip });
        }
    }
    return results;
}

function readCatalog(resourceName = 'pm-emotes') {
    const root = GetResourcePath(resourceName);
    if (!root) throw new Error('PM Emotes resource is not installed: ' + resourceName);
    const combined = new Map();
    for (const relative of ['client/AnimationList.lua', 'client/AnimationListCustom.lua']) {
        const file = path.join(root, relative);
        if (!fs.existsSync(file)) continue;
        for (const entry of parseCatalog(fs.readFileSync(file, 'utf8'))) {
            combined.set(entry.category + ':' + entry.key, entry);
        }
    }
    return [...combined.values()];
}

module.exports = { parseCatalog, readCatalog };
