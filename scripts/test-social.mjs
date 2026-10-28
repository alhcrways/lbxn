import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'shinchan-social-tests-'));
try {
  const output = join(directory, 'social.test.cjs');
  await build({ entryPoints: ['tests/social.test.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: output, sourcemap: 'inline' });
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, ['--test', output], { stdio: 'inherit' });
    child.on('error', error => { console.error(error); resolve(1); });
    child.on('exit', code => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally { await rm(directory, { recursive: true, force: true }); }
