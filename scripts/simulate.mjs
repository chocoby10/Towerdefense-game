// Balance-Test: ein einfacher Bot spielt jedes Level headless durch.
// Aufruf: npm run sim [-- leicht|normal|schwer|endless]
// "weit" = wie weit Gegner in den ersten 3 Wellen maximal kommen (Anteil des Weges) – Maß für den Anfangsdruck.
// Aufruf: npm run sim
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'sim-'));
const out = join(dir, 'game.mjs');
await build({
  stdin: { contents: "export * from './src/game/game.ts'; export * from './src/game/data.ts'; export * from './src/game/meta.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
});
const { Game, LEVELS, TOWERS, buildMods } = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

const TILE = 64, COLS = 18, ROWS = 10;

function coverage(g, c, r, range) {
  const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
  let n = 0;
  for (const k of g.pathTiles) {
    const pc = k % COLS, pr = Math.floor(k / COLS);
    if (((pc + 0.5) * TILE - x) ** 2 + ((pr + 0.5) * TILE - y) ** 2 <= range * range) n++;
  }
  return n;
}

function play(levelIndex, skill, useAbilities = true, opts = {}) {
  const g = new Game(levelIndex, { ...opts, mods: buildMods(opts.difficulty ?? 1, opts.perks ?? {}) }); let early = 0;
  const order = ['sling', 'sling', 'conch', 'spear', 'sling', 'fire', 'storm', 'spear', 'conch', 'fire', 'storm'];
  let oi = 0;
  const dt = 1 / 30;
  let t = 0;
  while (g.state === 'playing' && t < (opts.endless ? 7200 : 3600)) {
    // Bot-Entscheidungen alle 0,5 s
    if (Math.round(t * 30) % 15 === 0) {
      const want = order[oi % order.length];
      const unlocked = g.isUnlocked(want);
      const id = unlocked ? want : 'sling';
      // Upgrades bevorzugen, sobald ein paar Türme stehen
      const nextCost = (tw) => (tw.canSpecialize ? tw.def.branches[0].cost : tw.upgradeCost);
      const upg = g.towers.filter((tw) => nextCost(tw) !== null).sort((a, b) => nextCost(a) - nextCost(b))[0];
      if (g.towers.length >= 5 && upg && Math.random() < skill * 0.6 && g.coins >= nextCost(upg)) {
        g.upgrade(upg, upg.canSpecialize ? Math.floor(Math.random() * 2) : undefined);
      }
      else if (g.coins >= TOWERS[id].cost) {
        let best = null, bs = -1;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          if (!g.canPlace(c, r)) continue;
          const s = coverage(g, c, r, TOWERS[id].levels[0].range) * (skill + (1 - skill) * Math.random());
          if (s > bs) { bs = s; best = [c, r]; }
        }
        if (best && g.place(id, best[0], best[1])) oi++;
      }
      if (useAbilities && g.enemies.length) {
        if (g.abilityReady('flood') && g.enemies.some((e) => e.remaining < 250)) g.castFlood();
        if (g.abilityReady('meteor')) {
          // Meteor auf den Gegner mit den meisten Nachbarn
          let best = null, bn = -1;
          for (const e of g.enemies) {
            const n = g.enemies.filter((o) => (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 90 * 90).length;
            if (n > bn) { bn = n; best = e; }
          }
          if (best && bn >= 3) g.castMeteor(best.x, best.y);
        }
      }
      if (g.canCallWave() && (g.wave === 0 || g.countdown < 18 - 6)) g.callWave();
    }
    g.update(dt);
    if (g.wave <= 3) for (const e of g.enemies) early = Math.max(early, e.dist / e.path.total);
    g.events.length = 0;
    t += dt;
  }
  return { early: Math.round(early * 100), state: g.state, wave: g.wave, lives: g.lives, towers: g.towers.length };
}

const mode = process.argv[2] ?? 'normal';
if (mode === 'endless') {
  for (let i = 0; i < LEVELS.length; i++) {
    const res = [0.7, 1.0].map((sk) => play(i, sk, true, { endless: true }));
    console.log(`Endlos Level ${i + 1} ${LEVELS[i].name.padEnd(16)} ` + res.map((r) => `Welle ${r.wave}`).join(' | '));
  }
} else {
  const difficulty = { leicht: 0, normal: 1, schwer: 2 }[mode] ?? 1;
  for (let i = 0; i < LEVELS.length; i++) {
    const res = [0.4, 0.7, 1.0].map((s) => play(i, s, true, { difficulty }));
    console.log(`[${mode}] Level ${i + 1} ${LEVELS[i].name.padEnd(16)} ` + res.map((r, k) => `s${[0.4, 0.7, 1][k]}: weit${String(r.early).padStart(3)}% ${r.state.padEnd(4)} W${r.wave} ♥${r.lives} T${r.towers}`).join(' | '));
  }
}
