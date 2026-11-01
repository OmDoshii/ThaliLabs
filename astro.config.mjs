import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Set SITE_URL at build time for correct canonical URLs and sitemap entries.
const site = process.env.SITE_URL || 'https://thalilabs.example';

export default defineConfig({
  site,
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
