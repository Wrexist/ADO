import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
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
