import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

const rendererPublic = resolve(__dirname, 'src/renderer/public');
const rendererDist = resolve(__dirname, 'dist');
const releaseCharacterFiles = [
  'README.txt',
  'default/blink.webp',
  'default/idle.png',
  'default/shy.png',
  'default/thinking.webp',
];

// 本机保留了许多尚未启用、且已被 .gitignore 排除的动作素材。Vite 默认会把
// public 整目录复制进 dist，因此发布构建结束后只留下当前 MVP 实际使用的角色资源。
const keepReleaseCharacterAssets = {
  name: 'keep-release-character-assets',
  apply: 'build' as const,
  closeBundle() {
    const characterOutput = resolve(rendererDist, 'character');
    rmSync(characterOutput, { recursive: true, force: true });
    rmSync(resolve(rendererDist, 'pixel'), { recursive: true, force: true });
    for (const relativePath of releaseCharacterFiles) {
      const destination = resolve(characterOutput, relativePath);
      mkdirSync(resolve(destination, '..'), { recursive: true });
      copyFileSync(resolve(rendererPublic, 'character', relativePath), destination);
    }
  },
};

// 渲染进程构建：root = src/renderer，产物输出到 dist/
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react(), keepReleaseCharacterAssets],
  build: {
    outDir: resolve(__dirname, 'dist'),
    // dist 位于渲染进程目录之外，Vite 默认不会清理。显式清空可避免
    // 已删除的动作素材继续残留在安装包中，拖慢 Portable 版启动。
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
