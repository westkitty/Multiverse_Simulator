import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules')) return 'vendor-react';
          if (
            id.includes('src/worlds/ecosystem') ||
            id.includes('src/worlds/ocean') ||
            id.includes('src/worlds/atmosphere')
          ) {
            return 'worlds-biosphere';
          }
          if (
            id.includes('src/worlds/station') ||
            id.includes('src/worlds/celestial') ||
            id.includes('src/worlds/geology')
          ) {
            return 'worlds-planetary-orbital';
          }
          if (
            id.includes('src/worlds/civilization') ||
            id.includes('src/worlds/megacity') ||
            id.includes('src/worlds/industrial')
          ) {
            return 'worlds-civilization-urban';
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 20000,
  },
});
