import './style.css';
import { H, SPEEDS, TILE, W } from './game/config';
import { ENEMIES, LEVELS, TARGET_LABEL, TARGET_MODES, TOWER_ORDER, TOWERS, type EnemyId, type TowerId } from './game/data';
import { Enemy, Game, Path, type Tower } from './game/game';
import { buildBackground, drawEnemyIcon, drawTower, Renderer } from './game/renderer';
import { Audio } from './game/audio';
import { load, save } from './game/storage';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const data = load();
const audio = new Audio();
audio.setSound(data.settings.sound);
audio.musicOn = data.settings.music;

const canvas = $<HTMLCanvasElement>('#cv');
const ctx = canvas.getContext('2d')!;
const stage = $('#stage');
const panel = $('#tower-panel');
const modal = $('#modal');
const modalCard = $('#modal-card');

let game: Game | null = null;
let renderer: Renderer | null = null;
let viewScale = 1;
let touchPending: { c: number; r: number } | null = null;

// ======================= Bildschirme =======================

function show(id: 'menu' | 'levels' | 'game'): void {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`#screen-${id}`).classList.add('active');
  if (id === 'levels') renderLevels();
  if (id === 'game') requestAnimationFrame(resize);
}

document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });

document.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'levels') show('levels');
  else if (a === 'menu') show('menu');
  else if (a === 'howto') openHowTo();
  else if (a === 'settings') openSettings();
});

function starsHtml(n: number): string {
  return [0, 1, 2].map((i) => `<span class="${i < n ? 'on' : 'off'}">★</span>`).join('');
}

function renderLevels(): void {
  const grid = $('#level-grid');
  grid.innerHTML = '';
  const total = data.stars.reduce((a, b) => a + (b || 0), 0);
  $('#total-stars').innerHTML = `<span style="color:var(--gold)">★</span> ${total} / ${LEVELS.length * 3}`;
  LEVELS.forEach((lv, i) => {
    const unlocked = i === 0 || (data.stars[i - 1] ?? 0) > 0;
    const btn = document.createElement('button');
    btn.className = 'level-card';
    btn.disabled = !unlocked;
    const thumb = buildBackground(new Game(i));
    const cv = document.createElement('canvas');
    cv.width = 360; cv.height = 200;
    cv.getContext('2d')!.drawImage(thumb, 0, 0, 360, 200);
    btn.appendChild(cv);
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `<h3>${i + 1}. ${lv.name}</h3><p>${lv.subtitle}</p><p>${lv.waves} Wellen</p>`;
    btn.appendChild(info);
    const st = document.createElement('div');
    st.className = 'stars';
    st.innerHTML = starsHtml(data.stars[i] ?? 0);
    btn.appendChild(st);
    if (!unlocked) {
      const lock = document.createElement('div');
      lock.className = 'lock';
      lock.textContent = '🔒';
      btn.appendChild(lock);
    }
    btn.addEventListener('click', () => startLevel(i));
    grid.appendChild(btn);
  });
}

// ======================= Modals =======================

function openModal(html: string, cls = ''): void {
  modalCard.className = `modal-card ${cls}`;
  modalCard.innerHTML = html;
  modal.hidden = false;
}
function closeModal(): void { modal.hidden = true; }

function openHowTo(): void {
  openModal(`
    <h2>Anleitung</h2>
    <p>Feinde landen auf der Insel und laufen zum Heiligtum. Halte sie auf!</p>
    <ul>
      <li><b>Turm bauen:</b> Turm unten auswählen, dann auf ein freies Feld tippen. Auf dem Handy: einmal tippen für die Vorschau, nochmal tippen zum Bauen.</li>
      <li><b>Verbessern/Verkaufen:</b> Auf einen gebauten Turm tippen.</li>
      <li><b>Zielwahl:</b> Jeder Turm kann den vordersten, hintersten, stärksten oder nächsten Gegner anvisieren.</li>
      <li><b>Wellen früher rufen</b> bringt Bonus-Muscheln.</li>
      <li><b>Möwen</b> fliegen – die Feuerschale trifft sie nicht.</li>
      <li><b>Panzer</b> verringert Schaden. Speer-Totem und Muschelhorn ignorieren ihn.</li>
      <li><b>Sterne:</b> 3★ ohne Lebensverlust, 2★ mit mindestens der Hälfte der Leben.</li>
    </ul>
    <p><b>Tastatur:</b> 1–5 Turm wählen · Leertaste Welle · P Pause · F Tempo · U Verbessern · S Verkaufen · Esc Abbrechen</p>
    <div class="actions"><button class="btn btn-primary" id="m-ok">Verstanden</button></div>
  `, 'howto');
  $('#m-ok').onclick = closeModal;
}

