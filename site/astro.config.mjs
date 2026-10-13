// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// GitHub Pages project site by default; override with SITE_URL / SITE_BASE for other hosts.
const site = process.env.SITE_URL || 'https://adeeb10abbas.github.io';
const base = process.env.SITE_BASE ?? '/same-goal-different-words';

export default defineConfig({
  site,
  base,
  integrations: [svelte()],
  devToolbar: { enabled: false },
  build: { assets: 'assets' },
});
