export type TowerId = 'sling' | 'conch' | 'spear' | 'fire' | 'storm';
export type EnemyId = 'crab' | 'gecko' | 'pirate' | 'gull' | 'turtle' | 'shaman' | 'kraken' | 'jelly' | 'jellyling' | 'eel';
export type TargetMode = 'first' | 'last' | 'strong' | 'close';

export const TARGET_MODES: TargetMode[] = ['first', 'last', 'strong', 'close'];
export const TARGET_LABEL: Record<TargetMode, string> = {
  first: 'Vorderster',
  last: 'Hinterster',
  strong: 'Stärkster',
  close: 'Nächster',
};

export interface TowerLevel {
  range: number;
  damage: number;
  /** Schüsse pro Sekunde */
  rate: number;
  upgradeCost?: number;
  splash?: number;
  burnDps?: number;
  burnDur?: number;
  slow?: number;
  slowDur?: number;
  chain?: number;
  /** Anzahl gleichzeitiger Ziele pro Schuss */
  multi?: number;
  /** Betäubung in Sekunden (Gegner bleibt stehen) */
  stun?: number;
}

/** Spezialisierung auf Stufe 3: Spieler wählt einen von zwei Zweigen. */
export interface TowerBranch {
  name: string;
  desc: string;
  cost: number;
  stats: TowerLevel;
}

export interface TowerDef {
  id: TowerId;
  name: string;
  desc: string;
  cost: number;
  hitsAir: boolean;
  hitsGround: boolean;
  pierceArmor: boolean;
  kind: 'projectile' | 'pulse' | 'chain';
  projSpeed: number;
  /** Ab welchem Level (Index) der Turm verfügbar ist */
  unlock: number;
  /** Stufe 1 und 2 (Index 0 und 1) */
  levels: TowerLevel[];
  /** Stufe 3: zwei Spezialisierungen */
  branches: [TowerBranch, TowerBranch];
}

