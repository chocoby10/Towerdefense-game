// Browser-Tests mit dem fertigen Build: Layout auf vielen Bildschirmgrößen und Offline-Betrieb.
// Voraussetzung: npm run build. Aufruf: npm run test:browser
import { chromium } from 'playwright';
import { preview } from 'vite';
import assert from 'node:assert/strict';

const server = await preview({ preview: { port: 0, strictPort: false }, logLevel: 'error' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
let failures = 0;

/** Prüft, ob Elemente wirklich sichtbar sind (nicht abgeschnitten oder verdeckt) */
async function hidden(page, selector) {
  return page.evaluate((sel) => {
    const bad = [];
    for (const el of document.querySelectorAll(sel)) {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue; // absichtlich ausgeblendet
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      for (const [x, y] of [[b.left + 3, b.top + b.height / 2], [b.right - 3, b.top + b.height / 2], [b.left + b.width / 2, b.top + b.height / 2]]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(el === hit || el.contains(hit))) { bad.push((el.textContent || el.id || el.className).trim().slice(0, 30)); break; }
      }
    }
    if (document.documentElement.scrollWidth > innerWidth) bad.push('horizontales Scrollen');
    return bad;
  }, selector);
}

const sizes = [[770, 355], [770, 280], [844, 390], [640, 360], [915, 412], [1280, 800], [1920, 1080], [390, 700], [1024, 600]];
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('inselwaechter.save.v2', JSON.stringify({ stars: [[1, 2, 0]] })));
  await page.reload();
  const problems = [];
  problems.push(...(await hidden(page, '#screen-menu .btn, #screen-menu h1')).map((p) => `Menü: ${p}`));
  await page.click('#btn-play');
  problems.push(...(await hidden(page, '.screen-head .btn, #total-stars')).map((p) => `Inselauswahl: ${p}`));
  await page.click('.level-card >> nth=0');
  problems.push(...(await hidden(page, '#modal-card .btn')).map((p) => `Inselmenü: ${p}`));
  await page.click('[data-diff="1"]');
  await page.waitForTimeout(200);
  // Turmleiste darf scrollen (kleine Bildschirme), HUD-Knöpfe müssen sichtbar sein
  problems.push(...(await hidden(page, '#hud .btn, #hud .pill')).map((p) => `HUD: ${p}`));
  const cv = await page.locator('#cv').boundingBox();
  if (!cv || cv.width < 200) problems.push('Spielfeld zu klein');
  console.log(problems.length ? '✗' : '✓', `${w}x${h}`, problems.join(' | '));
  failures += problems.length ? 1 : 0;
  await page.close();
}

// Fortsetzen: Partie anfangen, Turm bauen, zum Menü, neu laden, fortsetzen
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  await page.click('#btn-play');
  await page.click('.level-card >> nth=0');
  await page.click('[data-diff="1"]');
  await page.waitForTimeout(200);
  const box = await page.locator('#cv').boundingBox();
  const s = box.width / 1152;
  await page.keyboard.press('1');
  await page.mouse.click(box.x + 3.5 * 64 * s, box.y + 3.5 * 64 * s);
  await page.keyboard.press('p');
  await page.click('#p-quit');
  await page.goto(url);
  const label = (await page.isVisible('#btn-resume')) ? await page.textContent('#btn-resume') : '';
  await page.click('#btn-resume').catch(() => {});
  await page.waitForTimeout(200);
  const towers = await page.evaluate(() => document.querySelector('#screen-game')?.classList.contains('active'));
  const ok = label.includes('Palmenstrand') && label.includes('Welle 1') && towers;
  console.log(ok ? '✓' : '✗', 'Fortsetzen nach Neuladen', ok ? '' : `(Knopf: "${label}")`);
  if (!ok) failures++;
  await page.close();
}

// Offline: nach dem ersten Besuch muss das Spiel ohne Netz starten
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload();
  const ok = await page.isVisible('#btn-play');
  console.log(ok ? '✓' : '✗', 'Offline-Start');
  if (!ok) failures++;
  await ctx.close();
}

await browser.close();
await server.close();
assert.equal(failures, 0, `${failures} Browser-Tests fehlgeschlagen`);
console.log('Alle Browser-Tests bestanden.');
