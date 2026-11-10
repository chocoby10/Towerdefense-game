import './style.css';
import { H, SPEEDS, TILE, W } from './game/config';
import { ABILITIES, ABILITY_ORDER, ENEMIES, LEVELS, TARGET_LABEL, TARGET_MODES, TOWER_ORDER, TOWERS, type AbilityId, type EnemyId, type TowerId, type TowerLevel } from './game/data';
import { Enemy, Game, Path, scaleStats, type Tower } from './game/game';
import { buildMods, DIFFICULTIES, PERKS, perkSpent, type Difficulty, type PerkId } from './game/meta';
import { buildBackground, drawEnemyIcon, drawTower, Renderer } from './game/renderer';
import { Audio } from './game/audio';
import { bestStars, clearRun, load, loadRun, save, saveRun, totalStars } from './game/storage';

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

// ======================= Vollbild =======================

const fsSupported = typeof document.documentElement.requestFullscreen === 'function';
const isStandalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
const fsButton = $<HTMLButtonElement>('#btn-fs');

async function enterFullscreen(): Promise<void> {
  if (!fsSupported) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* Browser lehnt ab (z. B. iPhone) – Spiel läuft normal weiter */
  }
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void enterFullscreen();
}

fsButton.hidden = !fsSupported || isStandalone;
fsButton.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  fsButton.textContent = document.fullscreenElement ? '✕' : '⛶';
  fsButton.setAttribute('aria-label', document.fullscreenElement ? 'Vollbild beenden' : 'Vollbild');
});

// ======================= Bildschirme =======================

function show(id: 'menu' | 'levels' | 'game'): void {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`#screen-${id}`).classList.add('active');
  if (id === 'levels') renderLevels();
  if (id === 'game') requestAnimationFrame(resize);
  if (id === 'menu') updateMenu();
}

/** Zeigt "Fortsetzen", wenn eine unterbrochene Partie gespeichert ist */
function updateMenu(): void {
  const run = loadRun();
  const btn = $<HTMLButtonElement>('#btn-resume');
  btn.hidden = !run;
  $('#btn-play').classList.toggle('btn-primary', !run);
  $('#btn-play').classList.toggle('btn-big', !run);
  if (run) {
    const mode = run.endless ? 'Endlos' : DIFFICULTIES[run.difficulty].name;
    btn.innerHTML = `Fortsetzen<small>${run.level + 1}. ${LEVELS[run.level].name} · ${mode} · vor Welle ${run.wave + 1}</small>`;
  }
}

document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });

document.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'levels') {
    // Auf Handys beim Spielstart automatisch Vollbild (braucht eine Nutzeraktion, daher hier)
    if (isTouch && !isStandalone) void enterFullscreen();
    show('levels');
  }
  else if (a === 'menu') show('menu');
  else if (a === 'howto') openHowTo();
  else if (a === 'settings') openSettings();
  else if (a === 'resume') resumeRun();
  else if (a === 'shop') openShop();
});

function starsHtml(n: number): string {
  return [0, 1, 2].map((i) => `<span class="${i < n ? 'on' : 'off'}">★</span>`).join('');
}

function renderLevels(): void {
  const grid = $('#level-grid');
  grid.innerHTML = '';
  const total = totalStars(data);
  const free = total - perkSpent(data.perks);
  $('#total-stars').innerHTML = `<span style="color:var(--gold)">★</span> ${total} / ${LEVELS.length * 9}${free > 0 ? ` <span class="free">(${free} frei)</span>` : ''}`;
  LEVELS.forEach((lv, i) => {
    const unlocked = i === 0 || bestStars(data, i - 1) > 0;
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
    const row = data.stars[i] ?? [0, 0, 0];
    const diffs = DIFFICULTIES.map((d, k) => `<span class="dstars" title="${d.name}">${d.short} ${starsHtml(row[k] ?? 0)}</span>`).join('');
    const rec = data.endless[i] ? `<span class="rec">∞ Rekord: Welle ${data.endless[i]}</span>` : '';
    info.innerHTML = `<h3>${i + 1}. ${lv.name}</h3><p>${lv.subtitle}</p><p>${lv.waves} Wellen</p><div class="diffrow">${diffs}${rec}</div>`;
    btn.appendChild(info);
    if (!unlocked) {
      const lock = document.createElement('div');
      lock.className = 'lock';
      lock.textContent = '🔒';
      btn.appendChild(lock);
    }
    btn.addEventListener('click', () => openLevelMenu(i));
    grid.appendChild(btn);
  });
}

