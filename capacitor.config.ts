import type { CapacitorConfig } from '@capacitor/cli';

// appId vor der Veröffentlichung auf eine eigene, eindeutige Kennung ändern
// (z. B. de.<deinname>.inselwaechter). Sie kann nach dem ersten Play-Store-Upload
// nicht mehr geändert werden.
const config: CapacitorConfig = {
  appId: 'de.inselwaechter.game',
  appName: 'Inselwächter',
  webDir: 'dist',
  android: {
    backgroundColor: '#0b3d5c',
  },
};

export default config;
