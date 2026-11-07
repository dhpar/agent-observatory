import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { createFilteredDevLogger } from './src/vite-logger';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Silences only the benign "ws proxy socket error: write ECONN*" noise
  // (peer vanished mid-write; the dashboard reconnects per E10). Real proxy
  // failures — like ECONNREFUSED when the backend is down — still print.
  customLogger: createFilteredDevLogger(),
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
