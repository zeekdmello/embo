import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// In development the React app runs on :5173 and forwards /api calls to the Express server on :4000.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_DEV_API ?? 'http://localhost:4000', changeOrigin: true } },
  },
});
