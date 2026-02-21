import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  // Bundle ALL dependencies — produces a self-contained file for Docker.
  // pnpm's symlinked node_modules breaks when Docker COPY flattens them.
  noExternal: [/.*/],
  banner: {
    // Provide a real `require` for CJS packages (pg, etc.) bundled into ESM output
    js: "import { createRequire } from 'node:module'; import { fileURLToPath as __fileURLToPath } from 'node:url'; import { dirname as __dirname_fn } from 'node:path'; const require = createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __dirname_fn(__filename);",
  },
});
