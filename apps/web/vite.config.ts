import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // permite abrirlo desde el celular en la misma red Wi-Fi
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
