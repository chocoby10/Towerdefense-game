import { COLS, ROWS, TILE, WAVE_DELAY, EARLY_BONUS_PER_SEC } from './config';
import { DEFAULT_MODS, type Difficulty, type Mods } from './meta';
import type { Challenge } from './data';
import {
  ABILITIES, ENEMIES, LEVELS, TOWERS,
  type AbilityId, type EnemyDef, type EnemyId, type LevelDef, type TargetMode, type Tile, type TowerDef, type TowerId, type TowerLevel,
} from './data';
import { buildWave, type SpawnGroup } from './waves';

export interface Pt { x: number; y: number }

export class Path {
  readonly pts: Pt[];
  readonly cum: number[] = [0];
  readonly total: number;

  constructor(tiles: Tile[]) {
    this.pts = tiles.map(([c, r]) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }));
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.total = this.cum[this.cum.length - 1];
  }

  at(d: number): { x: number; y: number; angle: number } {
    if (d <= 0) {
      const a = this.pts[0], b = this.pts[1];
      return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const a = this.pts[i - 1], b = this.pts[i];
    const seg = this.cum[i] - this.cum[i - 1];
    const f = Math.min(1, (d - this.cum[i - 1]) / seg);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
}

export class Enemy {
  dist = 0;
  x = 0;
  y = 0;
  angle = 0;
  hp: number;
  maxHp: number;
  slowAmt = 0;
  slowT = 0;
  stunT = 0;
  burnDps = 0;
  burnT = 0;
  burnSrc: Tower | null = null;
  healT = 1;
  /** Zeit bis zum nächsten Stromschlag (Zitteraal) */
  shockT = 2;
  alive = true;
  hitFlash = 0;
  anim = Math.random() * 10;

  constructor(readonly id: number, readonly def: EnemyDef, readonly path: Path, hpScale: number) {
    this.maxHp = this.hp = Math.round(def.hp * hpScale);
    const p = path.at(0);
    this.x = p.x; this.y = p.y; this.angle = p.angle;
  }

  get remaining(): number { return this.path.total - this.dist; }
}

/** Wendet Shop-Boni (Schaden, Reichweite) auf Turmwerte an */
export function scaleStats(s: TowerLevel, mods: Mods): TowerLevel {
  return { ...s, damage: Math.round(s.damage * mods.damage), range: Math.round(s.range * mods.range) };
}

export class Tower {
  level = 0;
  cd = 0;
  angle = -Math.PI / 2;
  mode: TargetMode = 'first';
  invested: number;
  kills = 0;
  dealt = 0;
  recoil = 0;
  /** Sekunden, die der Turm noch lahmgelegt ist (Zitteraal) */
  disabledT = 0;
  readonly x: number;
  readonly y: number;

  private cached!: TowerLevel;

  constructor(readonly def: TowerDef, readonly c: number, readonly r: number, readonly mods: Mods = DEFAULT_MODS) {
    this.x = (c + 0.5) * TILE;
    this.y = (r + 0.5) * TILE;
    this.invested = def.cost;
  }

  /** Gewählte Spezialisierung auf Stufe 3 (-1 = keine) */
  branch = -1;

  /** Aktuelle Werte inkl. Shop-Boni (gecacht, da sehr oft abgefragt) */
  get stats(): TowerLevel {
    if (!this.cached) this.refresh();
    return this.cached;
  }

  /** Nach Stufenwechsel aufrufen */
  refresh(): void {
    const base = this.level >= 2 ? this.def.branches[this.branch].stats : this.def.levels[this.level];
    this.cached = scaleStats(base, this.mods);
  }
  /** Kosten für die nächste normale Stufe; null, wenn als Nächstes eine Spezialisierung gewählt wird oder max. Stufe */
  get upgradeCost(): number | null { return this.level === 0 ? this.def.levels[0].upgradeCost ?? null : null; }
  get canSpecialize(): boolean { return this.level === 1; }
  get branchName(): string | null { return this.branch >= 0 ? this.def.branches[this.branch].name : null; }
  get sellValue(): number { return Math.floor(this.invested * this.mods.sellRatio); }
}

export interface Projectile {
  x: number; y: number; tx: number; ty: number;
  target: Enemy | null;
  tower: Tower;
  speed: number;
  traveled: number;
  dead: boolean;
}

export type Fx =
  | { k: 'p'; x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }
  | { k: 'ring'; x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; w: number }
  | { k: 'bolt'; pts: Pt[]; life: number; max: number }
  | { k: 'txt'; x: number; y: number; text: string; color: string; life: number; max: number; size: number }
  | { k: 'flood'; life: number; max: number };

export interface Meteor { x: number; y: number; t: number; max: number }

export const METEOR_RADIUS = 95;
const METEOR_FALL = 0.6;

export type Sfx = 'shoot' | 'spear' | 'fire' | 'pulse' | 'zap' | 'hit' | 'pop' | 'boom' | 'build' | 'sell' | 'upgrade' | 'leak' | 'wave' | 'coin' | 'error' | 'win' | 'lose'
  | 'meteor' | 'flood' | 'combo' | 'boss';

export type GameEvent =
  | { type: 'sfx'; name: Sfx }
  | { type: 'toast'; title: string; text: string }
  | { type: 'leak' }
  | { type: 'won' }
  | { type: 'lost' }
  /** Ein sicherer Speicherpunkt liegt in game.checkpoint bereit */
  | { type: 'checkpoint' };

/** Gespeicherter Spielstand einer laufenden Partie (immer zwischen zwei Wellen) */
export interface RunSnapshot {
  v: 1;
  level: number;
  difficulty: Difficulty;
  endless: boolean;
  challenge: boolean;
  coins: number;
  lives: number;
  /** Anzahl bereits gestarteter Wellen */
  wave: number;
  kills: number;
  cooldowns: Record<AbilityId, number>;
  towers: { id: TowerId; c: number; r: number; level: number; branch: number; mode: TargetMode; invested: number; kills: number }[];
  seen: EnemyId[];
}

export interface Decor { c: number; r: number; kind: 'palm' | 'rock' | 'bush' }

interface Spawner { g: SpawnGroup; spawned: number; t: number }

export const key = (c: number, r: number) => r * COLS + c;
export const inBounds = (c: number, r: number) => c >= 0 && r >= 0 && c < COLS && r < ROWS;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_FX = 700;

export class Game {
  readonly level: LevelDef;
  readonly paths: Path[];
  readonly pathTiles = new Set<number>();
  readonly blocked = new Set<number>();
  readonly decor: Decor[] = [];
  readonly goal: Pt;

  towers: Tower[] = [];
  towerMap = new Map<number, Tower>();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  fx: Fx[] = [];
  events: GameEvent[] = [];

  coins: number;
  lives: number;
  readonly maxLives: number;
  /** Anzahl bereits gestarteter Wellen */
  wave = 0;
  readonly totalWaves: number;
  countdown = -1;
  speed = 1;
  paused = false;
  state: 'playing' | 'won' | 'lost' = 'playing';
  time = 0;
  kills = 0;

  placing: TowerId | null = null;
  selected: Tower | null = null;
  hover: { c: number; r: number } | null = null;
  /** Zeigerposition in Spielkoordinaten (für Fähigkeiten-Vorschau) */
  hoverPt: Pt | null = null;
  /** Fähigkeit, deren Ziel gerade gewählt wird */
  aiming: AbilityId | null = null;
  /** Verbleibende Abklingzeit je Fähigkeit in Sekunden */
  cooldowns: Record<AbilityId, number> = { meteor: 0, flood: 0 };
  meteors: Meteor[] = [];
  /** Stärke des Bildschirmwackelns in Pixeln */
  shake = 0;
  combo = 0;
  private comboT = 0;

  private spawners: Spawner[] = [];
  private hpScale = 1;
  private bossScale = 1;
  private bonusWave = 0;
  /** Letzter sicherer Speicherpunkt (zwischen zwei Wellen) */
  checkpoint: RunSnapshot | null = null;
  private nextId = 1;
  private spawnToggle = 0;
  private seen = new Set<EnemyId>();

  readonly endless: boolean;
  readonly difficulty: Difficulty;
  readonly mods: Mods;
  /** Aktive Herausforderung (nur auf Normal) */
  readonly challenge: Challenge | null;

  constructor(readonly levelIndex: number, opts: { difficulty?: Difficulty; endless?: boolean; mods?: Mods; challenge?: boolean } = {}) {
    this.endless = opts.endless ?? false;
    this.difficulty = opts.difficulty ?? 1;
    this.mods = opts.mods ?? DEFAULT_MODS;
    this.challenge = opts.challenge ? LEVELS[levelIndex].challenge : null;
    this.level = LEVELS[levelIndex];
    this.paths = this.level.paths.map((p) => new Path(p));
    this.coins = Math.round(this.level.coins * this.mods.coinsMult) + this.mods.coinsBonus;
    this.lives = this.maxLives = this.level.lives + this.mods.lives;
    this.totalWaves = this.endless ? Infinity : this.level.waves;
    const last = this.level.paths[0][this.level.paths[0].length - 1];
    this.goal = { x: (last[0] + 0.5) * TILE, y: (last[1] + 0.5) * TILE };

    for (const p of this.level.paths) {
      for (let i = 1; i < p.length; i++) {
        let [c, r] = p[i - 1];
        const [c2, r2] = p[i];
        const dc = Math.sign(c2 - c), dr = Math.sign(r2 - r);
        while (true) {
          if (inBounds(c, r)) this.pathTiles.add(key(c, r));
          if (c === c2 && r === r2) break;
          c += dc; r += dr;
        }
      }
    }
    // Heiligtum blockiert sein Umfeld
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      if (inBounds(last[0] + dc, last[1] + dr)) this.blocked.add(key(last[0] + dc, last[1] + dr));
    }

    const rng = mulberry32(this.level.seed);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const k = key(c, r);
      if (this.pathTiles.has(k) || this.blocked.has(k)) continue;
      const v = rng();
      if (v < 0.075) {
        const kind = v < 0.04 ? 'palm' : v < 0.06 ? 'rock' : 'bush';
        this.decor.push({ c, r, kind });
        this.blocked.add(k);
      }
    }
  }

  // ---------- Speichern / Fortsetzen ----------

  snapshot(): RunSnapshot {
    return {
      v: 1,
      level: this.levelIndex,
      difficulty: this.difficulty,
      endless: this.endless,
      challenge: this.challenge !== null,
      coins: this.coins,
      lives: this.lives,
      wave: this.wave,
      kills: this.kills,
      cooldowns: { ...this.cooldowns },
      towers: this.towers.map((t) => ({ id: t.def.id, c: t.c, r: t.r, level: t.level, branch: t.branch, mode: t.mode, invested: t.invested, kills: t.kills })),
      seen: [...this.seen],
    };
  }

  /** Stellt eine Partie wieder her. Ungültige Türme (z. B. auf dem Weg) werden übersprungen. */
  static restore(s: RunSnapshot, mods: Mods): Game {
    const g = new Game(s.level, { difficulty: s.difficulty, endless: s.endless, challenge: s.challenge, mods });
    g.coins = s.coins;
    g.lives = Math.min(s.lives, g.maxLives);
    g.wave = Math.min(s.wave, g.totalWaves - 1);
    g.bonusWave = g.wave;
    g.kills = s.kills;
    g.cooldowns = { ...s.cooldowns };
    for (const id of s.seen) g.seen.add(id);
    for (const t of s.towers) {
      if (!g.canPlace(t.c, t.r)) continue;
      const tw = new Tower(TOWERS[t.id], t.c, t.r, mods);
      tw.level = t.level;
      tw.branch = t.level >= 2 ? t.branch : -1;
      tw.mode = t.mode;
      tw.invested = t.invested;
      tw.kills = t.kills;
      tw.refresh();
      g.towers.push(tw);
      g.towerMap.set(key(t.c, t.r), tw);
    }
    g.checkpoint = g.snapshot();
    return g;
  }

  /** Speicherpunkt nur, wenn keine Gegner unterwegs sind (sonst wären sie beim Fortsetzen weg) */
  private checkpointIfCalm(): void {
    if (this.state === 'playing' && this.enemies.length === 0 && this.spawningDone()) this.saveCheckpoint();
  }

  private saveCheckpoint(): void {
    this.checkpoint = this.snapshot();
    this.events.push({ type: 'checkpoint' });
  }

  // ---------- Abfragen ----------

  canPlace(c: number, r: number): boolean {
    if (!inBounds(c, r)) return false;
    const k = key(c, r);
    return !this.pathTiles.has(k) && !this.blocked.has(k) && !this.towerMap.has(k);
  }

  towerAt(c: number, r: number): Tower | undefined { return this.towerMap.get(key(c, r)); }

  /** Abklingzeit inkl. Shop-Bonus */
  abilityMax(id: AbilityId): number { return ABILITIES[id].cooldown * this.mods.cooldown; }

  abilityReady(id: AbilityId): boolean {
    if (this.challenge?.kind === 'noAbilities') return false;
    return this.state === 'playing' && this.wave > 0 && this.cooldowns[id] <= 0;
  }

  isUnlocked(id: TowerId): boolean { return TOWERS[id].unlock <= this.levelIndex && !this.isBanned(id); }

  /** Durch die Herausforderung verboten? */
  isBanned(id: TowerId): boolean { return this.challenge?.kind === 'ban' && this.challenge.tower === id; }

  /** Wie viele Türme dürfen noch gebaut werden (Herausforderung), sonst Infinity */
  towersLeft(): number {
    return this.challenge?.kind === 'maxTowers' ? Math.max(0, this.challenge.n - this.towers.length) : Infinity;
  }

  spawningDone(): boolean { return this.spawners.every((s) => s.spawned >= s.g.count); }

  canCallWave(): boolean {
    return this.state === 'playing' && this.wave < this.totalWaves && this.spawningDone();
  }

  /** Vorschau der nächsten Welle (Gegnertypen und Anzahl) */
  nextWavePreview(): { type: EnemyId; count: number }[] {
    if (this.wave >= this.totalWaves) return [];
    const w = buildWave(this.level, this.levelIndex, this.wave, this.endless);
    const m = new Map<EnemyId, number>();
    for (const g of w.groups) m.set(g.type, (m.get(g.type) ?? 0) + g.count);
    return [...m].map(([type, count]) => ({ type, count }));
  }

  stars(): number {
    if (this.lives >= this.maxLives) return 3;
    if (this.lives >= this.maxLives * 0.5) return 2;
    return 1;
  }

  // ---------- Aktionen ----------

  callWave(): void {
    if (!this.canCallWave()) return;
    if (this.countdown > 0) {
      const bonus = Math.ceil(this.countdown) * EARLY_BONUS_PER_SEC;
      this.coins += bonus;
      this.text(this.goal.x, this.goal.y - 50, `Früh-Bonus +${bonus}`, '#ffd34d', 18);
      this.sfx('coin');
    }
    this.startWave();
  }

  place(id: TowerId, c: number, r: number): boolean {
    const def = TOWERS[id];
    if (!this.isUnlocked(id) || !this.canPlace(c, r) || this.coins < def.cost) {
      this.sfx('error');
      return false;
    }
    if (this.towersLeft() <= 0) {
      this.events.push({ type: 'toast', title: 'Herausforderung', text: 'Turm-Limit erreicht. Verbessere oder verkaufe vorhandene Türme.' });
      this.sfx('error');
      return false;
    }
    const t = new Tower(def, c, r, this.mods);
    this.towers.push(t);
    this.towerMap.set(key(c, r), t);
    this.coins -= def.cost;
    this.ring(t.x, t.y, 10, 40, 'rgba(255,255,255,0.8)', 0.35, 3);
    this.dust(t.x, t.y + 14, 10);
    this.sfx('build');
    this.checkpointIfCalm();
    return true;
  }

  /** Verbessert einen Turm. Von Stufe 2 auf 3 muss ein Zweig (0 oder 1) gewählt werden. */
  upgrade(t: Tower, branch?: number): boolean {
    let cost: number | null = t.upgradeCost;
    if (t.canSpecialize) cost = branch === 0 || branch === 1 ? t.def.branches[branch].cost : null;
    if (cost === null || this.coins < cost) { this.sfx('error'); return false; }
    this.coins -= cost;
    t.invested += cost;
    t.level++;
    if (t.level === 2) t.branch = branch!;
    t.refresh();
    this.ring(t.x, t.y, 12, 50, 'rgba(255,215,90,0.9)', 0.45, 4);
    for (let i = 0; i < 14; i++) this.particle(t.x, t.y, '#ffd34d', 160, 3, 0.6, -60);
    this.sfx('upgrade');
    this.checkpointIfCalm();
    return true;
  }

  castMeteor(x: number, y: number): boolean {
    if (!this.abilityReady('meteor')) { this.sfx('error'); return false; }
    this.cooldowns.meteor = this.abilityMax('meteor');
    this.meteors.push({ x, y, t: METEOR_FALL, max: METEOR_FALL });
    this.aiming = null;
    this.sfx('meteor');
    return true;
  }

  castFlood(): boolean {
    if (!this.abilityReady('flood')) { this.sfx('error'); return false; }
    this.cooldowns.flood = this.abilityMax('flood');
    const dmg = 20 + this.wave * 5;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!e.def.flying) {
        e.dist = Math.max(0, e.dist - (e.def.boss ? 50 : 140));
        const p = e.path.at(e.dist);
        e.x = p.x; e.y = p.y; e.angle = p.angle;
        this.hurt(e, dmg, null, true);
      }
      this.applySlow(e, 0.5, 2.5);
      for (let i = 0; i < 4; i++) this.particle(e.x, e.y, '#bfe9ff', 120, 3, 0.5, 100);
    }
    this.fx.push({ k: 'flood', life: 1.1, max: 1.1 });
    this.addShake(5);
    this.sfx('flood');
    return true;
  }

  addShake(n: number): void { this.shake = Math.max(this.shake, n); }

  sell(t: Tower): void {
    this.coins += t.sellValue;
    this.towers = this.towers.filter((o) => o !== t);
    this.towerMap.delete(key(t.c, t.r));
    if (this.selected === t) this.selected = null;
    this.text(t.x, t.y - 20, `+${t.sellValue}`, '#ffd34d', 16);
    this.dust(t.x, t.y, 14);
    this.sfx('sell');
    this.checkpointIfCalm();
  }

  // ---------- Simulation ----------

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.paused || this.state !== 'playing') {
      // Effekte laufen auch bei Pause/Ende weiter aus, damit der Bildschirm nicht "einfriert"
      if (this.state !== 'playing') this.updateFx(dt);
      return;
    }
    const step = Math.min(dt, 1 / 30);
    for (let i = 0; i < this.speed; i++) {
      this.step(step);
      if (this.state !== 'playing') break;
    }
  }

  private step(dt: number): void {
    this.time += dt;
    for (const id of Object.keys(this.cooldowns) as AbilityId[]) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);

    for (const m of this.meteors) {
      m.t -= dt;
      if (m.t <= 0) this.meteorImpact(m);
    }
    this.meteors = this.meteors.filter((m) => m.t > 0);

    if (this.combo > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        if (this.combo >= 5) {
          const bonus = this.combo - 3;
          this.coins += bonus;
          this.fx.push({ k: 'txt', x: 576, y: 300, text: `Kombo ×${this.combo}!  +${bonus}`, color: '#ffe066', life: 1.4, max: 1.4, size: 30 });
          this.sfx('combo');
        }
        this.combo = 0;
      }
    }

    // Spawns
    for (const s of this.spawners) {
      s.t += dt;
      while (s.spawned < s.g.count && s.t >= s.g.delay + s.spawned * s.g.interval) {
        this.spawn(s.g.type);
        s.spawned++;
      }
    }

    // Countdown zur nächsten Welle
    if (this.wave > 0 && this.wave < this.totalWaves && this.spawningDone()) {
      if (this.countdown < 0) this.countdown = WAVE_DELAY;
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave();
    }

    for (const e of this.enemies) this.updateEnemy(e, dt);
    if (this.state !== 'playing') return;
    for (const t of this.towers) this.updateTower(t, dt);
    for (const p of this.projectiles) this.updateProjectile(p, dt);
    this.updateFx(dt);

    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    // Welle geschafft?
    if (this.wave > 0 && this.spawningDone() && this.enemies.length === 0) {
      if (this.bonusWave < this.wave) {
        this.bonusWave = this.wave;
        if (this.wave < this.totalWaves) {
          const bonus = 10 + this.wave * 3;
          this.coins += bonus;
          this.text(this.goal.x, this.goal.y - 40, `Welle geschafft! +${bonus}`, '#ffd34d', 18);
          this.sfx('coin');
          this.saveCheckpoint();
        }
      }
      if (this.wave >= this.totalWaves) {
        this.state = 'won';
        this.events.push({ type: 'won' });
        this.sfx('win');
      }
    }
  }

  private startWave(): void {
    // Stand direkt vor der neuen Welle sichern. Noch laufende Gegner der Vorwelle
    // gehen beim Fortsetzen verloren – bewusst einfach gehalten.
    this.saveCheckpoint();
    const w = buildWave(this.level, this.levelIndex, this.wave, this.endless);
    this.wave++;
    this.hpScale = w.hpScale * this.mods.hp;
    this.bossScale = w.bossScale * this.mods.hp;
    this.spawners = w.groups.map((g) => ({ g, spawned: 0, t: 0 }));
    this.countdown = -1;
    this.sfx('wave');
    for (const g of w.groups) {
      if (!this.seen.has(g.type)) {
        this.seen.add(g.type);
        const d = ENEMIES[g.type];
        if (this.wave > 1 || g.type !== 'crab') this.events.push({ type: 'toast', title: `Neu: ${d.name}`, text: d.hint });
      }
    }
  }

  private spawn(type: EnemyId): void {
    const path = this.paths[this.spawnToggle++ % this.paths.length];
    const def = ENEMIES[type];
    const e = new Enemy(this.nextId++, def, path, def.boss ? this.bossScale : this.hpScale);
    this.enemies.push(e);
    if (e.def.boss) {
      this.addShake(8);
      this.text(this.goal.x < 576 ? 800 : 350, 80, `${e.def.name} taucht auf!`, '#ff7a7a', 26);
      this.sfx('boss');
    }
  }

  private meteorImpact(m: Meteor): void {
    const dmg = 110 + this.wave * 22;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 > (METEOR_RADIUS + e.def.size * 0.5) ** 2) continue;
      this.hurt(e, dmg, null, true);
      if (e.alive) { e.burnDps = Math.max(e.burnDps, 20); e.burnT = 3; e.burnSrc = null; }
    }
    this.ring(m.x, m.y, 10, METEOR_RADIUS, 'rgba(255,120,30,0.95)', 0.5, 8);
    this.ring(m.x, m.y, 10, METEOR_RADIUS * 1.4, 'rgba(255,220,120,0.6)', 0.7, 3);
    for (let i = 0; i < 40; i++) this.particle(m.x, m.y, ['#ff5a1a', '#ffb02e', '#5a4a3a', '#ffe28a'][i % 4], 320, 5, 0.8, 260);
    this.addShake(12);
    this.sfx('boom');
  }

  private updateEnemy(e: Enemy, dt: number): void {
    if (!e.alive) return;
    e.anim += dt;
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowAmt = 0; }
    if (e.burnT > 0) {
      e.burnT -= dt;
      this.hurt(e, e.burnDps * dt, e.burnSrc, true, false);
      if (!e.alive) return;
      if (Math.random() < dt * 12) this.particle(e.x + (Math.random() - 0.5) * e.def.size, e.y - 4, Math.random() < 0.5 ? '#ff8a2a' : '#ffd34d', 30, 3, 0.5, -60);
    }
    if (e.def.shock) {
      e.shockT -= dt;
      if (e.shockT <= 0) {
        const sh = e.def.shock;
        e.shockT = sh.every;
        let hit = false;
        for (const t of this.towers) {
          if ((t.x - e.x) ** 2 + (t.y - e.y) ** 2 > sh.radius ** 2) continue;
          t.disabledT = Math.max(t.disabledT, sh.duration);
          this.fx.push({ k: 'bolt', pts: [{ x: e.x, y: e.y }, { x: t.x, y: t.y - 10 }], life: 0.3, max: 0.3 });
          hit = true;
        }
        if (hit) {
          this.ring(e.x, e.y, 10, sh.radius, 'rgba(255,240,120,0.8)', 0.4, 4);
          this.sfx('zap');
        }
      }
    }
    if (e.def.heal) {
      e.healT -= dt;
      if (e.healT <= 0) {
        e.healT = 1;
        let any = false;
        for (const o of this.enemies) {
          if (o === e || !o.alive || o.hp >= o.maxHp) continue;
          if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 95 * 95) {
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * e.def.heal);
            this.particle(o.x, o.y - 10, '#7dff9a', 40, 3, 0.6, -40);
            any = true;
          }
        }
        if (any) this.ring(e.x, e.y, 10, 95, 'rgba(125,255,154,0.6)', 0.6, 2);
      }
    }
    if (e.stunT > 0) e.stunT -= dt;
    const speed = e.stunT > 0 ? 0 : e.def.speed * (1 - e.slowAmt);
    e.dist += speed * dt;
    const p = e.path.at(e.dist);
    e.x = p.x; e.y = p.y; e.angle = p.angle;

    if (e.dist >= e.path.total) {
      e.alive = false;
      this.lives = Math.max(0, this.lives - e.def.lives);
      this.events.push({ type: 'leak' });
      this.addShake(e.def.boss ? 14 : 6);
      this.ring(e.x, e.y, 10, 60, 'rgba(255,60,60,0.9)', 0.5, 4);
      this.text(e.x, e.y - 30, `-${e.def.lives} ♥`, '#ff5a5a', 18);
      this.sfx('leak');
      if (this.lives <= 0) {
        this.state = 'lost';
        this.events.push({ type: 'lost' });
        this.sfx('lose');
      }
    }
  }

  private canHit(def: TowerDef, e: Enemy): boolean {
    return e.alive && (e.def.flying ? def.hitsAir : def.hitsGround);
  }

  private inRange(t: Tower, e: Enemy, range = t.stats.range): boolean {
    const r = range + e.def.size * 0.5;
    return (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= r * r;
  }

  private findTarget(t: Tower): Enemy | null {
    return this.findTargets(t, 1)[0] ?? null;
  }

  /** Die n besten Ziele nach Zielmodus des Turms */
  private findTargets(t: Tower, n: number): Enemy[] {
    const scored: { e: Enemy; s: number }[] = [];
    for (const e of this.enemies) {
      if (!this.canHit(t.def, e) || !this.inRange(t, e)) continue;
      let s: number;
      switch (t.mode) {
        case 'first': s = -e.remaining; break;
        case 'last': s = e.remaining; break;
        case 'strong': s = e.hp; break;
        case 'close': s = -((e.x - t.x) ** 2 + (e.y - t.y) ** 2); break;
      }
      scored.push({ e, s });
    }
    if (n === 1) {
      let best: { e: Enemy; s: number } | null = null;
      for (const x of scored) if (!best || x.s > best.s) best = x;
      return best ? [best.e] : [];
    }
    return scored.sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.e);
  }

  private updateTower(t: Tower, dt: number): void {
    t.cd -= dt;
    t.recoil = Math.max(0, t.recoil - dt * 4);
    if (t.disabledT > 0) {
      t.disabledT -= dt;
      if (Math.random() < dt * 8) this.particle(t.x + (Math.random() - 0.5) * 30, t.y - 10, '#fff3a0', 50, 2, 0.3, 0);
      return;
    }
    const target = this.findTarget(t);
    if (!target) return;
    const want = Math.atan2(target.y - t.y, target.x - t.x);
    let d = want - t.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    t.angle += d * Math.min(1, dt * 14);
    if (t.cd > 0) return;
    t.cd = 1 / t.stats.rate;
    t.recoil = 1;
    this.fire(t, target);
  }

  private fire(t: Tower, target: Enemy): void {
    const s = t.stats;
    switch (t.def.kind) {
      case 'projectile': {
        const targets = (s.multi ?? 1) > 1 ? this.findTargets(t, s.multi!) : [target];
        for (const tg of targets) {
          this.projectiles.push({ x: t.x, y: t.y - 10, tx: tg.x, ty: tg.y, target: tg, tower: t, speed: t.def.projSpeed, traveled: 0, dead: false });
        }
        this.sfx(t.def.id === 'spear' ? 'spear' : t.def.id === 'fire' ? 'fire' : 'shoot');
        break;
      }
      case 'pulse': {
        for (const e of this.enemies) {
          if (!this.canHit(t.def, e) || !this.inRange(t, e)) continue;
          this.hurt(e, s.damage, t, t.def.pierceArmor);
          this.applySlow(e, s.slow ?? 0, s.slowDur ?? 0);
          if (s.stun) this.applyStun(e, s.stun);
        }
        if (s.stun) this.addShake(2);
        this.ring(t.x, t.y, 14, s.range, 'rgba(180,230,255,0.75)', 0.5, 4);
        this.sfx('pulse');
        break;
      }
      case 'chain': {
        const hit = new Set<Enemy>();
        const pts: Pt[] = [{ x: t.x, y: t.y - 26 }];
        let cur: Enemy | null = target;
        let dmg = s.damage;
        for (let i = 0; i < (s.chain ?? 1) && cur; i++) {
          hit.add(cur);
          pts.push({ x: cur.x, y: cur.y });
          this.hurt(cur, dmg, t, t.def.pierceArmor);
          if (s.stun && cur.alive) this.applyStun(cur, s.stun);
          dmg *= 0.82;
          let next: Enemy | null = null;
          let nd = 125 * 125;
          for (const e of this.enemies) {
            if (hit.has(e) || !this.canHit(t.def, e)) continue;
            const d2 = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
            if (d2 < nd) { nd = d2; next = e; }
          }
          cur = next;
        }
        this.fx.push({ k: 'bolt', pts, life: 0.22, max: 0.22 });
        if (s.stun) this.addShake(3);
        for (const p of pts.slice(1)) this.particle(p.x, p.y, '#bfefff', 90, 2, 0.3, 0);
        this.sfx('zap');
        break;
      }
    }
  }

  private updateProjectile(p: Projectile, dt: number): void {
    if (p.target && p.target.alive) { p.tx = p.target.x; p.ty = p.target.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const stepLen = p.speed * dt;
    if (d > stepLen + 2) {
      p.x += (dx / d) * stepLen;
      p.y += (dy / d) * stepLen;
      p.traveled += stepLen;
      return;
    }
    p.dead = true;
    const t = p.tower;
    const s = t.stats;
    if (s.splash) {
      for (const e of this.enemies) {
        if (!this.canHit(t.def, e)) continue;
        if ((e.x - p.tx) ** 2 + (e.y - p.ty) ** 2 > (s.splash + e.def.size * 0.5) ** 2) continue;
        this.hurt(e, s.damage, t, t.def.pierceArmor);
        if (s.burnDps && e.alive) {
          e.burnDps = Math.max(e.burnDps * (e.burnT > 0 ? 1 : 0), s.burnDps);
          e.burnT = s.burnDur ?? 2;
          e.burnSrc = t;
        }
      }
      const fiery = t.def.id === 'fire';
      this.ring(p.tx, p.ty, 6, s.splash, fiery ? 'rgba(255,140,40,0.85)' : 'rgba(220,210,190,0.8)', 0.35, 5);
      for (let i = 0; i < 14; i++) this.particle(p.tx, p.ty, fiery ? (i % 2 ? '#ff7a1a' : '#ffd34d') : (i % 2 ? '#8c8478' : '#c9bfae'), 170, 3.5, 0.5, 120);
      if (s.splash >= 80) this.addShake(1.5);
      this.sfx('boom');
    } else if (p.target && p.target.alive) {
      this.hurt(p.target, s.damage, t, t.def.pierceArmor);
      this.particle(p.tx, p.ty, t.def.id === 'spear' ? '#f5e6c8' : '#bbbbbb', 90, 2.5, 0.25, 0);
      this.sfx('hit');
    }
  }

  private applySlow(e: Enemy, amt: number, dur: number): void {
    const a = e.def.boss ? amt * 0.5 : amt;
    if (a >= e.slowAmt) { e.slowAmt = a; e.slowT = dur; }
    else e.slowT = Math.max(e.slowT, dur * 0.5);
  }

  private applyStun(e: Enemy, dur: number): void {
    const d = e.def.boss ? dur * 0.4 : dur;
    if (d > e.stunT) {
      e.stunT = d;
      this.text(e.x, e.y - e.def.size - 14, '✦', '#fff3a0', 14);
    }
  }

  private hurt(e: Enemy, amount: number, src: Tower | null, pierce: boolean, flash = true): void {
    if (!e.alive) return;
    const dmg = pierce ? amount : Math.max(amount - e.def.armor, amount * 0.3);
    e.hp -= dmg;
    if (src) src.dealt += dmg;
    if (flash) e.hitFlash = 0.08;
    if (e.hp <= 0) this.kill(e, src);
  }

  private kill(e: Enemy, src: Tower | null): void {
    e.alive = false;
    if (e.def.split) {
      // Teilt sich: Nachkommen erben die Stärke der Welle
      const scale = e.maxHp / e.def.hp;
      for (let i = 0; i < e.def.split.count; i++) {
        const child = new Enemy(this.nextId++, ENEMIES[e.def.split.type], e.path, scale);
        child.dist = Math.max(0, e.dist + (i - (e.def.split.count - 1) / 2) * 16);
        const p = e.path.at(child.dist);
        child.x = p.x; child.y = p.y; child.angle = p.angle;
        this.enemies.push(child);
      }
      if (!this.seen.has(e.def.split.type)) {
        this.seen.add(e.def.split.type);
        const d = ENEMIES[e.def.split.type];
        this.events.push({ type: 'toast', title: `Neu: ${d.name}`, text: d.hint });
      }
    }
    this.coins += e.def.reward;
    this.kills++;
    if (src) src.kills++;
    const col = ENEMY_COLORS[e.def.id];
    const n = e.def.boss ? 50 : 10;
    for (let i = 0; i < n; i++) this.particle(e.x, e.y, col, e.def.boss ? 260 : 140, e.def.boss ? 5 : 3, 0.6, 200);
    this.text(e.x, e.y - e.def.size - 6, `+${e.def.reward}`, '#ffd34d', e.def.boss ? 22 : 14);
    this.ring(e.x, e.y, e.def.size * 0.5, e.def.size * 1.8, 'rgba(255,255,255,0.7)', 0.25, 3);
    if (e.def.boss) { this.ring(e.x, e.y, 10, 140, 'rgba(255,255,255,0.9)', 0.7, 6); this.addShake(14); }
    this.combo++;
    this.comboT = 1.0;
    this.sfx(e.def.boss ? 'boom' : 'pop');
  }

  // ---------- Effekte ----------

  private updateFx(dt: number): void {
    for (const f of this.fx) {
      f.life -= dt;
      if (f.k === 'p') {
        f.x += f.vx * dt; f.y += f.vy * dt;
        f.vy += f.g * dt;
        f.vx *= 1 - dt * 2.5;
      } else if (f.k === 'txt') {
        f.y -= 32 * dt;
      }
    }
    this.fx = this.fx.filter((f) => f.life > 0);
  }

  private sfx(name: Sfx): void { this.events.push({ type: 'sfx', name }); }

  particle(x: number, y: number, color: string, speed: number, size: number, life: number, g: number): void {
    if (this.fx.length > MAX_FX) return;
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
    const l = life * (0.6 + Math.random() * 0.6);
    this.fx.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, color, size, g });
  }

  private dust(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) this.particle(x, y, 'rgba(200,180,140,0.9)', 90, 3, 0.5, 40);
  }

  private ring(x: number, y: number, r0: number, r1: number, color: string, life: number, w: number): void {
    this.fx.push({ k: 'ring', x, y, r0, r1, life, max: life, color, w });
  }

  private text(x: number, y: number, text: string, color: string, size: number): void {
    this.fx.push({ k: 'txt', x, y, text, color, life: 1.1, max: 1.1, size });
  }
}

export const ENEMY_COLORS: Record<EnemyId, string> = {
  crab: '#e0523a',
  gecko: '#5bbf4a',
  pirate: '#c23b3b',
  gull: '#f2f2f2',
  turtle: '#4f7a3a',
  shaman: '#7b4fb0',
  kraken: '#8a3fa8',
  jelly: '#ff9ad5',
  jellyling: '#ffc2e6',
  eel: '#e6d14a',
};