/** Auswahl von Schwierigkeit oder Endlosmodus für eine Insel */
function openLevelMenu(i: number): void {
  const lv = LEVELS[i];
  const row = data.stars[i] ?? [0, 0, 0];
  const beaten = bestStars(data, i) > 0;
  openModal(`
    <h2>${i + 1}. ${lv.name}</h2>
    <p>${lv.subtitle}</p>
    <div class="actions">
      ${DIFFICULTIES.map((d, k) => `
        <button class="btn ${k === 1 ? 'btn-primary' : ''} diff-btn" data-diff="${k}">
          <span>${d.name}</span><span class="stars">${starsHtml(row[k] ?? 0)}</span>
        </button>`).join('')}
      <button class="btn diff-btn" id="lm-endless" ${beaten ? '' : 'disabled'}>
        <span>∞ Endlos</span><span>${beaten ? (data.endless[i] ? `Rekord: Welle ${data.endless[i]}` : 'Noch kein Rekord') : 'Erst Insel schaffen'}</span>
      </button>
      <button class="btn" id="lm-back">Zurück</button>
    </div>
    <p class="hint">Leicht: Gegner −25 % Leben, mehr Startgeld · Schwer: Gegner +30 % Leben, weniger Startgeld.<br>Sterne zählen für jede Schwierigkeit einzeln.</p>
    ${loadRun() ? '<p class="hint warn">Achtung: Deine unterbrochene Partie wird beim Start einer neuen Insel verworfen.</p>' : ''}
  `, 'level-menu');
  modalCard.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) => {
    b.onclick = () => { closeModal(); startLevel(i, { difficulty: Number(b.dataset.diff) as Difficulty, endless: false }); };
  });
  $('#lm-endless').onclick = () => { closeModal(); startLevel(i, { difficulty: 1, endless: true }); };
  $('#lm-back').onclick = closeModal;
}

