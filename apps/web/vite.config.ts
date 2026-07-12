import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // VITE_* vars come from the repo-root .env (single env file for server + web)
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: {
    alias: {
      // resolve the shared workspace package straight from source
      // (most-specific first: a bare prefix alias would mangle the /mock subpath)
      '@ado/shared/mock': fileURLToPath(new URL('../../packages/shared/src/mock/index.ts', import.meta.url)),
      '@ado/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
