import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const gameDir = fileURLToPath(new URL('../game', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@lawn/shared': `${gameDir}/shared/src/index.ts`,
      '@lawn/engine': `${gameDir}/engine/src/index.ts`,
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/*/src/**/*.test.ts'],
  },
});
