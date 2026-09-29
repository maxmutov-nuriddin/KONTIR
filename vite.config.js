import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  server: {
    port: 5190, strictPort: true,
    watch: { usePolling: true, interval: 700 },
    fs: { allow: ['..'] },
    proxy: { '/socket.io': { target: 'http://127.0.0.1:3101', ws: true } },
  },
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 800 },
});
