import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests run against local Supabase (need Docker)
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
