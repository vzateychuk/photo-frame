import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/front/**/*.spec.ts'],
    testTimeout: 10000,
    globals: true,
    setupFiles: [],
  },
  define: {
    'import.meta.vitest': undefined,
  },
});