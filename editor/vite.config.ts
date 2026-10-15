import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devFsPlugin } from './tools/devfs/src/plugin.ts';

const gameDir = fileURLToPath(new URL('../game', import.meta.url));
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

// 遊戲的套件以原始碼直接引用（唯讀），依賴（phaser、zod）從 game/node_modules 解析
export default defineConfig({
  plugins: [react(), devFsPlugin(projectRoot)],
  resolve: {
    alias: {
      '@lawn/shared': `${gameDir}/shared/src/index.ts`,
      '@lawn/engine': `${gameDir}/engine/src/index.ts`,
    },
  },
  server: {
    port: 5180,
    fs: { allow: ['.', gameDir] },
  },
});
