import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'client',
  server: {
    port: 5190, strictPort: true,
    // Native filesystem events avoid continuous CPU/disk polling.
    // Only source edits may reload the page: server data, builds and test output must never trigger a full reload.
    watch: { ignored: ['**/data/**', '**/dist/**', '**/test-results/**', '**/.git/**', '**/*.tmp'], ...(process.env.KONTIR_POLLING === '1' ? { usePolling: true, interval: 700 } : {}) },
    fs: { allow: ['..'] },
    proxy: { '/socket.io': { target: 'http://127.0.0.1:3101', ws: true } },
  },
  // Pre-bundle every dependency up front: otherwise Vite discovers one at runtime, re-optimizes and force-reloads the page.
  optimizeDeps: { include: ['three', 'three-mesh-bvh', 'gsap', 'socket.io-client', ...['controls/PointerLockControls', 'csm/CSM', 'environments/RoomEnvironment', 'geometries/RoundedBoxGeometry', 'libs/meshopt_decoder.module', 'loaders/DRACOLoader', 'loaders/GLTFLoader', 'objects/Sky', 'postprocessing/EffectComposer', 'postprocessing/GTAOPass', 'postprocessing/OutputPass', 'postprocessing/RenderPass', 'postprocessing/UnrealBloomPass', 'utils/BufferGeometryUtils', 'utils/SkeletonUtils'].map(m => `three/addons/${m}.js`)] },
  build: {
    outDir: '../dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: resolve('client/index.html'), viewer: resolve('client/viewer.html') }, output: { manualChunks(id) {
      if (id.includes('/node_modules/three/')) return 'three';
      if (id.includes('/node_modules/')) return 'vendor';
    } } },
  },
});
