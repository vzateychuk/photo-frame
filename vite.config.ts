import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: 'src/public',
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      input: {
        main: path.resolve(rootDir, 'index.html'),
        catalogAdmin: path.resolve(rootDir, 'catalog/index.html'),
      },
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
  plugins: [
    {
      name: 'catalog-route-without-trailing-slash',
      configureServer(server) {
        // Vite otherwise maps /catalog to the root slideshow index.html.
        // Desired: / → slideshow, /catalog → catalog page (slash optional).
        server.middlewares.use((req, _res, next) => {
          const url = req.url ?? '';
          if (url === '/catalog' || url.startsWith('/catalog?')) {
            req.url = `/catalog/${url.slice('/catalog'.length)}`;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': '/src/front',
    },
  },
});