function openSettings(): void {
  openModal(`
    <h2>Einstellungen</h2>
    <label class="toggle">Soundeffekte <input type="checkbox" id="s-sound" ${data.settings.sound ? 'checked' : ''}></label>
    <label class="toggle">Musik <input type="checkbox" id="s-music" ${data.settings.music ? 'checked' : ''}></label>
    <div class="actions">
      <button class="btn btn-primary" id="m-ok">Fertig</button>
      <button class="btn btn-danger" id="s-reset">Fortschritt zurücksetzen</button>
    </div>
  `);
  $<HTMLInputElement>('#s-sound').onchange = (e) => {
    data.settings.sound = (e.target as HTMLInputElement).checked;
    audio.setSound(data.settings.sound);
    save(data);
  };
  $<HTMLInputElement>('#s-music').onchange = (e) => {
    data.settings.music = (e.target as HTMLInputElement).checked;
    audio.setMusic(data.settings.music);
    save(data);
  };
  $('#s-reset').onclick = () => {
    if (confirm('Wirklich den gesamten Fortschritt löschen?')) {
      data.stars = [];
      save(data);
      closeModal();
      if ($('#screen-levels').classList.contains('active')) renderLevels();
    }
  };
  $('#m-ok').onclick = closeModal;
}

function openPause(): void {
  if (!game || game.state !== 'playing') return;
  game.paused = true;
  openModal(`
    <h2>Pause</h2>
    <p>${game.level.name} · Welle ${game.wave}/${game.totalWaves}</p>
    <div class="actions">
      <button class="btn btn-primary btn-big" id="p-resume">Weiter</button>
      <button class="btn" id="p-restart">Neu starten</button>
      <button class="btn" id="p-settings">Einstellungen</button>
      <button class="btn" id="p-quit">Zur Inselauswahl</button>
    </div>
  `);
  $('#p-resume').onclick = resume;
  $('#p-restart').onclick = () => { closeModal(); if (game) startLevel(game.levelIndex); };
  $('#p-settings').onclick = () => { openSettings(); $('#m-ok').onclick = () => openPause(); };
  $('#p-quit').onclick = () => { closeModal(); quitGame(); };
}

function resume(): void {
  closeModal();
  if (game) game.paused = false;
}

function openResult(won: boolean): void {
  if (!game) return;
  const g = game;
  let html: string;
  if (won) {
    const s = g.stars();
    const prev = data.stars[g.levelIndex] ?? 0;
    if (s > prev) { data.stars[g.levelIndex] = s; save(data); }
    const hasNext = g.levelIndex + 1 < LEVELS.length;
    html = `
      <h2>Sieg!</h2>
      <div class="big-stars">${starsHtml(s)}</div>
      <p>${g.level.name} verteidigt – ${g.lives}/${g.maxLives} Leben übrig, ${g.kills} Gegner besiegt.</p>
      <div class="actions">
        ${hasNext ? '<button class="btn btn-primary btn-big" id="r-next">Nächste Insel</button>' : '<p><b>Du hast alle Inseln gerettet!</b></p>'}
        <button class="btn" id="r-retry">Nochmal spielen</button>
        <button class="btn" id="r-levels">Inselauswahl</button>
      </div>`;
  } else {
    html = `
      <h2>Niederlage</h2>
      <p>Das Heiligtum ist gefallen – in Welle ${g.wave} von ${g.totalWaves}.</p>
      <p>Tipp: Baue Muschelhörner an Kurven und verbessere starke Türme, statt nur neue zu bauen.</p>
      <div class="actions">
        <button class="btn btn-primary btn-big" id="r-retry">Nochmal versuchen</button>
        <button class="btn" id="r-levels">Inselauswahl</button>
      </div>`;
  }
  openModal(html);
  const next = document.getElementById('r-next');
  if (next) next.onclick = () => { closeModal(); startLevel(g.levelIndex + 1); };
  $('#r-retry').onclick = () => { closeModal(); startLevel(g.levelIndex); };
  $('#r-levels').onclick = () => { closeModal(); quitGame(); };
}

