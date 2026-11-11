const assert = require('node:assert/strict');
const { parseCatalog } = require('../server/emote_catalog');
const sample = `
RP.Emotes = {
    ["atm"] = { ScenarioType.SCENARIO, "PROP_HUMAN_ATM", "ATM" },
    ["wave"] = { "friends@frj@ig_1", "wave_a", "Wave" },
    ["prop"] = { "amb@world_human", "base", "With prop", AnimationOptions = { Prop = "x" } },
}
RP.Dances = {
    ["dance1"] = { "anim@dance", "clip", "Dance" },
}
RP.Exits = {
    ["exit1"] = { "anim@exit", "clip", "Exit" },
}
`;
const parsed = parseCatalog(sample);
assert.deepEqual(parsed.map(x => x.key), ['wave', 'dance1', 'exit1']);
assert.equal(parsed[0].dict, 'friends@frj@ig_1');
assert.equal(parsed[1].clip, 'clip');
const custom = parseCatalog('CustomDP.Emotes = {\n    ["custom"] = { "custom@dict", "idle", "Custom" },\n}\nCustomDP.Dances = {}');
assert.equal(custom.length, 1);
assert.equal(custom[0].key, 'custom');
console.log('PM Emotes catalog parser fixture passed');
