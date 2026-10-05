import { defineConfig } from 'vite';

// GitHub Pages serves the site under /inbox-raid/
export default defineConfig({
  base: '/inbox-raid/',
  server: { port: 5173, strictPort: true },
});
