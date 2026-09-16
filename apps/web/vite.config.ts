import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webRoot = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = resolve(webRoot, '..', '..');
const htmlEntries = [
  'index.html',
  'hall.html',
  'auth.html',
  'birth.html',
  'chat-hub.html',
  'chat.html',
  'my.html',
  'reading.html',
  'reading-detail.html',
  'records.html',
] as const;

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: resolve(repositoryRoot, 'public'),
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      input: Object.fromEntries(
        htmlEntries.map((entry) => [entry.replace(/\.html$/u, ''), resolve(webRoot, entry)]),
      ),
    },
  },
});