export const TOWERS: Record<TowerId, TowerDef> = {
  sling: {
    id: 'sling', name: 'Schleuder', desc: 'Schnell und günstig. Trifft Boden- und Luftziele.',
    cost: 60, hitsAir: true, hitsGround: true, pierceArmor: false, kind: 'projectile', projSpeed: 560, unlock: 0,
    levels: [
      { range: 150, damage: 11, rate: 1.8, upgradeCost: 55 },
      { range: 165, damage: 18, rate: 2.2 },
    ],
    branches: [
      { name: 'Doppelschleuder', desc: 'Schießt auf zwei Ziele gleichzeitig.', cost: 100,
        stats: { range: 185, damage: 24, rate: 2.6, multi: 2 } },
      { name: 'Felsbrocken', desc: 'Schwere Brocken mit kleinem Flächenschaden.', cost: 110,
        stats: { range: 175, damage: 62, rate: 1.1, splash: 40 } },
    ],
  },
  conch: {
    id: 'conch', name: 'Muschelhorn', desc: 'Schallwelle verlangsamt alle Gegner in Reichweite.',
    cost: 80, hitsAir: true, hitsGround: true, pierceArmor: true, kind: 'pulse', projSpeed: 0, unlock: 0,
    levels: [
      { range: 115, damage: 4, rate: 0.9, slow: 0.35, slowDur: 1.4, upgradeCost: 70 },
      { range: 130, damage: 8, rate: 1.0, slow: 0.45, slowDur: 1.6 },
    ],
    branches: [
      { name: 'Sturmhorn', desc: 'Starke, lange Verlangsamung mit großer Reichweite.', cost: 120,
        stats: { range: 170, damage: 10, rate: 1.1, slow: 0.65, slowDur: 2.4 } },
      { name: 'Donnerhorn', desc: 'Schallschlag mit viel Schaden, betäubt kurz.', cost: 140,
        stats: { range: 140, damage: 38, rate: 0.9, slow: 0.3, slowDur: 1.2, stun: 0.35 } },
    ],
  },
  spear: {
    id: 'spear', name: 'Speer-Totem', desc: 'Große Reichweite, hoher Einzelschaden, durchschlägt Panzer.',
    cost: 110, hitsAir: true, hitsGround: true, pierceArmor: true, kind: 'projectile', projSpeed: 950, unlock: 0,
    levels: [
      { range: 230, damage: 42, rate: 0.55, upgradeCost: 95 },
      { range: 260, damage: 78, rate: 0.65 },
    ],
    branches: [
      { name: 'Speerhagel', desc: 'Wirft drei Speere auf verschiedene Ziele.', cost: 170,
        stats: { range: 270, damage: 75, rate: 0.75, multi: 3 } },
      { name: 'Riesenspeer', desc: 'Enorme Reichweite und Schaden – ideal gegen Bosse.', cost: 180,
        stats: { range: 340, damage: 330, rate: 0.45 } },
    ],
  },
  fire: {
    id: 'fire', name: 'Feuerschale', desc: 'Wirft Glut: Flächenschaden und Brand. Nur Bodenziele.',
    cost: 140, hitsAir: false, hitsGround: true, pierceArmor: false, kind: 'projectile', projSpeed: 380, unlock: 1,
    levels: [
      { range: 140, damage: 20, rate: 0.75, splash: 55, burnDps: 6, burnDur: 2.5, upgradeCost: 115 },
      { range: 150, damage: 34, rate: 0.85, splash: 65, burnDps: 11, burnDur: 2.5 },
    ],
    branches: [
      { name: 'Lavaschale', desc: 'Glut brennt lange und sehr heiß.', cost: 190,
        stats: { range: 160, damage: 40, rate: 0.85, splash: 72, burnDps: 34, burnDur: 4 } },
      { name: 'Feuersturm', desc: 'Wirft doppelt so schnell mit großer Fläche.', cost: 200,
        stats: { range: 165, damage: 48, rate: 1.7, splash: 85, burnDps: 12, burnDur: 2.5 } },
    ],
  },
  storm: {
    id: 'storm', name: 'Sturmstein', desc: 'Kettenblitz, der zwischen mehreren Gegnern überspringt.',
    cost: 200, hitsAir: true, hitsGround: true, pierceArmor: false, kind: 'chain', projSpeed: 0, unlock: 2,
    levels: [
      { range: 165, damage: 32, rate: 0.85, chain: 3, upgradeCost: 165 },
      { range: 180, damage: 52, rate: 0.95, chain: 4 },
    ],
    branches: [
      { name: 'Kugelblitz', desc: 'Springt auf bis zu zehn Gegner.', cost: 270,
        stats: { range: 200, damage: 70, rate: 1.1, chain: 10 } },
      { name: 'Himmelszorn', desc: 'Gewaltiger Blitz, der Gegner betäubt.', cost: 280,
        stats: { range: 210, damage: 210, rate: 0.8, chain: 3, stun: 0.8 } },
    ],
  },
};

export type AbilityId = 'meteor' | 'flood';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  desc: string;
  icon: string;
  cooldown: number;
  key: string;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  meteor: { id: 'meteor', name: 'Vulkanbrocken', desc: 'Tippe auf die Karte: ein glühender Brocken schlägt ein und verbrennt alles im Umkreis.', icon: '☄️', cooldown: 40, key: 'Q' },
  flood: { id: 'flood', name: 'Flutwelle', desc: 'Spült alle Bodengegner ein Stück zurück und bremst sie.', icon: '🌊', cooldown: 60, key: 'E' },
};
export const ABILITY_ORDER: AbilityId[] = ['meteor', 'flood'];

