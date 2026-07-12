import { defineConfig } from 'vitest/config';

// Phase 0: a single deterministic smoke test proves the toolchain runs.
// Phases 1+ add component and contract tests across the workspaces.
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
