import { defineConfig } from 'vite';

// base './' ist nötig, damit der Build auch in der Android-WebView (Capacitor) funktioniert.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
