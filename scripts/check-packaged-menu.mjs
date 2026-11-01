import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const archive = resolve(process.argv[2] || 'release/win-unpacked/resources/app.asar');
if (!existsSync(archive)) throw new Error('Build the packaged app first: ' + archive);
const output = resolve('dist-electron/packaged-menu-test.cjs');
await build({ entryPoints: ['tests/packaged-menu.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: output });
const env = { ...process.env, SHINCHAN_MENU_TEST_ASAR: archive };
for (const key of ['ELECTRON_RUN_AS_NODE','NODE_OPTIONS','ELECTRON_START_URL','SHINCHAN_PROFILE']) delete env[key];
const child = spawn(resolve('node_modules/electron/dist/electron.exe'), [output], { env, stdio: ['ignore','pipe','pipe','ipc'] });
let passed = false, failure = '', diagnostics = '';
for (const stream of [child.stdout,child.stderr]) stream.on('data',data=>{diagnostics=(diagnostics+data).slice(-4000)});
child.on('message', message => {
  if (message.type === 'ready') { child.stdout.destroy(); child.stderr.destroy(); child.send('pipes-closed'); }
  if (message.type === 'pass') { passed = true; console.log('PASS: '+message.details); }
  if (message.type === 'failure') failure = message.error;
});
const timer = setTimeout(()=>{failure='Packaged-menu test timed out';child.kill()},30000);
try {
  const code = await new Promise((resolveCode,reject) => { child.once('error',reject); child.once('exit',resolveCode); });
  if (code !== 0 || !passed) throw new Error(failure || `Packaged test exited without success (code ${code}): ${diagnostics}`);
} finally { clearTimeout(timer); rmSync(output, { force: true }); }
