import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'engine/src/**/*.test.ts', 'tools/*/src/**/*.test.ts'],
  },
});