export const TOWER_ORDER: TowerId[] = ['sling', 'conch', 'spear', 'fire', 'storm'];

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  /** Pixel pro Sekunde */
  speed: number;
  armor: number;
  reward: number;
  size: number;
  lives: number;
  flying?: boolean;
  boss?: boolean;
  /** Heilt Verbündete in der Nähe um diesen Anteil der Max-HP pro Sekunde */
  heal?: number;
  /** Zerfällt beim Tod in diese Gegner */
  split?: { type: EnemyId; count: number };
  /** Stromschlag: legt Türme im Umkreis für einige Sekunden lahm */
  shock?: { radius: number; every: number; duration: number };
  hint: string;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  crab: { id: 'crab', name: 'Krabbe', hp: 38, speed: 52, armor: 0, reward: 5, size: 14, lives: 1,
    hint: 'Krabben sind langsam, kommen aber in großen Gruppen.' },
  gecko: { id: 'gecko', name: 'Gecko', hp: 26, speed: 100, armor: 0, reward: 4, size: 11, lives: 1,
    hint: 'Geckos sind sehr schnell – Muschelhörner bremsen sie aus.' },
  pirate: { id: 'pirate', name: 'Pirat', hp: 85, speed: 48, armor: 1, reward: 8, size: 15, lives: 1,
    hint: 'Piraten halten einiges aus.' },
  gull: { id: 'gull', name: 'Möwe', hp: 50, speed: 78, armor: 0, reward: 7, size: 13, lives: 1, flying: true,
    hint: 'Möwen fliegen! Feuerschalen treffen sie nicht.' },
  turtle: { id: 'turtle', name: 'Panzerschildkröte', hp: 210, speed: 30, armor: 7, reward: 13, size: 19, lives: 2,
    hint: 'Gepanzert: Speer-Totem und Muschelhorn ignorieren die Panzerung.' },
  shaman: { id: 'shaman', name: 'Seeschamane', hp: 120, speed: 42, armor: 1, reward: 14, size: 15, lives: 1, heal: 0.06,
    hint: 'Schamanen heilen Gegner in ihrer Nähe – zuerst ausschalten!' },
  jelly: { id: 'jelly', name: 'Qualle', hp: 130, speed: 40, armor: 0, reward: 5, size: 16, lives: 1, split: { type: 'jellyling', count: 2 },
    hint: 'Quallen teilen sich beim Tod in zwei schnelle Quällchen – Flächenschaden hilft!' },
  jellyling: { id: 'jellyling', name: 'Quällchen', hp: 40, speed: 72, armor: 0, reward: 2, size: 9, lives: 1,
    hint: 'Klein, schnell und zahlreich.' },
  eel: { id: 'eel', name: 'Zitteraal', hp: 170, speed: 48, armor: 2, reward: 12, size: 15, lives: 1, shock: { radius: 105, every: 5, duration: 2.5 },
    hint: 'Zitteraale legen Türme in ihrer Nähe mit Stromschlägen kurz lahm. Weitreichende Türme sind sicher!' },
  kraken: { id: 'kraken', name: 'Kraken', hp: 1400, speed: 22, armor: 4, reward: 120, size: 32, lives: 10, boss: true,
    hint: 'Boss! Der Kraken kostet 10 Leben, wenn er durchkommt.' },
};

export type Tile = [number, number];

export type Challenge =
  | { kind: 'maxTowers'; n: number }
  | { kind: 'ban'; tower: TowerId }
  | { kind: 'noAbilities' };

export function challengeText(c: Challenge): string {
  switch (c.kind) {
    case 'maxTowers': return `Höchstens ${c.n} Türme`;
    case 'ban': return `Ohne ${TOWERS[c.tower].name}`;
    case 'noAbilities': return 'Ohne Fähigkeiten';
  }
}

export interface LevelTheme {
  grass: string;
  grass2: string;
  path: string;
  pathEdge: string;
  decor: string;
}

export interface LevelDef {
  name: string;
  subtitle: string;
  /** Wegpunkte in Kachelkoordinaten, nur achsenparallele Segmente. Letzter Punkt = Heiligtum. */
  paths: Tile[][];
  waves: number;
  hpMult: number;
  coins: number;
  lives: number;
  seed: number;
  theme: LevelTheme;
  /** Herausforderung für diese Insel (auf Normal) */
  challenge: Challenge;
}