// ======================= Spielstart =======================

function startLevel(i: number): void {
  game = new Game(i);
  renderer = new Renderer(game);
  touchPending = null;
  panel.hidden = true;
  $('#toasts').innerHTML = '';
  buildTowerBar();
  show('game');
  if (i === 0 && !(data.stars[0] > 0)) {
    toast('Willkommen, Inselwächter!', 'Wähle in der Turmleiste einen Turm und baue ihn neben den Weg. Dann starte die erste Welle.');
  }
}

function quitGame(): void {
  game = null;
  renderer = null;
  show('levels');
}

// ======================= Turmleiste =======================

const towerButtons = new Map<TowerId, HTMLButtonElement>();

function buildTowerBar(): void {
  const bar = $('#tower-bar');
  bar.innerHTML = '';
  towerButtons.clear();
  TOWER_ORDER.forEach((id, idx) => {
    const def = TOWERS[id];
    const b = document.createElement('button');
    b.className = 'tower-btn';
    b.title = `${def.name}: ${def.desc}`;
    const cv = document.createElement('canvas');
    cv.width = 108; cv.height = 92;
    const c2 = cv.getContext('2d')!;
    c2.scale(1.5, 1.5);
    drawTower(c2, id, 0, 36, 36, -Math.PI / 4, 0);
    b.innerHTML = `<span class="key">${idx + 1}</span>`;
    b.appendChild(cv);
    const unlocked = game!.isUnlocked(id);
    b.insertAdjacentHTML('beforeend', `<span class="name">${def.name}</span><span class="cost">${unlocked ? '◉ ' + def.cost : 'Insel ' + (def.unlock + 1)}</span>`);
    if (!unlocked) b.classList.add('locked');
    b.addEventListener('click', () => selectPlacing(id));
    bar.appendChild(b);
    towerButtons.set(id, b);
  });
}

function selectPlacing(id: TowerId | null): void {
  if (!game) return;
  if (id && !game.isUnlocked(id)) {
    toast('Noch gesperrt', `${TOWERS[id].name} wird auf Insel ${TOWERS[id].unlock + 1} freigeschaltet.`);
    return;
  }
  game.placing = game.placing === id ? null : id;
  game.selected = null;
  touchPending = null;
  if (!game.placing) game.hover = null;
  updatePanel();
}

// ======================= Turm-Panel =======================

let panelKey = '';

function updatePanel(): void {
  const g = game;
  const t = g?.selected;
  if (!g || !t) { panel.hidden = true; panelKey = ''; return; }
  const cost = t.upgradeCost;
  const k = `${t.c},${t.r},${t.level},${t.mode},${cost !== null && g.coins >= cost}`;
  if (k === panelKey && !panel.hidden) return;
  panelKey = k;
  const s = t.stats;
  const n = cost !== null ? t.def.levels[t.level + 1] : null;
  const row = (label: string, a: number | string, b?: number | string) =>
    `<tr><td>${label}</td><td>${a}${b !== undefined && b !== a ? ` <span class="up">→ ${b}</span>` : ''}</td></tr>`;
  const rows = [
    row('Schaden', s.damage, n?.damage),
    row('Reichweite', s.range, n?.range),
    row('Schuss/Sek.', s.rate.toFixed(2), n?.rate.toFixed(2)),
  ];
  if (s.splash) rows.push(row('Fläche', s.splash, n?.splash));
  if (s.burnDps) rows.push(row('Brand/Sek.', s.burnDps, n?.burnDps));
  if (s.slow) rows.push(row('Verlangsamung', `${Math.round(s.slow * 100)}%`, n?.slow ? `${Math.round(n.slow * 100)}%` : undefined));
  if (s.chain) rows.push(row('Sprünge', s.chain, n?.chain));
  rows.push(row('Besiegt', t.kills));
  panel.innerHTML = `
    <button class="close" id="tp-close" aria-label="Schließen">×</button>
    <h3>${t.def.name}</h3>
    <div class="lvl">${'★'.repeat(t.level + 1)}${'☆'.repeat(2 - t.level)} Stufe ${t.level + 1}</div>
    <div class="desc">${t.def.desc}</div>
    <table>${rows.join('')}</table>
    <div class="row">
      <button class="btn btn-primary" id="tp-up" ${cost === null || g.coins < cost ? 'disabled' : ''}>${cost === null ? 'Max. Stufe' : `Verbessern ◉ ${cost}`}</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn" id="tp-mode">Ziel: ${TARGET_LABEL[t.mode]}</button>
      <button class="btn btn-danger" id="tp-sell">Verkaufen ◉ ${t.sellValue}</button>
    </div>`;
  // Panel auf die Seite legen, auf der der Turm NICHT steht
  const rect = canvas.getBoundingClientRect();
  const srect = stage.getBoundingClientRect();
  const towerScreenX = rect.left - srect.left + t.x * viewScale;
  if (towerScreenX > srect.width / 2) { panel.style.left = '12px'; panel.style.right = ''; }
  else { panel.style.right = '12px'; panel.style.left = ''; }
  panel.hidden = false;
  $('#tp-close').onclick = () => { if (game) game.selected = null; updatePanel(); };
  $('#tp-up').onclick = () => doUpgrade(t);
  $('#tp-sell').onclick = () => doSell(t);
  $('#tp-mode').onclick = () => {
    t.mode = TARGET_MODES[(TARGET_MODES.indexOf(t.mode) + 1) % TARGET_MODES.length];
    updatePanel();
  };
}

