import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/subq-character-manager/',
  build: {
    // One cached bundle is fine for an offline app used at the table.
    chunkSizeWarningLimit: 800,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'SubQ Character Manager',
        short_name: 'SubQ',
        description: 'Character sheets for one D&D 5e table.',
        theme_color: '#1b2a3a',
        background_color: '#f3f6f8',
        display: 'standalone',
        start_url: '/subq-character-manager/',
        scope: '/subq-character-manager/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['phase0/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/phase0\//],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.{ts,js}'],
    environment: 'node',
  },
});
