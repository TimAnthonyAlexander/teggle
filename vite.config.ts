import { defineConfig } from 'vite';

// Fixed, non-standard ports. strictPort makes Vite fail instead of silently picking another one.
// host: true also serves on the LAN so the game can be opened on a phone.
export default defineConfig({
  server: {
    host: true,
    port: 47823,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 47824,
    strictPort: true,
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
});
