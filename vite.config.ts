import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// 渲染进程构建：root = src/renderer，产物输出到 dist/
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