function openShop(): void {
  const total = totalStars(data);
  const free = total - perkSpent(data.perks);
  const items = PERKS.map((p) => {
    const lvl = data.perks[p.id] ?? 0;
    const max = p.costs.length;
    const cost = lvl < max ? p.costs[lvl] : null;
    const pips = Array.from({ length: max }, (_, k) => `<span class="pip ${k < lvl ? 'on' : ''}"></span>`).join('');
    return `
      <div class="perk">
        <div class="perk-icon">${p.icon}</div>
        <div class="perk-info">
          <b>${p.name}</b> <span class="pips">${pips}</span>
          <div class="perk-eff">${lvl ? p.effect(lvl) : 'Noch nicht gekauft'}${cost !== null ? ` → <span class="up">${p.effect(lvl + 1)}</span>` : ''}</div>
        </div>
        <button class="btn btn-primary" data-perk="${p.id}" ${cost === null || cost > free ? 'disabled' : ''}>${cost === null ? 'Max.' : `★ ${cost}`}</button>
      </div>`;
  }).join('');
  openModal(`
    <h2>Sterne-Shop</h2>
    <p>Freie Sterne: <b class="free-stars">★ ${free}</b> von ${total}. Boni gelten dauerhaft auf allen Inseln.</p>
    <div class="perks">${items}</div>
    <div class="actions">
      <button class="btn btn-primary" id="shop-ok">Fertig</button>
      <button class="btn" id="shop-reset" ${perkSpent(data.perks) ? '' : 'disabled'}>Alle Boni zurücksetzen (Sterne zurück)</button>
    </div>
  `, 'shop');
  modalCard.querySelectorAll<HTMLButtonElement>('[data-perk]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.perk as PerkId;
      const def = PERKS.find((p) => p.id === id)!;
      const lvl = data.perks[id] ?? 0;
      if (lvl >= def.costs.length || def.costs[lvl] > totalStars(data) - perkSpent(data.perks)) return;
      data.perks[id] = lvl + 1;
      save(data);
      audio.play('upgrade');
      openShop();
    };
  });
  $('#shop-reset').onclick = () => { data.perks = {}; save(data); openShop(); };
  $('#shop-ok').onclick = () => { closeModal(); renderLevels(); };
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
      <li><b>Spezialisierung:</b> Auf Stufe 3 wählst du für jeden Turm einen von zwei Zweigen (A oder B) – z. B. Doppelschleuder oder Felsbrocken.</li>
      <li><b>Fähigkeiten</b> (unten links): ☄️ Vulkanbrocken auf eine Stelle werfen, 🌊 Flutwelle spült Gegner zurück. Danach brauchen sie eine Weile zum Aufladen.</li>
      <li><b>Kombos:</b> Besiege 5 oder mehr Gegner kurz hintereinander für Bonus-Muscheln.</li>
      <li><b>Zielwahl:</b> Jeder Turm kann den vordersten, hintersten, stärksten oder nächsten Gegner anvisieren.</li>
      <li><b>Wellen früher rufen</b> bringt Bonus-Muscheln.</li>
      <li><b>Möwen</b> fliegen – die Feuerschale trifft sie nicht.</li>
      <li><b>Panzer</b> verringert Schaden. Speer-Totem und Muschelhorn ignorieren ihn.</li>
      <li><b>Sterne:</b> 3★ ohne Lebensverlust, 2★ mit mindestens der Hälfte der Leben. Jede Schwierigkeit (Leicht/Normal/Schwer) zählt einzeln.</li>
      <li><b>Sterne-Shop:</b> Gesammelte Sterne gegen dauerhafte Boni tauschen – jederzeit zurücksetzbar.</li>
      <li><b>Endlosmodus:</b> Nach dem ersten Sieg auf einer Insel freigeschaltet. Wie viele Wellen schaffst du?</li>
    </ul>
    <p><b>Tastatur:</b> 1–5 Turm wählen · Q/E Fähigkeiten · Leertaste Welle · P Pause · F Tempo · U Verbessern · S Verkaufen · Esc Abbrechen</p>
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
      data.endless = [];
      data.perks = {};
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
    <p>${game.level.name} · ${modeLabel(game)} · Welle ${game.endless ? game.wave : `${game.wave}/${game.totalWaves}`}</p>
    <div class="actions">
      <button class="btn btn-primary btn-big" id="p-resume">Weiter</button>
      <button class="btn" id="p-restart">Neu starten</button>
      <button class="btn" id="p-settings">Einstellungen</button>
      <button class="btn" id="p-quit">Zur Inselauswahl</button>
    </div>
  `);
  $('#p-resume').onclick = resume;
  $('#p-restart').onclick = () => { closeModal(); if (game) startLevel(game.levelIndex, lastStart); };
  $('#p-settings').onclick = () => { openSettings(); $('#m-ok').onclick = () => openPause(); };
  $('#p-quit').onclick = () => { closeModal(); quitGame(); };
}

function resume(): void {
  closeModal();
  if (game) game.paused = false;
}

function modeLabel(g: Game): string {
  return g.endless ? 'Endlos' : DIFFICULTIES[g.difficulty].name;
}

function openResult(won: boolean): void {
  if (!game) return;
  const g = game;
  let html: string;
  if (g.endless) {
    // Endlosmodus endet immer mit einer Niederlage – gezählt wird die erreichte Welle
    const reached = Math.max(0, g.wave - 1);
    const prev = data.endless[g.levelIndex] ?? 0;
    const record = reached > prev;
    if (record) { data.endless[g.levelIndex] = reached; save(data); }
    html = `
      <h2>${record ? 'Neuer Rekord!' : 'Überrannt!'}</h2>
      <p class="big-num">${reached} ${reached === 1 ? 'Welle' : 'Wellen'} überstanden</p>
      <p>${record ? (prev ? `Alter Rekord: ${prev}` : 'Dein erster Rekord auf dieser Insel.') : `Rekord: ${prev}`} · ${g.kills} Gegner besiegt</p>
      <div class="actions">
        <button class="btn btn-primary btn-big" id="r-retry">Nochmal</button>
        <button class="btn" id="r-levels">Inselauswahl</button>
      </div>`;
  } else if (won) {
    const s = g.stars();
    const row = data.stars[g.levelIndex] ?? [0, 0, 0];
    const gained = Math.max(0, s - (row[g.difficulty] ?? 0));
    if (gained > 0) { row[g.difficulty] = s; data.stars[g.levelIndex] = row; save(data); }
    const hasNext = g.levelIndex + 1 < LEVELS.length;
    html = `
      <h2>Sieg!</h2>
      <div class="big-stars">${starsHtml(s)}</div>
      <p>${g.level.name} (${modeLabel(g)}) verteidigt – ${g.lives}/${g.maxLives} Leben übrig, ${g.kills} Gegner besiegt.</p>
      ${gained ? `<p><b>+${gained} ★ für den Sterne-Shop</b></p>` : ''}
      <div class="actions">
        ${hasNext ? '<button class="btn btn-primary btn-big" id="r-next">Nächste Insel</button>' : '<p><b>Du hast alle Inseln gerettet!</b></p>'}
        <button class="btn" id="r-retry">Nochmal spielen</button>
        <button class="btn" id="r-levels">Inselauswahl</button>
      </div>`;
  } else {
    html = `
      <h2>Niederlage</h2>
      <p>Das Heiligtum ist gefallen – in Welle ${g.wave} von ${g.totalWaves}.</p>
      <p>Tipp: Baue Muschelhörner an Kurven, nutze die Fähigkeiten und verbessere starke Türme, statt nur neue zu bauen.${g.difficulty > 0 ? ' Oder versuch es auf „Leicht“.' : ''}</p>
      <div class="actions">
        <button class="btn btn-primary btn-big" id="r-retry">Nochmal versuchen</button>
        <button class="btn" id="r-levels">Inselauswahl</button>
      </div>`;
  }
  openModal(html);
  const next = document.getElementById('r-next');
  if (next) next.onclick = () => { closeModal(); quitGame(); openLevelMenu(g.levelIndex + 1); };
  $('#r-retry').onclick = () => { closeModal(); startLevel(g.levelIndex, lastStart); };
  $('#r-levels').onclick = () => { closeModal(); quitGame(); };
}

// ======================= Spielstart =======================

interface StartOpts { difficulty: Difficulty; endless: boolean }
let lastStart: StartOpts = { difficulty: 1, endless: false };

function startLevel(i: number, opts: StartOpts = lastStart): void {
  lastStart = opts;
  clearRun();
  enterGame(new Game(i, { ...opts, mods: buildMods(opts.difficulty, data.perks) }));
  if (i === 0 && bestStars(data, 0) === 0) {
    toast('Willkommen, Inselwächter!', 'Wähle in der Turmleiste einen Turm und baue ihn neben den Weg. Dann starte die erste Welle.');
  } else if (opts.endless) {
    toast('Endlosmodus', 'Die Wellen hören nicht auf und werden immer stärker. Wie weit kommst du?');
  }
}

/** Setzt eine unterbrochene Partie am letzten Speicherpunkt fort */
function resumeRun(): void {
  const run = loadRun();
  if (!run) { updateMenu(); return; }
  if (isTouch && !isStandalone) void enterFullscreen();
  lastStart = { difficulty: run.difficulty, endless: run.endless };
  enterGame(Game.restore(run, buildMods(run.difficulty, data.perks)));
  toast('Partie fortgesetzt', `Weiter geht's vor Welle ${run.wave + 1}. Deine Türme stehen noch.`);
}