function doUpgrade(t: Tower): void { if (game?.upgrade(t)) updatePanel(); }
function doSell(t: Tower): void { game?.sell(t); updatePanel(); }

// ======================= Eingabe =======================

function toGame(ev: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}

canvas.addEventListener('pointermove', (ev) => {
  if (!game || ev.pointerType === 'touch') return;
  const p = toGame(ev);
  game.hover = { c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) };
});
canvas.addEventListener('pointerleave', (ev) => {
  if (game && ev.pointerType !== 'touch') game.hover = null;
});

canvas.addEventListener('pointerdown', (ev) => {
  if (!game || game.paused) return;
  const p = toGame(ev);
  const c = Math.floor(p.x / TILE), r = Math.floor(p.y / TILE);
  const g = game;

  if (g.placing) {
    const existing = g.towerAt(c, r);
    if (existing) { g.placing = null; g.selected = existing; g.hover = null; updatePanel(); return; }
    if (ev.pointerType === 'touch') {
      // Erstes Tippen = Vorschau, zweites Tippen auf dasselbe Feld = bauen
      if (!touchPending || touchPending.c !== c || touchPending.r !== r) {
        touchPending = { c, r };
        g.hover = { c, r };
        return;
      }
    }
    if (g.place(g.placing, c, r)) {
      touchPending = null;
      // Mit Shift (Desktop) mehrere Türme hintereinander bauen
      if (!ev.shiftKey || g.coins < TOWERS[g.placing].cost) {
        g.placing = null;
        if (ev.pointerType === 'touch') g.hover = null;
      }
    }
    return;
  }

  const t = g.towerAt(c, r);
  g.selected = t ?? null;
  updatePanel();
});

window.addEventListener('keydown', (ev) => {
  if (!game || !$('#screen-game').classList.contains('active')) return;
  const g = game;
  if (ev.key === 'Escape') {
    if (!modal.hidden) { if (g.state === 'playing') resume(); return; }
    if (g.placing || g.selected) { g.placing = null; g.selected = null; g.hover = null; updatePanel(); }
    else openPause();
    return;
  }
  if (!modal.hidden) return;
  const n = Number(ev.key);
  if (n >= 1 && n <= TOWER_ORDER.length) selectPlacing(TOWER_ORDER[n - 1]);
  else if (ev.key === ' ') { ev.preventDefault(); g.callWave(); }
  else if (ev.key === 'p' || ev.key === 'P') openPause();
  else if (ev.key === 'f' || ev.key === 'F') cycleSpeed();
  else if ((ev.key === 'u' || ev.key === 'U') && g.selected) doUpgrade(g.selected);
  else if ((ev.key === 's' || ev.key === 'S') && g.selected) doSell(g.selected);
});

$('#btn-wave').addEventListener('click', () => game?.callWave());
$('#btn-pause').addEventListener('click', openPause);
$('#btn-speed').addEventListener('click', cycleSpeed);

function cycleSpeed(): void {
  if (!game) return;
  const i = SPEEDS.indexOf(game.speed as (typeof SPEEDS)[number]);
  game.speed = SPEEDS[(i + 1) % SPEEDS.length];
}

// Beim Verlassen der App (z. B. Home-Taste auf Android) automatisch pausieren
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend();
    if (game && game.state === 'playing' && !game.paused) openPause();
  } else {
    audio.resume();
  }
});