const BEACH: LevelTheme = { grass: '#6cbf5a', grass2: '#62b352', path: '#e9d39b', pathEdge: '#c9ad6e', decor: '#2f7d3a' };
const VOLCANO: LevelTheme = { grass: '#7a9a4c', grass2: '#6f8e44', path: '#9c8270', pathEdge: '#6e5a4c', decor: '#3d4a2a' };
const LAGOON: LevelTheme = { grass: '#5fb98a', grass2: '#55ad7f', path: '#f0e0b0', pathEdge: '#cdb57c', decor: '#1f6e55' };
const REEF: LevelTheme = { grass: '#8bc46a', grass2: '#7fb85f', path: '#f3d9a8', pathEdge: '#d4b17a', decor: '#3b7d39' };
const STORM: LevelTheme = { grass: '#4f8f5a', grass2: '#478451', path: '#b9b09a', pathEdge: '#8a826f', decor: '#25502d' };
const BAY: LevelTheme = { grass: '#74c49c', grass2: '#69b892', path: '#f2dcc0', pathEdge: '#d2b08e', decor: '#2e7a5e' };
const THUNDER: LevelTheme = { grass: '#5e8c74', grass2: '#56826b', path: '#c9c2b0', pathEdge: '#958d7a', decor: '#2c4f3d' };

export const LEVELS: LevelDef[] = [
  {
    name: 'Palmenstrand', subtitle: 'Die ersten Eindringlinge landen am Strand.',
    paths: [[[-1, 2], [4, 2], [4, 7], [9, 7], [9, 3], [14, 3], [14, 7], [16, 7]]],
    waves: 10, hpMult: 0.9, coins: 190, lives: 20, seed: 11, theme: BEACH, challenge: { kind: 'maxTowers', n: 6 },
  },
  {
    name: 'Vulkanhang', subtitle: 'Ein langer Serpentinenpfad den Berg hinauf.',
    paths: [[[-1, 5], [3, 5], [3, 1], [7, 1], [7, 8], [11, 8], [11, 2], [15, 2], [15, 6], [16, 6]]],
    waves: 12, hpMult: 1.2, coins: 230, lives: 20, seed: 23, theme: VOLCANO, challenge: { kind: 'ban', tower: 'sling' },
  },
  {
    name: 'Zwillingslagune', subtitle: 'Zwei Landungsstellen – teile deine Kräfte auf.',
    paths: [
      [[-1, 1], [5, 1], [5, 5], [12, 5], [12, 8], [16, 8]],
      [[-1, 8], [2, 8], [2, 5], [5, 5], [12, 5], [12, 8], [16, 8]],
    ],
    waves: 14, hpMult: 1.15, coins: 290, lives: 20, seed: 37, theme: LAGOON, challenge: { kind: 'noAbilities' },
  },
  {
    name: 'Riffspirale', subtitle: 'Sie kommen vom Meer und winden sich ins Inselinnere.',
    paths: [[[18, 1], [2, 1], [2, 8], [15, 8], [15, 4], [6, 4], [6, 6], [11, 6]]],
    waves: 16, hpMult: 1.8, coins: 350, lives: 20, seed: 41, theme: REEF, challenge: { kind: 'maxTowers', n: 8 },
  },
  {
    name: 'Sturmküste', subtitle: 'Sturmflut: Angriff von Norden und Süden.',
    paths: [
      [[2, -1], [2, 3], [8, 3], [8, 5], [13, 5], [13, 2], [16, 2]],
      [[5, 10], [5, 7], [8, 7], [8, 5], [13, 5], [13, 2], [16, 2]],
    ],
    waves: 20, hpMult: 1.25, coins: 380, lives: 20, seed: 53, theme: STORM, challenge: { kind: 'ban', tower: 'spear' },
  },
  {
    name: 'Quallenbucht', subtitle: 'In der warmen Bucht treiben Quallen an Land.',
    paths: [[[-1, 8], [3, 8], [3, 2], [8, 2], [8, 7], [12, 7], [12, 1], [16, 1]]],
    waves: 18, hpMult: 1.6, coins: 400, lives: 20, seed: 67, theme: BAY, challenge: { kind: 'noAbilities' },
  },
  {
    name: 'Gewitterriff', subtitle: 'Zitteraale greifen von zwei Seiten an.',
    paths: [
      [[18, 7], [14, 7], [14, 4], [9, 4], [9, 8], [4, 8], [4, 3], [1, 3]],
      [[6, -1], [6, 6], [9, 6], [9, 8], [4, 8], [4, 3], [1, 3]],
    ],
    waves: 20, hpMult: 1.7, coins: 420, lives: 20, seed: 79, theme: THUNDER, challenge: { kind: 'maxTowers', n: 10 },
  },
];