function enterGame(g: Game): void {
  game = g;
  renderer = new Renderer(game);
  touchPending = null;
  panel.hidden = true;
  $('#toasts').innerHTML = '';
  buildTowerBar();
  buildAbilityBar();
  show('game');
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
  game.aiming = null;
  game.selected = null;
  touchPending = null;
  if (!game.placing) game.hover = null;
  updatePanel();
}

// ======================= Turm-Panel =======================

let panelKey = '';

function statRows(s: TowerLevel, n: TowerLevel | null, kills: number | null): string {
  const row = (label: string, a: number | string, b?: number | string) =>
    `<tr><td>${label}</td><td>${a}${b !== undefined && b !== a ? ` <span class="up">→ ${b}</span>` : ''}</td></tr>`;
  const pct = (v?: number) => (v ? `${Math.round(v * 100)}%` : undefined);
  const rows = [
    row('Schaden', s.damage, n?.damage),
    row('Reichweite', s.range, n?.range),
    row('Schuss/Sek.', s.rate.toFixed(2), n?.rate.toFixed(2)),
  ];
  if (s.multi || n?.multi) rows.push(row('Ziele', s.multi ?? 1, n ? n.multi ?? 1 : undefined));
  if (s.splash || n?.splash) rows.push(row('Fläche', s.splash ?? '–', n?.splash));
  if (s.burnDps || n?.burnDps) rows.push(row('Brand/Sek.', s.burnDps ?? '–', n?.burnDps));
  if (s.slow || n?.slow) rows.push(row('Verlangsamung', pct(s.slow) ?? '–', pct(n?.slow)));
  if (s.chain || n?.chain) rows.push(row('Sprünge', s.chain ?? '–', n?.chain));
  if (s.stun || n?.stun) rows.push(row('Betäubung', s.stun ? `${s.stun}s` : '–', n?.stun ? `${n.stun}s` : undefined));
  if (kills !== null) rows.push(row('Besiegt', kills));
  return `<table>${rows.join('')}</table>`;
}

