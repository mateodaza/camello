import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  noExternal: [/^@camello\//],
  banner: {
    // Provide a real `require` for CJS packages (pg, etc.) bundled into ESM output
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
