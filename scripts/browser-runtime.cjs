// 可通过 SHINCHAN_PLAYWRIGHT_PATH 指向已有 Playwright；普通开发环境也可安装 playwright。
const { join } = require('node:path');
const { homedir } = require('node:os');
const candidates = [process.env.SHINCHAN_PLAYWRIGHT_PATH, 'playwright', join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean);
let browserRuntime;
for (const candidate of candidates) {
  try { browserRuntime = require(candidate); break; }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
if (!browserRuntime) throw new Error('Install Playwright or set SHINCHAN_PLAYWRIGHT_PATH before running browser checks.');
module.exports = browserRuntime;
