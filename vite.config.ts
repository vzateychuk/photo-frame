import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'src/public',
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
    modulePreload: {
      polyfill: false,
    },
  },
  server: {
    port: 5173,
    host: true,
    open: false,
  },
  resolve: {
    alias: {
      '@': '/src/front',
    },
  },
});