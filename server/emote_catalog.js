// Read-only catalog adapter for the installed PM Emotes resource.
// Extracts dictionary/clip pairs from actual AnimationList.lua, not a guessed list.
// This intentionally skips scenarios, expressions, prop and synchronized emotes
// until their dedicated capture strategies are implemented.
const fs = require('fs');
const path = require('path');

function readCatalog(resourceName = 'pm-emotes') {
    const root = GetResourcePath(resourceName);
    if (!root) throw new Error('PM Emotes resource is not installed: ' + resourceName);
    const file = path.join(root, 'client', 'AnimationList.lua');
    const source = fs.readFileSync(file, 'utf8');
    const categories = ['Emotes', 'Dances', 'Exits'];
    const result = [];
    for (const category of categories) {
        const start = source.indexOf('RP.' + category + ' = {');
        if (start < 0) continue;
        const next = source.indexOf('\nRP.', start + 1);
        const section = source.slice(start, next < 0 ? source.length : next);
        // Match entry headers and inspect only the first two values.
        const header = /\["([^"]+)"\]\s*=\s*\{/g;
        const matches = Array.from(section.matchAll(header));
        for (let i = 0; i < matches.length; i++) {
            const key = matches[i][1];
            const begin = matches[i].index + matches[i][0].length;
            const end = i + 1 < matches.length ? matches[i + 1].index : section.length;
            const body = section.slice(begin, Math.min(end, begin + 3000));
            const values = body.match(/^\s*["']([^"'\r\n]+)["']\s*,\s*["']([^"'\r\n]+)["']/);
            if (!values) continue;
            const dict = values[1], clip = values[2];
            if (dict.length > 200 || clip.length > 200) continue;
            result.push({ key, category, dict, clip });
        }
    }
    return result;
}

module.exports = { readCatalog };
