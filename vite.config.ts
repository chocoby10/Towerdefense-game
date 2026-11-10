import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';

/**
 * Erzeugt beim Build einen Service Worker (sw.js), der alle Dateien des Spiels
 * zwischenspeichert. Danach läuft das Spiel auch ohne Internet.
 * Der Cache-Name enthält einen Hash über alle Dateien, damit jede neue Version
 * den alten Cache sauber ersetzt.
 */
function serviceWorker(): Plugin {
  return {
    name: 'inselwaechter-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const extra = ['icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
      const all = ['./', ...[...files, ...extra].map((f) => `./${f}`)];
      const hash = createHash('sha256');
      for (const f of files) {
        const chunk = bundle[f];
        hash.update(f);
        hash.update(chunk.type === 'chunk' ? chunk.code : typeof chunk.source === 'string' ? chunk.source : Buffer.from(chunk.source));
      }
      const version = hash.digest('hex').slice(0, 12);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// Automatisch erzeugt beim Build – nicht von Hand bearbeiten.
const CACHE = 'inselwaechter-${version}';
const FILES = ${JSON.stringify(all)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('inselwaechter-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Seite selbst: zuerst Netz (für Updates), ohne Netz die gespeicherte Version
    e.respondWith(fetch(req).catch(() => caches.match('./', { ignoreSearch: true })));
    return;
  }
  // Dateien mit Hash im Namen ändern sich nie: zuerst aus dem Cache
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`,
      });
    },
  };
}

// base './' ist nötig, damit der Build auch in der Android-WebView (Capacitor) funktioniert.
export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
