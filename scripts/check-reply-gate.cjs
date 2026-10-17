const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transformSync } = require('esbuild');
const code = transformSync(fs.readFileSync('src/renderer/data/minimumReplyGate.ts', 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;
let now = 0, id = 0;
const timers = new Map();
const mod = { exports: {} };
new Function('module', 'exports', 'setTimeout', 'clearTimeout', code)(
  mod, mod.exports,
  (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; },
  (key) => timers.delete(key),
);
const { MinimumReplyGate } = mod.exports;
function advance(ms) {
  now += ms;
  for (const [key, task] of [...timers]) {
    if (task.at <= now) { timers.delete(key); task.fn(); }
  }
}
const events = [];
const gate = new MinimumReplyGate((text) => events.push(text), () => events.push('done'));
gate.begin();
gate.update('fast partial');
gate.finish('fast complete');
advance(999);
assert.deepEqual(events, []);
advance(1);
assert.deepEqual(events.splice(0), ['fast complete', 'done']);
gate.begin();
advance(2400);
assert.deepEqual(events, []);
gate.update('slow partial');
gate.finish('slow complete');
assert.deepEqual(events.splice(0), ['slow partial', 'slow complete', 'done']);
gate.begin();
gate.finish('must not appear after error');
gate.cancel();
advance(3000);
assert.deepEqual(events, []);
gate.begin();
gate.finish('old');
advance(500);
gate.begin();
gate.finish('new');
advance(500);
assert.deepEqual(events, []);
advance(500);
assert.deepEqual(events, ['new', 'done']);
assert.equal(timers.size, 0);
console.log('Reply gate checks passed: fast reply buffering, slow streaming, cancellation, restart.');
