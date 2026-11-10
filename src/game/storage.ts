import type { Perks } from './meta';

export interface Settings {
  sound: boolean;
  music: boolean;
}

export interface SaveData {
  /** Sterne pro Level-Index und Schwierigkeit [Leicht, Normal, Schwer] (0 = nicht geschafft) */
  stars: number[][];
  /** Rekord im Endlosmodus (erreichte Welle) pro Level-Index */
  endless: number[];
  /** Gekaufte Shop-Stufen */
  perks: Perks;
  settings: Settings;
}

const KEY = 'inselwaechter.save.v2';
const OLD_KEY = 'inselwaechter.save.v1';

const defaults = (): SaveData => ({ stars: [], endless: [], perks: {}, settings: { sound: true, music: true } });

const num = (v: unknown) => Math.max(0, Number(v) || 0);

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      return {
        stars: Array.isArray(d.stars) ? d.stars.map((r) => (Array.isArray(r) ? [num(r[0]), num(r[1]), num(r[2])] : [0, 0, 0])) : [],
        endless: Array.isArray(d.endless) ? d.endless.map(num) : [],
        perks: typeof d.perks === 'object' && d.perks ? d.perks : {},
        settings: { ...defaults().settings, ...(d.settings ?? {}) },
      };
    }
    // Alten Spielstand übernehmen: bisherige Sterne zählen als "Normal"
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const d = JSON.parse(old) as { stars?: unknown[]; settings?: Partial<Settings> };
      const res = defaults();
      res.stars = (d.stars ?? []).map((s) => [0, num(s), 0]);
      res.settings = { ...res.settings, ...(d.settings ?? {}) };
      return res;
    }
  } catch {
    /* defekter Speicher – mit leerem Stand weiter */
  }
  return defaults();
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* Speicher nicht verfügbar – Spiel läuft trotzdem weiter */
  }
}

/** Beste Sterne einer Insel über alle Schwierigkeitsgrade */
export function bestStars(d: SaveData, level: number): number {
  return Math.max(0, ...(d.stars[level] ?? []));
}

/** Gesammelte Sterne insgesamt (jede Schwierigkeit zählt einzeln) */
export function totalStars(d: SaveData): number {
  return d.stars.reduce((a, r) => a + r.reduce((x, y) => x + y, 0), 0);
}
