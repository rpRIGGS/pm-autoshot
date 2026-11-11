// Read-only PM Emotes catalog. No Lua code is evaluated.
const fs = require('fs');
const path = require('path');

// Read a balanced Lua table while ignoring braces inside strings and comments.
function tableEnd(text, open) {
    let depth = 0, quote = null, comment = false;
    for (let i = open; i < text.length; i++) {
        const ch = text[i], next = text[i + 1];
        if (comment) { if (ch === '\n') comment = false; continue; }
        if (quote) {
            if (ch === '\\') { i++; continue; }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '-' && next === '-') { comment = true; i++; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '{') depth++;
        if (ch === '}' && --depth === 0) return i;
    }
    return -1;
}

function parseCatalog(source) {
    const result = [];
    for (const category of ['Emotes', 'Dances', 'Exits']) {
        const declaration = new RegExp('(?:RP|CustomDP)\\.' + category + '\\s*=\\s*\\{');
        const found = declaration.exec(source);
        if (!found) continue;
        const open = found.index + found[0].lastIndexOf('{');
        const end = tableEnd(source, open);
        if (end < 0) continue;
        const section = source.slice(open + 1, end);
        const header = /^[ \t]*\[["']([^"'\r\n]+)["']\]\s*=\s*\{/gm;
        let match;
        while ((match = header.exec(section))) {
            const key = match[1];
            const entryOpen = header.lastIndex - 1;
            const entryEnd = tableEnd(section, entryOpen);
            if (entryEnd < 0) continue;
            const body = section.slice(entryOpen + 1, entryEnd);
            // Only the first two string values identify plain dictionary clips.
            const values = /^\s*["']([^"'\r\n]+)["']\s*,\s*["']([^"'\r\n]+)["']/.exec(body);
            if (values && !/\b(?:Prop|SecondProp|PtfxAsset|PtfxName)\s*=/.test(body)) {
                const [, dict, clip] = values;
                if (dict.length <= 200 && clip.length <= 200) result.push({ key, category, dict, clip });
            }
            header.lastIndex = entryEnd + 1;
        }
    }
    return result;
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

module.exports = { tableEnd, parseCatalog, readCatalog };
