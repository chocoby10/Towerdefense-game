// Prüft, dass kaputte oder manipulierte Spielstände sicher geladen werden.
// Aufruf: npm test
import { build } from 'esbuild';
import assert from 'node:assert/strict';

const r = await build({
  stdin: { contents: "export * from './src/game/storage.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
});
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
const { load } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

function run(name, value, check, key = 'inselwaechter.save.v2') {
  mem.clear();
  mem.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  const t0 = performance.now();
  const d = load();
  const ms = performance.now() - t0;
  assert.ok(ms < 50, `${name}: Laden dauerte ${ms} ms`);
  check(d);
  console.log('✓', name);
}

run('Riesiger Bonuswert wird begrenzt', { stars: [[3, 3, 3], [3, 3, 3], [3, 3, 3]], perks: { coins: 1e12, damage: 2 } }, (d) => {
  assert.equal(d.perks.coins, 3);
  assert.equal(d.perks.damage, 2);
});
run('Text statt Zahlen', { stars: [['<img onerror=x>', 'abc', -5]], endless: ['9e99', null, 'x'], perks: { coins: '<b>' }, settings: { sound: 'ja' } }, (d) => {
  assert.deepEqual(d.stars, [[0, 0, 0]]);
  assert.deepEqual(d.endless, [100000, 0, 0]);
  assert.deepEqual(d.perks, {});
  assert.equal(d.settings.sound, true);
});
run('Unbekannte Boni werden ignoriert', { stars: [[3, 3, 3]], perks: { hack: 5, constructor: 1 } }, (d) => {
  assert.deepEqual(Object.keys(d.perks), []);
});
run('Mehr Boni als Sterne -> zurückgesetzt', { stars: [[1, 0, 0]], perks: { coins: 3, damage: 3 } }, (d) => {
  assert.deepEqual(d.perks, {});
});
run('Sterne über 3 werden begrenzt', { stars: [[99, 4, 3]] }, (d) => assert.deepEqual(d.stars, [[3, 3, 3]]));
run('Kaputtes JSON', '{{{', (d) => assert.deepEqual(d.stars, []));
run('null', 'null', (d) => assert.deepEqual(d.perks, {}));
run('Alter Spielstand v1 wird übernommen', { stars: [3, 2], settings: { music: false } }, (d) => {
  assert.deepEqual(d.stars, [[0, 3, 0], [0, 2, 0]]);
  assert.equal(d.settings.music, false);
}, 'inselwaechter.save.v1');
console.log('Alle Speicherstand-Tests bestanden.');
