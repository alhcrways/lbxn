import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

// Generate one local shell; note contents/images arrive through IPC, not a data URL.
const noteView = await build({
  entryPoints: ['src/main/noteView.ts'], bundle: true, platform: 'node', format: 'cjs', write: false,
});
const noteModule = { exports: {} };
new Function('module', 'exports', noteView.outputFiles[0].text)(noteModule, noteModule.exports);
writeFileSync('assets/note-window.html', noteModule.exports.noteHtml({
  id: '', content: '', color: 'yellow', pinned: false, createdAt: 0, updatedAt: 0,
}), 'utf8');

const socialView = await build({ entryPoints: ['src/main/socialView.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const socialModule = { exports: {} };
new Function('module', 'exports', socialView.outputFiles[0].text)(socialModule, socialModule.exports);
writeFileSync('assets/social-window.html', socialModule.exports.socialWindowHtml(), 'utf8');
await build({ entryPoints: ['src/social-ui/main.ts'], bundle: true, platform: 'browser', target: 'chrome130', outfile: 'assets/social-ui.js' });

// 主进程 + preload 打包为 CommonJS（Electron 加载 dist-electron/*.cjs）
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
};

await build({
  ...shared,
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist-electron/main.cjs',
});

await build({
  ...shared,
  entryPoints: ['src/main/preload.ts'],
  outfile: 'dist-electron/preload.cjs',
});

await build({ ...shared, entryPoints: ['src/main/socialPreload.ts'], outfile: 'dist-electron/social-preload.cjs' });
