import { defineConfig } from 'vitest/config';

// Engine tests live in /shared (pure TypeScript, no DB or browser needed).
export default defineConfig({
  test: { include: ['shared/**/*.test.ts'], environment: 'node' },
});
