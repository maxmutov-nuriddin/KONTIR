import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'client',
  server: {
    port: 5190, strictPort: true,
    // Native filesystem events avoid continuous CPU/disk polling.
    watch: process.env.KONTIR_POLLING === '1' ? { usePolling: true, interval: 700 } : undefined,
    fs: { allow: ['..'] },
    proxy: { '/socket.io': { target: 'http://127.0.0.1:3101', ws: true } },
  },
  build: {
    outDir: '../dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: resolve('client/index.html'), viewer: resolve('client/viewer.html') }, output: { manualChunks(id) {
      if (id.includes('/node_modules/three/')) return 'three';
      if (id.includes('/node_modules/')) return 'vendor';
    } } },
  },
});
