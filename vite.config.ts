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
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src/front',
    },
  },
});