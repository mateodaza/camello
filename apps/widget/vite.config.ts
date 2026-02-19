import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'CamelloWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      // Bundle everything into a single file (no external deps)
    },
    cssCodeSplit: false,  // Inline CSS into the JS bundle
    minify: 'terser',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
