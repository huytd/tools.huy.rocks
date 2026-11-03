import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    // D2's WebAssembly build is one ~8 MB chunk, loaded only when D2 is picked.
    chunkSizeWarningLimit: 8500,
  },
})