function updatePanel(): void {
  const g = game;
  const t = g?.selected;
  if (!g || !t) { panel.hidden = true; panelKey = ''; return; }
  const cost = t.upgradeCost;
  const br = t.def.branches;
  const afford = t.canSpecialize ? br.map((b) => g.coins >= b.cost).join() : String(cost !== null && g.coins >= cost);
  const k = `${t.c},${t.r},${t.level},${t.branch},${t.mode},${afford},${t.kills}`;
  if (k === panelKey && !panel.hidden) return;
  panelKey = k;
  const s = t.stats;

  let upgradeHtml: string;
  if (t.canSpecialize) {
    upgradeHtml = `<div class="spec-title">Spezialisierung wählen</div>` + br.map((b, i) => `
      <div class="spec spec-${i}">
        <div class="spec-head"><b>${i === 0 ? 'A' : 'B'} · ${b.name}</b></div>
        <div class="desc">${b.desc}</div>
        ${statRows(s, scaleStats(b.stats, t.mods), null)}
        <button class="btn btn-primary" id="tp-b${i}" ${g.coins < b.cost ? 'disabled' : ''}>Wählen ◉ ${b.cost}</button>
      </div>`).join('');
  } else if (cost !== null) {
    upgradeHtml = `${statRows(s, scaleStats(t.def.levels[t.level + 1], t.mods), t.kills)}
      <div class="row"><button class="btn btn-primary" id="tp-up" ${g.coins < cost ? 'disabled' : ''}>Verbessern ◉ ${cost}</button></div>`;
  } else {
    upgradeHtml = `${statRows(s, null, t.kills)}<div class="row"><button class="btn" disabled>Max. Stufe</button></div>`;
  }

  panel.innerHTML = `
    <button class="close" id="tp-close" aria-label="Schließen">×</button>
    <h3>${t.def.name}${t.branchName ? ` <span class="branch-tag spec-${t.branch}">${t.branchName}</span>` : ''}</h3>
    <div class="lvl">${'★'.repeat(t.level + 1)}${'☆'.repeat(2 - t.level)} Stufe ${t.level + 1}</div>
    <div class="desc">${t.branch >= 0 ? br[t.branch].desc : t.def.desc}</div>
    ${upgradeHtml}
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
  document.getElementById('tp-up')?.addEventListener('click', () => doUpgrade(t));
  document.getElementById('tp-b0')?.addEventListener('click', () => doUpgrade(t, 0));
  document.getElementById('tp-b1')?.addEventListener('click', () => doUpgrade(t, 1));
  $('#tp-sell').onclick = () => doSell(t);
  $('#tp-mode').onclick = () => {
    t.mode = TARGET_MODES[(TARGET_MODES.indexOf(t.mode) + 1) % TARGET_MODES.length];
    updatePanel();
  };
}

function doUpgrade(t: Tower, branch?: number): void {
  if (t.canSpecialize && branch === undefined) return; // Zweig muss im Panel gewählt werden
  if (game?.upgrade(t, branch)) updatePanel();
}
function doSell(t: Tower): void { game?.sell(t); updatePanel(); }

// ======================= Fähigkeiten =======================

const abilityButtons = new Map<AbilityId, HTMLButtonElement>();

function buildAbilityBar(): void {
  const bar = $('#abilities');
  bar.innerHTML = '';
  abilityButtons.clear();
  for (const id of ABILITY_ORDER) {
    const d = ABILITIES[id];
    const b = document.createElement('button');
    b.className = 'ability';
    b.title = `${d.name} (${d.key}): ${d.desc}`;
    b.innerHTML = `<span class="icon">${d.icon}</span><span class="cd"></span><span class="key">${d.key}</span>`;
    b.addEventListener('click', () => useAbility(id));
    bar.appendChild(b);
    abilityButtons.set(id, b);
  }
}

function useAbility(id: AbilityId): void {
  const g = game;
  if (!g || g.paused) return;
  if (!g.abilityReady(id)) {
    if (g.wave === 0) toast(ABILITIES[id].name, 'Fähigkeiten sind ab der ersten Welle verfügbar.');
    return;
  }
  if (id === 'flood') { g.castFlood(); return; }
  // Vulkanbrocken: Ziel auf der Karte wählen
  g.placing = null;
  g.selected = null;
  touchPending = null;
  g.aiming = g.aiming === 'meteor' ? null : 'meteor';
  if (g.aiming && isTouch) toast(ABILITIES.meteor.name, 'Tippe auf die Stelle, an der er einschlagen soll.');
  updatePanel();
}

function syncAbilities(g: Game): void {
  for (const [id, b] of abilityButtons) {
    const cd = g.cooldowns[id];
    const max = g.abilityMax(id);
    const ready = g.abilityReady(id);
    b.classList.toggle('ready', ready);
    b.classList.toggle('aiming', g.aiming === id);
    b.style.setProperty('--p', g.wave === 0 ? '1' : String(cd / max));
    const label = cd > 0 ? String(Math.ceil(cd)) : '';
    const el = b.querySelector('.cd')!;
    if (el.textContent !== label) el.textContent = label;
  }
}

// ======================= Eingabe =======================

function toGame(ev: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}

canvas.addEventListener('pointermove', (ev) => {
  if (!game || ev.pointerType === 'touch') return;
  const p = toGame(ev);
  game.hover = { c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) };
  game.hoverPt = p;
});
canvas.addEventListener('pointerleave', (ev) => {
  if (game && ev.pointerType !== 'touch') { game.hover = null; game.hoverPt = null; }
});

canvas.addEventListener('pointerdown', (ev) => {
  if (!game || game.paused) return;
  const p = toGame(ev);
  const c = Math.floor(p.x / TILE), r = Math.floor(p.y / TILE);
  const g = game;

  if (g.aiming === 'meteor') {
    g.castMeteor(p.x, p.y);
    g.hoverPt = null;
    return;
  }

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
    if (g.placing || g.selected || g.aiming) { g.placing = null; g.selected = null; g.aiming = null; g.hover = null; updatePanel(); }
    else openPause();
    return;
  }
  if (!modal.hidden) return;
  const n = Number(ev.key);
  if (n >= 1 && n <= TOWER_ORDER.length) selectPlacing(TOWER_ORDER[n - 1]);
  else if (ev.key === ' ') { ev.preventDefault(); g.callWave(); }
  else if (ev.key === 'p' || ev.key === 'P') openPause();
  else if (ev.key === 'q' || ev.key === 'Q') useAbility('meteor');
  else if (ev.key === 'e' || ev.key === 'E') useAbility('flood');
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
    const prevCoins = Number(hud.coins.textContent);
    hud.coins.textContent = String(g.coins);
    if (g.coins > prevCoins) {
      const pill = hud.coins.parentElement!;
      pill.classList.remove('bump');
      void pill.offsetWidth;
      pill.classList.add('bump');
    }
    hud.wave.textContent = g.endless ? `${g.wave} · Rekord ${Math.max(data.endless[g.levelIndex] ?? 0, g.wave - 1)}` : `${g.wave}/${g.totalWaves}`;
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
        case 'won': clearRun(); setTimeout(() => openResult(true), 900); break;
        case 'lost': clearRun(); setTimeout(() => openResult(false), 900); break;
        case 'checkpoint': if (game.checkpoint) saveRun(game.checkpoint); break;
      }
    }
    game.events.length = 0;
    if (game.selected && !game.towers.includes(game.selected)) { game.selected = null; updatePanel(); }
    renderer.draw(ctx);
    syncHud();
    syncAbilities(game);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Nur im Entwicklungsmodus: Zugriff für automatisierte Tests
if (import.meta.env.DEV) (window as unknown as { __game: () => Game | null }).__game = () => game;

// Hauptmenü-Hintergrund: die erste Insel, leicht unscharf
{
  const bg = buildBackground(new Game(0));
  const mc = $<HTMLCanvasElement>('#menu-bg');
  mc.width = bg.width / 2;
  mc.height = bg.height / 2;
  mc.getContext('2d')!.drawImage(bg, 0, 0, mc.width, mc.height);
}

// Offline-Fähigkeit: Service Worker nur im veröffentlichten Web-Build registrieren
// (nicht im Entwicklungsmodus und nicht in der Android-App, die ihre Dateien schon lokal hat)
const isNativeApp = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isNativeApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* ohne Offline-Modus weiterspielen */ });
  });
}

show('menu');
