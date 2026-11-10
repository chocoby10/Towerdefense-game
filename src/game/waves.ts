import type { EnemyId, LevelDef } from './data';

export interface SpawnGroup {
  type: EnemyId;
  count: number;
  /** Sekunden zwischen zwei Gegnern */
  interval: number;
  /** Startverzögerung der Gruppe in Sekunden */
  delay: number;
}

export interface Wave {
  groups: SpawnGroup[];
  hpScale: number;
}

/** Erzeugt Welle i (0-basiert) für ein Level. Deterministisch, damit Level reproduzierbar sind. */
/** endless: Wellen gehen unbegrenzt weiter, alle 10 Wellen kommt ein Kraken. */
export function buildWave(level: LevelDef, levelIndex: number, i: number, endless = false): Wave {
  const last = endless ? i % 10 === 9 : i === level.waves - 1;
  const t = i + Math.floor(levelIndex * 1.5); // effektive Stufe
  const g: SpawnGroup[] = [];

  g.push({ type: 'crab', count: 7 + Math.floor(t * 1.5), interval: 0.7, delay: 0 });
  if (t >= 1) g.push({ type: 'gecko', count: 2 + Math.floor(t * 0.9), interval: 0.55, delay: 4 });
  if (t >= 3 && i % 2 === 1) g.push({ type: 'pirate', count: 2 + Math.floor(t * 0.6), interval: 1.2, delay: 6 });
  if (t >= 4 && i % 3 !== 0) g.push({ type: 'gull', count: 2 + Math.floor(t * 0.55), interval: 0.9, delay: 8 });
  if (t >= 5 && i % 2 === 0) g.push({ type: 'turtle', count: 1 + Math.floor(t * 0.3), interval: 2.4, delay: 10 });
  if (t >= 7 && i % 3 === 1) g.push({ type: 'shaman', count: 1 + Math.floor(t * 0.2), interval: 3, delay: 7 });

  // Neue Gegner nur auf den späteren Inseln (bzw. dort im Endlosmodus)
  if (levelIndex >= 5 && i >= 1 && i % 2 === 1) g.push({ type: 'jelly', count: 2 + Math.floor(t * 0.3), interval: 1.3, delay: 5 });
  if (levelIndex >= 6 && i >= 2 && i % 3 !== 0) g.push({ type: 'eel', count: 1 + Math.floor(t * 0.12), interval: 2.5, delay: 9 });

  if (last) {
    const krakens = endless ? 1 + Math.floor(i / 20) : 1;
    g.push({ type: 'kraken', count: krakens, interval: 10, delay: 12 });
  } else if (i % 5 === 4) {
    // Zwischenboss-Welle
    g.push({ type: 'turtle', count: 2 + Math.floor(t / 4), interval: 1.6, delay: 14 });
  }

  const hpScale = level.hpMult * (1 + 0.21 * i + 0.022 * i * i);
  return { groups: g, hpScale };
}
