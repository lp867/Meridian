import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Content-Security-Policy nur im fertigen Build (der Dev-Server braucht mehr Freiheiten).
// Erlaubt Skripte, Schriften und Daten nur von der eigenen Adresse; Netzwerk nur zu Firebase (Google).
// Google-Anmeldung braucht zusätzlich apis.google.com (Skript) und den Anmelde-Rahmen von firebaseapp.com.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com https://www.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com",
  "frame-src https://*.firebaseapp.com https://accounts.google.com https://www.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const securityHeaders: Plugin = {
  name: 'meridian-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <meta name="referrer" content="no-referrer" />`),
};

export default defineConfig({
  // relative Pfade: läuft auch in einem Unterordner (z. B. GitHub Pages)
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    preact(),
    securityHeaders,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'],
      manifest: {
        id: './',
        name: 'Meridian',
        short_name: 'Meridian',
        description: 'Länder, Städte, Trips und Flüge – deine Reisen auf einer Karte.',
        lang: 'de-CH',
        theme_color: '#08090c',
        background_color: '#08090c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // Firebase (index.esm-*), Städte-/Flughafenlisten und seltene Schriftsysteme nicht vorab laden –
        // erst beim ersten Gebrauch, danach offline verfügbar (spart ~3 MB beim Installieren)
        globIgnores: ['**/inter-cyrillic*', '**/inter-greek*', '**/inter-vietnamese*', '**/index.esm-*.js', '**/data/cities.json', '**/data/airports.json'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === self.location.origin && /\/(assets\/(index\.esm-|inter-).*\.(js|woff2)|data\/(cities|airports)\.json)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'meridian-lazy', expiration: { maxEntries: 40 } },
          },
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
