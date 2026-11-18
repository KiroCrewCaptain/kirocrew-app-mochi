import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The module the dashboard lazy-imports: the page (`ui.entry`, `dist/index.mjs`).
// Every host module is EXTERNAL: the dashboard's import map resolves these seven
// bare specifiers to its own instances (one React, one query client, one SDK), so
// nothing the host provides is bundled twice.
// tests/test_manifest_contract.py pins that the built files import nothing else.
export const HOST_MODULES = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'lucide-react',
  '@tanstack/react-query',
  '@kirocrew/app-sdk',
  '@kirocrew/app-sdk/ui',
]

export const ENTRIES = {
  index: 'src/entries/index.tsx',
}

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: ENTRIES,
      formats: ['es'],
      fileName: (_format, name) => `${name}.mjs`,
    },
    outDir: 'dist',
    emptyOutDir: true,
    // The bundle is committed (the install path is a plain clone, with no build
    // step), so it stays readable for review. CI rebuilds it and fails on a diff.
    minify: false,
    sourcemap: false,
    rollupOptions: {
      external: HOST_MODULES,
      output: {
        chunkFileNames: 'chunks/[name]-[hash].mjs',
      },
    },
  },
})
