// Wellen-Bericht: spielt Inseln auf Normal mit einem Bot und zeigt pro Welle Gegner-HP,
// Turm-Schaden, Geld und wie weit Gegner kommen. Aufruf: npm run sim:waves -- 0 3  (Insel-Indizes)
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = mkdtempSync(join(tmpdir(), 'w-')); const out = join(dir, 'g.mjs');
await build({ stdin: { contents: "export * from './src/game/game.ts'; export * from './src/game/data.ts'; export * from './src/game/meta.ts'; export * from './src/game/waves.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { Game, LEVELS, TOWERS, ENEMIES, buildMods, buildWave } = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

function coverage(g, c, r, range) { let n = 0; for (const k of g.pathTiles) { const pc = k % 18, pr = Math.floor(k / 18); if (((pc - c) * 64) ** 2 + ((pr - r) * 64) ** 2 <= range * range) n++; } return n; }

function run(level, seed) {
  let rs = seed; Math.random = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const g = new Game(level, { difficulty: 1, mods: buildMods(1, {}) });
  const order = ['sling', 'sling', 'conch', 'spear', 'sling', 'fire', 'storm', 'spear', 'conch', 'fire', 'storm'];
  let oi = 0, t = 0; const rows = []; let cur = null;
  while (g.state === 'playing' && t < 3600) {
    if (Math.round(t * 30) % 15 === 0) {
      const id = g.isUnlocked(order[oi % order.length]) ? order[oi % order.length] : 'sling';
      const nc = (tw) => (tw.canSpecialize ? tw.def.branches[0].cost : tw.upgradeCost);
      const upg = g.towers.filter((tw) => nc(tw) !== null).sort((a, b) => nc(a) - nc(b))[0];
      if (g.towers.length >= 5 && upg && Math.random() < 0.45 && g.coins >= nc(upg)) g.upgrade(upg, upg.canSpecialize ? 0 : undefined);
      else if (g.coins >= TOWERS[id].cost) {
        let best = null, bs = -1;
        for (let r = 0; r < 10; r++) for (let c = 0; c < 18; c++) { if (!g.canPlace(c, r)) continue; const s = coverage(g, c, r, TOWERS[id].levels[0].range) * (0.7 + 0.3 * Math.random()); if (s > bs) { bs = s; best = [c, r]; } }
        if (best && g.place(id, best[0], best[1])) oi++;
      }
      if (g.enemies.length && g.abilityReady('flood') && g.enemies.some((e) => e.remaining < 250)) g.castFlood();
      if (g.enemies.length && g.abilityReady('meteor')) { let b = null, bn = -1; for (const e of g.enemies) { const n = g.enemies.filter((o) => (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 8100).length; if (n > bn) { bn = n; b = e; } } if (b && bn >= 3) g.castMeteor(b.x, b.y); }
      if (g.canCallWave() && (g.wave === 0 || g.countdown < 12)) {
        // Wellenstärke: Summe der Gegner-HP der kommenden Welle
        const w = buildWave(g.level, g.levelIndex, g.wave);
        let hp = 0; for (const gr of w.groups) hp += ENEMIES[gr.type].hp * (ENEMIES[gr.type].boss ? w.bossScale : w.hpScale) * gr.count;
        const dps = g.towers.reduce((a, tw) => a + tw.stats.damage * tw.stats.rate * (tw.stats.multi ?? 1), 0);
        cur = { wave: g.wave + 1, hp: Math.round(hp), dps: Math.round(dps), coins: g.coins, towers: g.towers.length, lives0: g.lives, far: 0, types: [...new Set(w.groups.map((x) => x.type))].join(',') };
        rows.push(cur);
        g.callWave();
      }
    }
    g.update(1 / 30); g.events.length = 0; t += 1 / 30;
    if (cur) for (const e of g.enemies) cur.far = Math.max(cur.far, e.dist / e.path.total);
  }
  for (const r of rows) r.lost = 0;
  rows.forEach((r, i) => { r.lost = r.lives0 - (rows[i + 1]?.lives0 ?? g.lives); });
  return { rows, state: g.state, lives: g.lives };
}

for (const level of process.argv.slice(2).map(Number)) {
  const res = run(level, 12345);
  console.log(`\n=== Insel ${level + 1} ${LEVELS[level].name} (Normal): ${res.state}, ${res.lives} Leben übrig`);
  console.log('Welle  Gegner-HP  Turm-DPS  HP/DPS  Geld  Türme  weitester Gegner  Leben weg  Typen');
  for (const r of res.rows) console.log(`${String(r.wave).padStart(4)}  ${String(r.hp).padStart(9)}  ${String(r.dps).padStart(8)}  ${(r.hp / Math.max(1, r.dps)).toFixed(1).padStart(6)}  ${String(r.coins).padStart(4)}  ${String(r.towers).padStart(5)}  ${String(Math.round(r.far * 100)).padStart(15)}%  ${String(r.lost).padStart(9)}  ${r.types}`);
}
