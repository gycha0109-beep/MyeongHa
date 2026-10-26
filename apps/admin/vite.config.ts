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
    proxy: {
      '/api/admin': { target: 'http://127.0.0.1:4185', changeOrigin: true },
      '/api/auth/sign-in': { target: 'http://127.0.0.1:4185', changeOrigin: true },
    },
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
