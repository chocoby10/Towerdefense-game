import { ENEMIES, LEVELS, type EnemyId, type LevelDef } from './data';

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
  /** HP-Faktor für normale Gegner */
  hpScale: number;
  /** HP-Faktor für Bosse (Kraken) */
  bossScale: number;
}

/** Bisherige HP-Kurve pro Gegner; gilt weiter für Bosse und den Endlosmodus */
function legacyScale(level: LevelDef, i: number): number {
  return level.hpMult * (1 + 0.21 * i + 0.022 * i * i);
}

/** Summe der Grund-HP aller normalen Gegner einer Welle (ohne Bosse) */
function rawHp(groups: SpawnGroup[]): number {
  let hp = 0;
  for (const g of groups) if (!ENEMIES[g.type].boss) hp += ENEMIES[g.type].hp * g.count;
  return hp;
}

/** Form der Schwierigkeitskurve: stetig steigend, sanfter Einstieg, leichte Spitze bei Zwischenbossen */
function shape(i: number): number {
  const ramp = [0.5, 0.62, 0.75, 0.88][i] ?? 1;
  const mini = i % 5 === 4 ? 1.1 : 1;
  return (1 + 0.25 * i + 0.18 * i * i) * ramp * mini;
}

const budgetCache = new Map<LevelDef, number>();

/**
 * Faktor A einer Insel: so gewählt, dass die Summe aller Wellen-Budgets genau der
 * bisherigen Gesamtstärke der Insel entspricht. Die Insel bleibt also insgesamt gleich
 * schwer – nur gleichmäßig verteilt statt mit Ausreißern.
 */
function islandFactor(level: LevelDef, levelIndex: number): number {
  let a = budgetCache.get(level);
  if (a === undefined) {
    let total = 0, shapes = 0;
    for (let i = 0; i < level.waves; i++) {
      total += rawHp(composeWave(level, levelIndex, i, false)) * legacyScale(level, i);
      shapes += shape(i);
    }
    a = total / shapes;
    budgetCache.set(level, a);
  }
  return a;
}

/** Erzeugt Welle i (0-basiert) für ein Level. Deterministisch, damit Level reproduzierbar sind. */
/** endless: Wellen gehen unbegrenzt weiter, alle 10 Wellen kommt ein Kraken. */
export function buildWave(level: LevelDef, levelIndex: number, i: number, endless = false): Wave {
  const groups = composeWave(level, levelIndex, i, endless);
  const legacy = legacyScale(level, i);
  // Endlosmodus: bisherige Kurve, damit Rekorde vergleichbar bleiben
  if (endless || i >= level.waves) return { groups, hpScale: legacy, bossScale: legacy };
  const raw = rawHp(groups);
  const hpScale = raw > 0 ? (islandFactor(level, levelIndex) * shape(i)) / raw : legacy;
  return { groups, hpScale, bossScale: legacy };
}

/** Zusammensetzung einer Welle (welche Gegner, wie viele, wann) */
function composeWave(level: LevelDef, levelIndex: number, i: number, endless: boolean): SpawnGroup[] {
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

  return g;
}

/** Nur für Tests/Analyse: Gesamt-HP der normalen Gegner einer Welle */
export function waveHp(levelIndex: number, i: number): number {
  const lv = LEVELS[levelIndex];
  const w = buildWave(lv, levelIndex, i);
  return rawHp(w.groups) * w.hpScale;
}
