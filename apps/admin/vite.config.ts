import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const adminRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: adminRoot,
  base: '/admin/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4184,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4184,
    strictPort: true,
  },
  build: {
    outDir: resolve(adminRoot, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
