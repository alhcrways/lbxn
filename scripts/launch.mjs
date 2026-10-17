// Electron 启动器：在调用 electron 之前清除干扰环境变量
// 供 npm scripts 通过 "node scripts/launch.mjs" 调用
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2); // 透传额外参数（如 --no-sandbox）

// 彻底删除会干扰 Electron GUI 模式的环境变量
delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.NODE_OPTIONS;

const isDevUrl = process.env.ELECTRON_START_URL;
const electronBin = resolve(root, 'node_modules/electron/dist/electron.exe');

const child = spawn(electronBin, [root, ...args], {
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('close', (code) => process.exit(code ?? 0));
