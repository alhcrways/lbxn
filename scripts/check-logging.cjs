const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter, once } = require('node:events');
const { spawn } = require('node:child_process');
const { buildSync } = require('esbuild');
const folder = path.resolve('output/logging-tests');
fs.mkdirSync(folder, { recursive: true });
const output = path.join(folder, 'logging.cjs');
buildSync({ entryPoints: ['src/main/logging.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: output });
const { guardConsolePipes } = require(output);
const stream = new EventEmitter();
guardConsolePipes([stream]); guardConsolePipes([stream]);
assert.equal(stream.listenerCount('error'), 1, 'Guard installation is idempotent');
assert.doesNotThrow(() => stream.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' })));
const failure = Object.assign(new Error('unrelated write failure'), { code: 'EIO' });
assert.throws(() => stream.emit('error', failure), error => error === failure, 'Real errors must remain visible');
const writer = path.join(folder, 'writer.cjs');
fs.writeFileSync(writer, `
require('./logging.cjs').guardConsolePipes();
const errors=[];
process.stdout.on('error', error=>errors.push(error.code));
process.stderr.on('error', error=>errors.push(error.code));
process.on('message', () => {
  console.log('late stdout after launcher closed');
  console.error('late stderr after launcher closed');
  setTimeout(()=>{process.send({errors});process.exit(0)},150);
});
process.stdout.write('ready');
`);
(async () => {
  const child = spawn(process.execPath, [writer], { stdio: ['ignore','pipe','pipe','ipc'] });
  const timeout = setTimeout(() => child.kill(), 10000);
  try {
    const exited = once(child, 'exit');
    await once(child.stdout, 'data');
    const reply = once(child, 'message');
    child.stdout.destroy(); child.stderr.destroy();
    child.send('pipes-closed');
    const [message] = await reply;
    const [code] = await exited;
    assert.equal(code,0);
    assert.ok(message.errors.includes('EPIPE'), 'The regression must exercise a real broken output pipe');
    console.log('PASS: real closed stdout/stderr pipes, idempotent EPIPE guard, unrelated errors preserved');
  } finally { clearTimeout(timeout); }
})().catch(error=>{console.error(error);process.exitCode=1});
