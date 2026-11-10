// Tests der Spiellogik ohne Browser: Speicherpunkte, Schutz gegen manipulierte Partien, Gewinnbarkeit.
// Aufruf: npm test
import { build } from 'esbuild';
import assert from 'node:assert/strict';

const r = await build({
  stdin: {
    contents: "export * from './src/game/game.ts'; export * from './src/game/storage.ts'; export * from './src/game/meta.ts'; export * from './src/game/data.ts';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
});
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
const { Game, cleanRun, buildMods, TOWERS } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

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

console.log('Alle Spiellogik-Tests bestanden.');
