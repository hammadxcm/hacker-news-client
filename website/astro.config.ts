import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://hammadxcm.github.io',
  base: '/hacker-news-client/',
  output: 'static',
  trailingSlash: 'ignore',
  compressHTML: true,
  integrations: [react(), mdx(), sitemap()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'de', 'pt', 'ru', 'zh', 'hi', 'ar', 'ur', 'bn', 'ja'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
