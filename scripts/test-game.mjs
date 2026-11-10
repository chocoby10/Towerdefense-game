// Tests der Spiellogik ohne Browser: Speicherpunkte, Schutz gegen manipulierte Partien, Gewinnbarkeit.
// Aufruf: npm test
import { build } from 'esbuild';
import assert from 'node:assert/strict';

const r = await build({
  stdin: {
    contents: "export * from './src/game/game.ts'; export * from './src/game/storage.ts'; export * from './src/game/meta.ts'; export * from './src/game/data.ts'; export * from './src/game/waves.ts';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
});
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
const { Game, Enemy, cleanRun, buildMods, TOWERS, ENEMIES, LEVELS, waveHp } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

const mods = buildMods(1, {});
const test = (name, fn) => { fn(); console.log('✓', name); };

/** Einfacher Bot: baut Schleudern und Speere an Feldern mit viel Wegabdeckung, ruft Wellen */
function playBot(g, maxSeconds = 3600) {
  const dt = 1 / 30;
  let t = 0;
  const order = ['sling', 'sling', 'conch', 'spear', 'sling', 'spear'];
  let oi = 0;
  while (g.state === 'playing' && t < maxSeconds) {
    if (Math.round(t * 30) % 15 === 0) {
      const id = order[oi % order.length];
      if (g.coins >= TOWERS[id].cost) {
        let best = null, bs = -1;
        for (let rr = 0; rr < 10; rr++) for (let c = 0; c < 18; c++) {
          if (!g.canPlace(c, rr)) continue;
          let n = 0;
          for (const k of g.pathTiles) { const pc = k % 18, pr = Math.floor(k / 18); if (((pc - c) * 64) ** 2 + ((pr - rr) * 64) ** 2 <= TOWERS[id].levels[0].range ** 2) n++; }
          if (n > bs) { bs = n; best = [c, rr]; }
        }
        if (best && g.place(id, best[0], best[1])) oi++;
      } else {
        const up = g.towers.find((tw) => tw.upgradeCost !== null && g.coins >= tw.upgradeCost + 60);
        if (up) g.upgrade(up);
      }
      if (g.canCallWave() && (g.wave === 0 || g.countdown < 10)) g.callWave();
    }
    g.update(dt);
    g.events.length = 0;
    t += dt;
  }
  return g;
}

test('Insel 1 (Normal) ist für einen einfachen Bot gewinnbar', () => {
  const g = playBot(new Game(0, { difficulty: 1, mods }));
  assert.equal(g.state, 'won');
});

test('Speicherpunkt speichern und wiederherstellen', () => {
  const g = new Game(1, { difficulty: 2, mods });
  const free = [];
  for (let rr = 0; rr < 10; rr++) for (let c = 0; c < 18; c++) if (g.canPlace(c, rr)) free.push([c, rr]);
  assert.ok(g.place('sling', ...free[0]));
  assert.ok(g.place('spear', ...free[5]));
  assert.ok(g.upgrade(g.towers[0]));
  const snap = g.checkpoint;
  assert.ok(snap, 'Bauen zwischen Wellen erzeugt einen Speicherpunkt');
  const json = JSON.parse(JSON.stringify(snap));
  const clean = cleanRun(json);
  assert.deepEqual(clean, snap, 'Gültiger Stand bleibt beim Prüfen unverändert');
  const h = Game.restore(clean, mods);
  assert.equal(h.coins, g.coins);
  assert.equal(h.towers.length, 2);
  assert.equal(h.towers[0].level, 1);
  assert.equal(h.difficulty, 2);
});

test('Speicherpunkt vor jeder Welle', () => {
  const g = new Game(0, { mods });
  let placed = false;
  for (let rr = 0; rr < 10 && !placed; rr++) for (let c = 0; c < 18 && !placed; c++) if (g.canPlace(c, rr)) placed = g.place('sling', c, rr);
  g.callWave();
  assert.equal(g.checkpoint.wave, 0, 'Stand vor Welle 1');
  for (let i = 0; i < 30 * 60 && g.wave < 2; i++) { g.update(1 / 30); g.events.length = 0; if (g.canCallWave()) g.callWave(); }
  assert.ok(g.checkpoint.wave >= 1);
});

test('Manipulierte Partie wird bereinigt', () => {
  const bad = {
    v: 1, level: 0, difficulty: 7, endless: 'ja', coins: 1e99, lives: -5, wave: 1e9, kills: 'x',
    cooldowns: { meteor: -1, flood: 1e9 },
    towers: [
      { id: 'sling', c: 3, r: 3, level: 99, branch: 5, mode: 'hack', invested: 1e99 },
      { id: 'sling', c: 3, r: 3 },               // doppelt
      { id: 'laser', c: 1, r: 1 },               // gibt es nicht
      { id: '__proto__', c: 2, r: 2 },
      { id: 'constructor', c: 4, r: 4 },
      null, 'text',
    ],
    seen: ['crab', 'drache', 42, '__proto__', 'toString'],
  };
  const c = cleanRun(bad);
  assert.equal(c.difficulty, 2);
  assert.equal(c.endless, false);
  assert.equal(c.coins, 10_000_000);
  assert.equal(c.lives, 1);
  assert.equal(c.wave, 10);
  assert.equal(c.towers.length, 1);
  assert.equal(c.towers[0].level, 2);
  assert.equal(c.towers[0].branch, 1);
  assert.equal(c.towers[0].mode, 'first');
  assert.deepEqual(c.seen, ['crab']);
  const g = Game.restore(c, mods);
  assert.ok(g.wave < g.totalWaves, 'Welle bleibt im gültigen Bereich');
  assert.equal(cleanRun({ v: 1, level: 99 }), null, 'Unbekannte Insel wird verworfen');
  assert.equal(cleanRun('kaputt'), null);
});

test('Türme auf dem Weg werden beim Fortsetzen übersprungen', () => {
  const g = new Game(0, { mods });
  const k = [...g.pathTiles][3];
  const snap = cleanRun({ v: 1, level: 0, difficulty: 1, wave: 0, coins: 100, lives: 20, towers: [{ id: 'sling', c: k % 18, r: Math.floor(k / 18) }] });
  assert.equal(Game.restore(snap, mods).towers.length, 0);
});

const freeTiles = (g) => { const f = []; for (let rr = 0; rr < 10; rr++) for (let c = 0; c < 18; c++) if (g.canPlace(c, rr)) f.push([c, rr]); return f; };

test('Qualle teilt sich beim Tod in zwei Quällchen', () => {
  const g = new Game(5, { mods });
  const e = new Enemy(1, ENEMIES.jelly, g.paths[0], 1);
  e.dist = 300;
  g.enemies.push(e);
  g.hurt(e, 1e6, null, true);
  const kids = g.enemies.filter((x) => x.alive && x.def.id === 'jellyling');
  assert.equal(kids.length, 2);
  assert.ok(kids.every((k) => Math.abs(k.dist - 300) <= 16));
});

test('Zitteraal legt Türme in der Nähe lahm, entfernte nicht', () => {
  const g = new Game(6, { mods });
  g.coins = 9999;
  const f = freeTiles(g);
  const e = new Enemy(1, ENEMIES.eel, g.paths[0], 1);
  e.dist = 200;
  const p = g.paths[0].at(200); e.x = p.x; e.y = p.y;
  e.shockT = 0.01;
  // nächster und weitester freier Platz zum Aal
  const d2 = ([c, r]) => ((c + 0.5) * 64 - e.x) ** 2 + ((r + 0.5) * 64 - e.y) ** 2;
  f.sort((a, b) => d2(a) - d2(b));
  g.place('sling', ...f[0]);
  g.place('sling', ...f[f.length - 1]);
  g.enemies.push(e);
  g.wave = 1;
  g.update(1 / 30);
  const near = g.towerAt(...f[0]), far = g.towerAt(...f[f.length - 1]);
  assert.ok(near.disabledT > 0, 'naher Turm lahmgelegt');
  assert.equal(far.disabledT, 0, 'ferner Turm unberührt');
});

test('Herausforderung: Turm-Limit wird eingehalten', () => {
  const g = new Game(0, { mods, challenge: true });
  assert.equal(LEVELS[0].challenge.kind, 'maxTowers');
  g.coins = 99999;
  const f = freeTiles(g);
  let n = 0;
  for (const t of f) if (g.place('sling', ...t)) n++;
  assert.equal(n, LEVELS[0].challenge.n);
});

test('Herausforderung: verbotener Turm und keine Fähigkeiten', () => {
  const g = new Game(1, { mods, challenge: true });
  assert.equal(g.isUnlocked(LEVELS[1].challenge.tower), false);
  g.coins = 9999;
  assert.equal(g.place(LEVELS[1].challenge.tower, ...freeTiles(g)[0]), false);
  const h = new Game(2, { mods, challenge: true });
  h.wave = 1;
  assert.equal(h.abilityReady('meteor'), false);
  assert.equal(new Game(2, { mods }).abilityReady('meteor'), false, 'vor Welle 1 ohnehin nicht');
});

test('Herausforderung im Spielstand nur auf Normal gültig', () => {
  assert.equal(cleanRun({ v: 1, level: 0, difficulty: 0, challenge: true }).challenge, false);
  assert.equal(cleanRun({ v: 1, level: 0, difficulty: 1, endless: true, challenge: true }).challenge, false);
  assert.equal(cleanRun({ v: 1, level: 0, difficulty: 1, challenge: true }).challenge, true);
});

test('Wellen werden auf jeder Insel stetig stärker (keine Ausreißer)', () => {
  for (let L = 0; L < LEVELS.length; L++) {
    const hp = Array.from({ length: LEVELS[L].waves }, (_, i) => waveHp(L, i));
    for (let i = 1; i < hp.length; i++) {
      assert.ok(hp[i] > hp[i - 1], `Insel ${L + 1}: Welle ${i + 1} (${Math.round(hp[i])}) ist nicht stärker als Welle ${i} (${Math.round(hp[i - 1])})`);
      assert.ok(hp[i] < hp[i - 1] * 2.2, `Insel ${L + 1}: Sprung von Welle ${i} auf ${i + 1} ist zu groß`);
    }
  }
});

console.log('Alle Spiellogik-Tests bestanden.');
