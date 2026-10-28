import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';

const output = resolve('dist-electron/social-ui-test.cjs');
await build({ entryPoints: ['tests/social-ui.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: output });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const root = resolve('output/social-ui');
await mkdir(root, { recursive: true });
const profile = await mkdtemp(resolve(root, 'profile-'));
env.SOCIAL_UI_TEST_PROFILE = profile;
try { process.exitCode = await new Promise(resolveCode => {
  const child = spawn(resolve('node_modules/electron/dist/electron.exe'), [output], { env, stdio: 'inherit' });
  child.on('error', error => { console.error(error); resolveCode(1); });
  child.on('exit', code => resolveCode(code ?? 1));
});
} finally {
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  await rm(output, { force: true });
}
