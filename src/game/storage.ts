import { LEVELS } from './data';
import { PERKS, perkSpent, type Perks } from './meta';

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

/** Ganze Zahl im Bereich [0, max]; alles andere (Text, NaN, negativ, riesig) wird zu einem gültigen Wert. */
const int = (v: unknown, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};
const MAX_ENDLESS = 100000;

function cleanStars(v: unknown): number[][] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, LEVELS.length).map((r) => (Array.isArray(r) ? [int(r[0], 3), int(r[1], 3), int(r[2], 3)] : [0, 0, 0]));
}

function cleanPerks(v: unknown): Perks {
  const out: Perks = {};
  if (!v || typeof v !== 'object') return out;
  const src = v as Record<string, unknown>;
  // Nur bekannte Boni, Stufe auf das Maximum begrenzt
  for (const p of PERKS) {
    const lvl = int(src[p.id], p.costs.length);
    if (lvl) out[p.id] = lvl;
  }
  return out;
}

function cleanSettings(v: unknown): Settings {
  const d = defaults().settings;
  if (!v || typeof v !== 'object') return d;
  const s = v as Record<string, unknown>;
  return {
    sound: typeof s.sound === 'boolean' ? s.sound : d.sound,
    music: typeof s.music === 'boolean' ? s.music : d.music,
  };
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Record<string, unknown> | null;
      if (d && typeof d === 'object') {
        const res: SaveData = {
          stars: cleanStars(d.stars),
          endless: Array.isArray(d.endless) ? d.endless.slice(0, LEVELS.length).map((n) => int(n, MAX_ENDLESS)) : [],
          perks: cleanPerks(d.perks),
          settings: cleanSettings(d.settings),
        };
        // Mehr Boni gekauft als Sterne vorhanden (z. B. manipuliert) -> Boni zurücksetzen
        if (perkSpent(res.perks) > totalStars(res)) res.perks = {};
        return res;
      }
    }
    // Alten Spielstand übernehmen: bisherige Sterne zählen als "Normal"
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const d = JSON.parse(old) as { stars?: unknown; settings?: unknown } | null;
      const res = defaults();
      if (d && typeof d === 'object') {
        res.stars = Array.isArray(d.stars) ? d.stars.slice(0, LEVELS.length).map((s) => [0, int(s, 3), 0]) : [];
        res.settings = cleanSettings(d.settings);
      }
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
