import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Ports are overridable; the defaults are unchanged.
 *
 * strictPort makes a taken port a hard failure, which is right — but it also
 * means anyone running a second checkout of this repo (or any other project
 * holding 5180/4000) cannot start the dev server at all, and editing this file
 * to work around that writes a machine-specific port into everyone's history.
 * WEB_PORT / API_PORT move that choice into the environment where it belongs.
 */
const WEB_PORT = Number(process.env.WEB_PORT ?? 5180);
const API_PORT = Number(process.env.API_PORT ?? 4000);
const API_ORIGIN = `http://localhost:${API_PORT}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // FAT32 drive: workspace packages resolve by path, not node_modules
      '@finpilot/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    // 5173 is Vite's default and collides with other local projects — a stale
    // FinPilot tab then proxies /api to whatever else grabbed the port and the
    // HTML reply surfaces as "Internal Server Error". Own port, and strictPort
    // so a clash fails loudly instead of silently drifting.
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      // dev-only: the SPA talks to the API through the Vite proxy; Nginx does this in prod (§5.1)
      '/healthz': API_ORIGIN,
      '/api': API_ORIGIN,
    },
  },
});
