import { defineConfig } from 'vite';

// The browser client lives in src/client; static art inputs (GLB etc.) in /public.
export default defineConfig({
  root: 'src/client',
  publicDir: '../../public',
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
});
