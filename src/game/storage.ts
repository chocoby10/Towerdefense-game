export interface Settings {
  sound: boolean;
  music: boolean;
}

export interface SaveData {
  /** Sterne pro Level-Index (0 = nicht geschafft) */
  stars: number[];
  settings: Settings;
}

const KEY = 'inselwaechter.save.v1';

const defaults = (): SaveData => ({ stars: [], settings: { sound: true, music: true } });

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      stars: Array.isArray(d.stars) ? d.stars.map((n) => Number(n) || 0) : [],
      settings: { ...defaults().settings, ...(d.settings ?? {}) },
    };
  } catch {
    return defaults();
  }
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* Speicher nicht verfügbar – Spiel läuft trotzdem weiter */
  }
}
