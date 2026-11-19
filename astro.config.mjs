import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://localhost',
  vite: {
    build: { chunkSizeWarningLimit: 2000 },
  },
});