// ======================= Größe =======================

function resize(): void {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  viewScale = Math.min((r.width - 8) / W, (r.height - 8) / H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${Math.floor(W * viewScale)}px`;
  canvas.style.height = `${Math.floor(H * viewScale)}px`;
  canvas.width = Math.floor(W * viewScale * dpr);
  canvas.height = Math.floor(H * viewScale * dpr);
  ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  panelKey = '';
}
new ResizeObserver(resize).observe(stage);

// ======================= Toasts & Effekte =======================

function toast(title: string, text: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${title}</b>${text}`;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild?.remove();
  setTimeout(() => el.remove(), 5200);
}

function flashDamage(): void {
  const f = $('#flash');
  f.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  navigator.vibrate?.(60);
}

// ======================= HUD =======================

const hud = { lives: $('#hud-lives'), coins: $('#hud-coins'), wave: $('#hud-wave'), btnWave: $<HTMLButtonElement>('#btn-wave'), speed: $('#btn-speed'), preview: $('#wave-preview') };
let lastHud = '';
let lastPreview = '';
const iconCache = new Map<EnemyId, string>();

function enemyIcon(id: EnemyId): string {
  let url = iconCache.get(id);
  if (!url) {
    const cv = document.createElement('canvas');
    cv.width = 48; cv.height = 48;
    const c = cv.getContext('2d')!;
    const e = new Enemy(0, ENEMIES[id], new Path([[0, 0], [1, 0]]), 1);
    const sc = Math.min(1, 15 / ENEMIES[id].size);
    c.translate(24, ENEMIES[id].flying ? 36 : 26);
    c.scale(sc, sc);
    e.x = 0; e.y = 0; e.angle = 0; e.anim = 0.3;
    drawEnemyIcon(c, e);
    url = cv.toDataURL();
    iconCache.set(id, url);
  }
  return url;
}

function syncHud(): void {
  const g = game;
  if (!g) return;
  const can = g.canCallWave();
  let label: string;
  if (g.wave === 0) label = 'Welle starten ▶';
  else if (g.wave >= g.totalWaves) label = 'Letzte Welle';
  else if (can && g.countdown > 0) label = `Nächste Welle ▶ ${Math.ceil(g.countdown)}s`;
  else label = 'Welle läuft…';
  const k = `${g.lives}|${g.coins}|${g.wave}|${label}|${can}|${g.speed}`;
  if (k !== lastHud) {
    lastHud = k;
    hud.lives.textContent = String(g.lives);
    hud.coins.textContent = String(g.coins);
    hud.wave.textContent = `${g.wave}/${g.totalWaves}`;
    hud.btnWave.textContent = label;
    hud.btnWave.disabled = !can;
    hud.btnWave.classList.toggle('pulse', g.wave === 0);
    hud.speed.textContent = `${g.speed}×`;
    for (const [id, b] of towerButtons) {
      b.classList.toggle('poor', g.coins < TOWERS[id].cost);
      b.classList.toggle('active', g.placing === id);
    }
    if (g.selected) updatePanel();
  }
  // Vorschau der nächsten Welle
  const pv = can ? g.nextWavePreview() : [];
  const pk = pv.map((p) => p.type + p.count).join(',');
  if (pk !== lastPreview) {
    lastPreview = pk;
    hud.preview.innerHTML = pv.length
      ? `Nächste: ${pv.map((p) => `<span class="chip" title="${ENEMIES[p.type].name}"><img src="${enemyIcon(p.type)}" width="24" height="24" alt="">${p.count}</span>`).join('')}`
      : '';
  }
  for (const [id, b] of towerButtons) b.classList.toggle('active', g.placing === id);
}

// ======================= Hauptschleife =======================

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (game && renderer) {
    game.update(dt);
    for (const ev of game.events) {
      switch (ev.type) {
        case 'sfx': audio.play(ev.name); break;
        case 'toast': toast(ev.title, ev.text); break;
        case 'leak': flashDamage(); break;
        case 'won': setTimeout(() => openResult(true), 900); break;
        case 'lost': setTimeout(() => openResult(false), 900); break;
      }
    }
    game.events.length = 0;
    if (game.selected && !game.towers.includes(game.selected)) { game.selected = null; updatePanel(); }
    renderer.draw(ctx);
    syncHud();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

show('menu');
