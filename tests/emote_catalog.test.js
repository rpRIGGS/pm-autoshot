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
assert.deepEqual(parsed.map(x => x.key), ['atm', 'wave', 'prop', 'dance1', 'exit1']);
assert.equal(parsed[0].native, true);
assert.equal(parsed[2].native, true);
assert.equal(parsed[1].dict, 'friends@frj@ig_1');
assert.equal(parsed[3].clip, 'clip');
const custom = parseCatalog('CustomDP.Emotes = {\n    ["custom"] = { "custom@dict", "idle", "Custom" },\n}\nCustomDP.Dances = {}');
assert.equal(custom.length, 1);
assert.equal(custom[0].key, 'custom');
console.log('PM Emotes catalog parser fixture passed');

const nested = parseCatalog(`
RP.Emotes = {
  ["nested"] = { "dict@nested", "idle", "Nested", AnimationOptions = {
    EmoteLoop = true,
    Options = { Extra = "{quoted}" }
  }},
  ["withprop"] = { "dict@prop", "idle", "Prop", AnimationOptions = {
    Prop = "prop_foo", PropBone = 28422
  }},
  ["after"] = { "dict@after", "idle", "After" },
}
RP.Dances = {\n  ["dance"] = { "dict@dance", "loop", "Dance" }\n}
`);
assert.deepEqual(nested.map(x => x.key), ['nested', 'withprop', 'after', 'dance']);
assert.equal(nested[1].native, true);
const comments = parseCatalog(`
RP.Emotes = {
  -- braces in comments } { should not terminate the section
  ["quoted"] = { "dict@quoted", "clip", "A } tricky label" },
}
`);
assert.equal(comments.length, 1);

const props = parseCatalog(`
RP.PropEmotes = {
    ["coffee"] = { "amb@world_human_drinking", "idle", "Coffee", AnimationOptions = { Prop = "prop_coffee" } },
}
`);
assert.equal(props.length, 1);
assert.deepEqual({key:props[0].key, native:props[0].native, category:props[0].category}, {key:'coffee', native:true, category:'PropEmotes'});
