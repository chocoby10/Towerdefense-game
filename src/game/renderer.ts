import { COLS, H, ROWS, TILE, W } from './config';
import { TOWERS, type TowerId } from './data';
import { Enemy, Game, inBounds, key, METEOR_RADIUS, mulberry32, type Decor } from './game';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ======================= Türme =======================

// Verläufe der Turmsockel werden einmal pro Zeichenfläche erzeugt und wiederverwendet
// (sie liegen im lokalen Koordinatensystem des Turms, daher für alle Türme gleich).
const gradCache = new WeakMap<Ctx, { shadow: CanvasGradient; side: CanvasGradient; top: CanvasGradient; topGold: CanvasGradient }>();
function baseGradients(ctx: Ctx) {
  let g = gradCache.get(ctx);
  if (!g) {
    const shadow = ctx.createRadialGradient(4, 11, 4, 4, 11, 30);
    shadow.addColorStop(0, 'rgba(10,25,15,0.35)');
    shadow.addColorStop(1, 'rgba(10,25,15,0)');
    const side = ctx.createLinearGradient(0, -4, 0, 22);
    side.addColorStop(0, '#7d786d');
    side.addColorStop(1, '#4f4b44');
    const top = ctx.createRadialGradient(-8, -4, 2, 0, 2, 26);
    top.addColorStop(0, '#cdc8bb');
    top.addColorStop(1, '#8f8a7f');
    const topGold = ctx.createRadialGradient(-8, -4, 2, 0, 2, 26);
    topGold.addColorStop(0, '#e3d3a0');
    topGold.addColorStop(1, '#a8956a');
    g = { shadow, side, top, topGold };
    gradCache.set(ctx, g);
  }
  return g;
}

export function drawTower(ctx: Ctx, id: TowerId, lvl: number, x: number, y: number, angle: number, t: number, recoil = 0, branch = -1): void {
  ctx.save();
  ctx.translate(x, y);

  // weicher Schatten + schattierter Steinsockel
  const gr = baseGradients(ctx);
  ctx.fillStyle = gr.shadow;
  ellipse(ctx, 4, 11, 31, 16);
  ctx.fill();
  ctx.fillStyle = gr.side;
  ellipse(ctx, 0, 6, 26, 17);
  ctx.fill();
  ctx.fillStyle = lvl >= 2 ? gr.topGold : gr.top;
  ellipse(ctx, 0, 2, 24, 15);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 2, 23, 14, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();

  switch (id) {
    case 'sling': {
      ctx.fillStyle = '#7a4a24';
      roundRect(ctx, -5, -14, 10, 18, 3);
      ctx.fill();
      ctx.save();
      ctx.translate(0, -10);
      ctx.rotate(angle);
      const pull = recoil * 6;
      ctx.strokeStyle = '#5a3418';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(18 - pull, 0);
      ctx.stroke();
      ctx.strokeStyle = '#3d2410';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(18 - pull, -9);
      ctx.lineTo(24 - pull, 0);
      ctx.lineTo(18 - pull, 9);
      ctx.stroke();
      if (recoil < 0.5) {
        ctx.fillStyle = '#8c8c8c';
        circle(ctx, 22 - pull, 0, 5);
        ctx.fill();
      }
      ctx.restore();
      if (lvl >= 1) { ctx.fillStyle = '#d23b2b'; ctx.fillRect(-5, -6, 10, 3); }
      if (lvl >= 2) { ctx.fillStyle = '#ffd34d'; ctx.fillRect(-5, -1, 10, 3); }
      break;
    }
    case 'spear': {
      const h = 34 + lvl * 6;
      const cols = ['#9b5a2c', '#b5723b', '#8a4a20'];
      for (let i = 0; i < 3; i++) {
        const sy = -h + i * (h / 3);
        ctx.fillStyle = cols[i];
        roundRect(ctx, -10, sy, 20, h / 3 + 1, 3);
        ctx.fill();
        ctx.fillStyle = '#2a1608';
        ctx.fillRect(-6, sy + 4, 4, 3);
        ctx.fillRect(2, sy + 4, 4, 3);
        ctx.fillStyle = i === 0 ? '#e14b2c' : '#f2c14e';
        ctx.fillRect(-5, sy + h / 3 - 6, 10, 2);
      }
      // Flügel oben
      ctx.fillStyle = lvl >= 2 ? '#ffd34d' : '#3fa0c8';
      ctx.beginPath();
      ctx.moveTo(-10, -h + 4); ctx.lineTo(-22, -h - 2); ctx.lineTo(-10, -h + 12);
      ctx.moveTo(10, -h + 4); ctx.lineTo(22, -h - 2); ctx.lineTo(10, -h + 12);
      ctx.fill();
      // Speer
      ctx.save();
      ctx.translate(0, -h / 2);
      ctx.rotate(angle);
      if (recoil < 0.6) {
        ctx.strokeStyle = '#d9c39a';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(16, 0); ctx.stroke();
        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath(); ctx.moveTo(16, -4); ctx.lineTo(26, 0); ctx.lineTo(16, 4); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'fire': {
      const s = 1 + lvl * 0.12;
      ctx.fillStyle = '#4a4540';
      ctx.beginPath();
      ctx.ellipse(0, -6, 18 * s, 10 * s, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#5c564f';
      ellipse(ctx, 0, -6, 18 * s, 6 * s);
      ctx.fill();
      ctx.fillStyle = '#3a1a08';
      ellipse(ctx, 0, -6, 14 * s, 4 * s);
      ctx.fill();
      for (let i = 0; i < 3 + lvl; i++) {
        const fx = (i - (2 + lvl) / 2) * 7;
        const fh = (14 + Math.sin(t * 9 + i * 1.7) * 5 + lvl * 4) * (1 + recoil * 0.4);
        flame(ctx, fx, -6, 6, fh, i % 2 ? '#ff7a1a' : '#ffb02e');
      }
      flame(ctx, 0, -6, 4, 10 + Math.sin(t * 11) * 3, '#fff2a8');
      break;
    }
    case 'conch': {
      const pulse = 1 + recoil * 0.15;
      ctx.save();
      ctx.translate(0, -8);
      ctx.rotate(angle + Math.PI);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = lvl >= 2 ? '#ffc9a8' : '#f2b8a2';
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.quadraticCurveTo(-4, -18, 16, -6);
      ctx.lineTo(20, 0);
      ctx.lineTo(16, 6);
      ctx.quadraticCurveTo(-4, 18, -18, 0);
      ctx.fill();
      ctx.strokeStyle = '#c07b65';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let a = 0; a < TAU * 1.6; a += 0.2) {
        const rr = 2 + a * 1.6;
        const px = -4 + Math.cos(a) * rr, py = Math.sin(a) * rr * 0.6;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = '#fff4ec';
      ellipse(ctx, 16, 0, 3, 5);
      ctx.fill();
      ctx.restore();
      if (lvl >= 1) {
        ctx.strokeStyle = 'rgba(180,230,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -8, 22 + Math.sin(t * 4) * 2, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'storm': {
      const h = 30 + lvl * 6;
      const glow = 0.35 + Math.sin(t * 5) * 0.15 + recoil * 0.4;
      const g = ctx.createRadialGradient(0, -h / 2, 2, 0, -h / 2, 34);
      g.addColorStop(0, `rgba(140,220,255,${glow})`);
      g.addColorStop(1, 'rgba(140,220,255,0)');
      ctx.fillStyle = g;
      circle(ctx, 0, -h / 2, 34);
      ctx.fill();
      ctx.fillStyle = '#3b6f9a';
      ctx.beginPath();
      ctx.moveTo(0, -h - 6); ctx.lineTo(11, -h / 2); ctx.lineTo(7, 2); ctx.lineTo(-7, 2); ctx.lineTo(-11, -h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7fd4ff';
      ctx.beginPath();
      ctx.moveTo(0, -h - 6); ctx.lineTo(11, -h / 2); ctx.lineTo(0, -h / 2 + 6); ctx.lineTo(-4, -h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(230,250,255,${0.5 + recoil * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sx = Math.sin(t * 13) * 6;
      ctx.moveTo(sx, -h - 8); ctx.lineTo(sx + 4, -h - 14); ctx.lineTo(sx - 2, -h - 18);
      ctx.stroke();
      break;
    }
  }

  // Stufen-Abzeichen
  for (let i = 0; i <= lvl; i++) {
    ctx.fillStyle = '#ffd34d';
    ctx.strokeStyle = '#7a5a10';
    ctx.lineWidth = 1.5;
    star(ctx, -9 + i * 9, 15, 4);
    ctx.fill();
    ctx.stroke();
  }
  // Spezialisierung: farbiges Wimpel-Abzeichen (A = blau, B = rot)
  if (branch >= 0) {
    const col = branch === 0 ? '#3fa9f5' : '#e8553a';
    ctx.strokeStyle = '#4a3420';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(19, 12); ctx.lineTo(19, -12); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(19, -12); ctx.lineTo(31, -8 + Math.sin(t * 6) * 1.5); ctx.lineTo(19, -3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(branch === 0 ? 'A' : 'B', 23.5, -5.5);
  }
  ctx.restore();
}

// ======================= Gegner =======================

function drawEnemy(ctx: Ctx, e: Enemy): void {
  const s = e.def.size;
  const a = e.anim;
  ctx.save();
  ctx.translate(e.x, e.y);

  if (e.def.flying) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ellipse(ctx, 6, 14, s * 0.9, s * 0.4);
    ctx.fill();
    ctx.translate(0, -16 + Math.sin(a * 3) * 2);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ellipse(ctx, 2, s * 0.55, s * 1.05, s * 0.45);
    ctx.fill();
  }

  switch (e.def.id) {
    case 'crab': {
      const wig = Math.sin(a * 14) * 3;
      ctx.strokeStyle = '#a8321f';
      ctx.lineWidth = 2.5;
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(side * s * 0.6, -2 + i * 5);
        ctx.lineTo(side * (s + 5), 2 + i * 5 + (i % 2 ? wig : -wig));
        ctx.stroke();
      }
      ctx.fillStyle = '#e0523a';
      ellipse(ctx, 0, 0, s, s * 0.7);
      ctx.fill();
      ctx.fillStyle = '#f07a5e';
      ellipse(ctx, -2, -3, s * 0.6, s * 0.35);
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#e0523a';
        circle(ctx, side * (s * 0.9), -s * 0.75 + wig * 0.3, 5);
        ctx.fill();
        ctx.fillStyle = '#fff';
        circle(ctx, side * 4, -s * 0.7, 3);
        ctx.fill();
        ctx.fillStyle = '#111';
        circle(ctx, side * 4, -s * 0.72, 1.5);
        ctx.fill();
      }
      break;
    }
    case 'gecko': {
      ctx.rotate(e.angle);
      const wig = Math.sin(a * 20) * 0.5;
      ctx.strokeStyle = '#3f9a32';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, 0);
      ctx.quadraticCurveTo(-s * 1.6, wig * 10, -s * 2.2, -wig * 8);
      ctx.stroke();
      ctx.lineWidth = 3;
      for (const side of [-1, 1]) for (const fx of [-4, 5]) {
        ctx.beginPath();
        ctx.moveTo(fx, 0);
        ctx.lineTo(fx + side * wig * 6, side * (s * 0.9));
        ctx.stroke();
      }
      ctx.fillStyle = '#5bbf4a';
      ellipse(ctx, 0, 0, s, s * 0.5);
      ctx.fill();
      circle(ctx, s * 0.95, 0, s * 0.45);
      ctx.fill();
      ctx.fillStyle = '#f5d33a';
      circle(ctx, -2, 0, 2); ctx.fill();
      circle(ctx, 4, 0, 1.6); ctx.fill();
      ctx.fillStyle = '#111';
      circle(ctx, s * 1.1, -3, 1.6); ctx.fill();
      circle(ctx, s * 1.1, 3, 1.6); ctx.fill();
      break;
    }
    case 'pirate': {
      const bob = Math.abs(Math.sin(a * 7)) * 2;
      ctx.translate(0, -bob);
      ctx.fillStyle = '#3b2a1a';
      ctx.fillRect(-7, s * 0.5, 5, 6 + bob);
      ctx.fillRect(2, s * 0.5, 5, 6 + bob);
      ctx.fillStyle = '#fff';
      roundRect(ctx, -s * 0.75, -4, s * 1.5, s * 0.95, 5);
      ctx.fill();
      ctx.fillStyle = '#c23b3b';
      for (let i = 0; i < 3; i++) ctx.fillRect(-s * 0.75, -2 + i * 5, s * 1.5, 2.5);
      ctx.fillStyle = '#e8b98d';
      circle(ctx, 0, -9, 8);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(-6, -11, 12, 2);
      circle(ctx, 3, -10, 2.4); ctx.fill();
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath();
      ctx.moveTo(-13, -13); ctx.quadraticCurveTo(0, -28, 13, -13); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      circle(ctx, 0, -18, 2); ctx.fill();
      ctx.strokeStyle = '#ccd';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s * 0.8, 0); ctx.lineTo(s * 1.5, -12); ctx.stroke();
      break;
    }
    case 'gull': {
      ctx.rotate(e.angle);
      const flap = Math.sin(a * 10);
      ctx.fillStyle = '#d9dde3';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.quadraticCurveTo(-6, side * (s + 8 * flap), -10, side * (s * 1.6 + 6 * flap));
        ctx.quadraticCurveTo(4, side * (s * 0.9), 6, 0);
        ctx.fill();
      }
      ctx.fillStyle = '#f7f7f7';
      ellipse(ctx, 0, 0, s, s * 0.45);
      ctx.fill();
      ctx.fillStyle = '#9aa0a8';
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s - 7, -4); ctx.lineTo(-s - 7, 4); ctx.fill();
      ctx.fillStyle = '#f5a623';
      ctx.beginPath(); ctx.moveTo(s, -2); ctx.lineTo(s + 7, 0); ctx.lineTo(s, 2); ctx.fill();
      ctx.fillStyle = '#111';
      circle(ctx, s * 0.6, -2.5, 1.4); ctx.fill();
      break;
    }
    case 'turtle': {
      ctx.rotate(e.angle);
      const step = Math.sin(a * 6) * 3;
      ctx.fillStyle = '#8fae5a';
      for (const [lx, ly, ph] of [[8, -1, 1], [8, 1, -1], [-8, -1, -1], [-8, 1, 1]] as const) {
        circle(ctx, lx + step * ph, ly * s * 0.75, 5);
        ctx.fill();
      }
      circle(ctx, s * 0.95 + Math.abs(step) * 0.3, 0, 6);
      ctx.fill();
      ctx.fillStyle = '#4f7a3a';
      circle(ctx, 0, 0, s * 0.8);
      ctx.fill();
      ctx.strokeStyle = '#2f4f22';
      ctx.lineWidth = 2;
      hex(ctx, 0, 0, s * 0.35);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * s * 0.35, Math.sin(ang) * s * 0.35);
        ctx.lineTo(Math.cos(ang) * s * 0.78, Math.sin(ang) * s * 0.78);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ellipse(ctx, -4, -5, s * 0.4, s * 0.25);
      ctx.fill();
      break;
    }
    case 'shaman': {
      const bob = Math.sin(a * 4) * 1.5;
      const aura = 0.25 + Math.sin(a * 3) * 0.1;
      ctx.strokeStyle = `rgba(125,255,154,${aura})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, s + 8, 0, TAU); ctx.stroke();
      ctx.translate(0, bob);
      ctx.fillStyle = '#2d7f7a';
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, s * 0.7); ctx.lineTo(0, -s * 0.6); ctx.lineTo(s * 0.8, s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7b4fb0';
      roundRect(ctx, -8, -20, 16, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(-6, -16, 4, 3);
      ctx.fillRect(2, -16, 4, 3);
      ctx.fillStyle = '#e14b2c';
      ctx.fillRect(-6, -9, 12, 2);
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s * 0.9, s * 0.7); ctx.lineTo(s * 0.9, -s * 1.3); ctx.stroke();
      ctx.fillStyle = '#7dff9a';
      circle(ctx, s * 0.9, -s * 1.4, 4 + Math.sin(a * 6));
      ctx.fill();
      break;
    }
    case 'kraken': {
      const bob = Math.sin(a * 2) * 3;
      ctx.strokeStyle = '#6b2d85';
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU + 0.2;
        ctx.lineWidth = 8 - (i % 2) * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * s * 0.5, Math.sin(ang) * s * 0.4 + 6);
        const w = Math.sin(a * 3 + i) * 10;
        ctx.quadraticCurveTo(
          Math.cos(ang) * s * 1.1 + w, Math.sin(ang) * s * 0.9 + 10,
          Math.cos(ang + 0.4) * s * 1.45, Math.sin(ang + 0.4) * s * 1.1 + 12,
        );
        ctx.stroke();
      }
      ctx.translate(0, bob);
      const g = ctx.createRadialGradient(-8, -14, 4, 0, -4, s);
      g.addColorStop(0, '#c77ee0');
      g.addColorStop(1, '#6b2d85');
      ctx.fillStyle = g;
      ellipse(ctx, 0, -6, s * 0.85, s);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (const [sx, sy, sr] of [[-10, -20, 4], [8, -26, 3], [12, -10, 3]] as const) { circle(ctx, sx, sy, sr); ctx.fill(); }
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#ffe14d';
        circle(ctx, side * 10, 2, 7); ctx.fill();
        ctx.fillStyle = '#111';
        ellipse(ctx, side * 10, 2, 2.2, 5); ctx.fill();
      }
      break;
    }
  }

  if (e.hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.6, e.hitFlash * 8);
    ctx.fillStyle = '#fff';
    circle(ctx, 0, 0, s);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (e.stunT > 0) {
    ctx.fillStyle = '#fff3a0';
    for (let i = 0; i < 3; i++) {
      const a = e.anim * 6 + (i / 3) * TAU;
      star(ctx, Math.cos(a) * s * 0.8, -s - 6 + Math.sin(a) * 3, 3.5);
      ctx.fill();
    }
  }
  if (e.slowAmt > 0) {
    ctx.strokeStyle = 'rgba(150,215,255,0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(0, 0, s + 3, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // Lebensbalken
  if (e.hp < e.maxHp || e.def.boss) {
    const bw = e.def.boss ? 70 : Math.max(26, s * 2);
    const bh = e.def.boss ? 7 : 4;
    const by = e.y - s - (e.def.flying ? 30 : 12) - (e.def.boss ? 14 : 0);
    const f = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(10,20,30,0.65)';
    roundRect(ctx, e.x - bw / 2 - 1.5, by - 1.5, bw + 3, bh + 3, (bh + 3) / 2);
    ctx.fill();
    if (f > 0) {
      const col = f > 0.5 ? ['#5fd65a', '#a8f59a'] : f > 0.25 ? ['#f2c94c', '#ffe9a0'] : ['#eb5757', '#ffaaa0'];
      const w = Math.max(bh, bw * f);
      ctx.fillStyle = col[0];
      roundRect(ctx, e.x - bw / 2, by, w, bh, bh / 2);
      ctx.fill();
      // Glanzlinie oben statt teurem Verlauf
      ctx.fillStyle = col[1];
      ctx.fillRect(e.x - bw / 2 + bh / 2, by + 0.5, Math.max(0, w - bh), Math.max(1, bh * 0.3));
    }
  }
}

// ======================= Karte =======================

function drawDecor(ctx: Ctx, d: Decor, color: string, rng: () => number): void {
  const x = (d.c + 0.5) * TILE + (rng() - 0.5) * 12;
  const y = (d.r + 0.5) * TILE + (rng() - 0.5) * 12;
  ctx.save();
  ctx.translate(x, y);
  if (d.kind === 'palm') {
    // weicher Schatten, nach rechts unten geworfen
    softShadow(ctx, 14, 20, 30, 10, 0.28);
    // gebogener Stamm mit Ringen
    const trunk = ctx.createLinearGradient(-6, 0, 6, 0);
    trunk.addColorStop(0, '#6b4524');
    trunk.addColorStop(0.5, '#a0703f');
    trunk.addColorStop(1, '#6b4524');
    ctx.strokeStyle = trunk;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 20); ctx.quadraticCurveTo(-7, 0, 2, -18); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,35,15,0.45)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) {
      const t = i / 6, px = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * -7 + t * t * 2, py = (1 - t) * (1 - t) * 20 + 2 * (1 - t) * t * 0 + t * t * -18;
      ctx.beginPath(); ctx.moveTo(px - 3.5, py); ctx.lineTo(px + 3.5, py - 1); ctx.stroke();
    }
    // Wedel mit Verlauf und Mittelrippe
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + rng() * 0.4;
      const len = 26 + rng() * 6;
      ctx.save();
      ctx.translate(2, -18);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, shade(color, -10));
      g.addColorStop(1, shade(color, 35));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.5, -9, len, 5);
      ctx.quadraticCurveTo(len * 0.5, 3, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -3, len, 5); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#5a3a18';
    circle(ctx, -1, -16, 3.2); ctx.fill();
    circle(ctx, 5, -15, 3.2); ctx.fill();
    circle(ctx, 2, -13, 3.2); ctx.fill();
  } else if (d.kind === 'rock') {
    softShadow(ctx, 6, 11, 24, 9, 0.3);
    const g = ctx.createLinearGradient(-18, -16, 16, 12);
    g.addColorStop(0, '#c4bfb4');
    g.addColorStop(1, '#6f6a62');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-20, 10); ctx.lineTo(-15, -7); ctx.lineTo(-2, -16); ctx.lineTo(14, -9); ctx.lineTo(21, 4); ctx.lineTo(14, 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.moveTo(-15, -7); ctx.lineTo(-2, -16); ctx.lineTo(1, -4); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(90,140,60,0.55)';
    ellipse(ctx, -12, 9, 7, 3); ctx.fill();
  } else {
    softShadow(ctx, 4, 10, 22, 8, 0.25);
    for (let i = 0; i < 6; i++) {
      const bx = (rng() - 0.5) * 24, by = (rng() - 0.5) * 14;
      const r = 9 + rng() * 4;
      const g = ctx.createRadialGradient(bx - 3, by - 4, 1, bx, by, r);
      g.addColorStop(0, shade(color, 40));
      g.addColorStop(1, shade(color, -8));
      ctx.fillStyle = g;
      circle(ctx, bx, by, r); ctx.fill();
    }
    const fl = ['#ff6fa8', '#ffd34d', '#ffffff'][Math.floor(rng() * 3)];
    for (let i = 0; i < 5; i++) {
      const fx = (rng() - 0.5) * 24, fy = (rng() - 0.5) * 14;
      ctx.fillStyle = fl;
      for (let k = 0; k < 5; k++) { circle(ctx, fx + Math.cos(k * 1.257) * 2.2, fy + Math.sin(k * 1.257) * 2.2, 1.6); ctx.fill(); }
      ctx.fillStyle = '#ffb02e';
      circle(ctx, fx, fy, 1.2); ctx.fill();
    }
  }
  ctx.restore();
}

function softShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(10,30,20,${a})`);
  g.addColorStop(1, 'rgba(10,30,20,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  circle(ctx, x, y, rx);
  ctx.fill();
  ctx.restore();
}

/** Zeichnet das Heiligtum mit den drei Steinwächtern am Ende des Weges. */
function drawSanctuary(ctx: Ctx, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ellipse(ctx, 6, 26, 80, 22); ctx.fill();
  ctx.fillStyle = '#8b8577';
  roundRect(ctx, -76, 6, 152, 26, 8); ctx.fill();
  ctx.fillStyle = '#a39d8e';
  roundRect(ctx, -76, 4, 152, 12, 6); ctx.fill();
  for (const [hx, sc] of [[-44, 0.9], [0, 1.05], [44, 0.9]] as const) {
    ctx.save();
    ctx.translate(hx, 8);
    ctx.scale(sc, sc);
    ctx.fillStyle = '#6f685c';
    ctx.beginPath();
    ctx.moveTo(-16, 0); ctx.lineTo(-17, -38); ctx.quadraticCurveTo(-16, -56, 0, -58);
    ctx.quadraticCurveTo(16, -56, 17, -38); ctx.lineTo(16, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#857d6f';
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.lineTo(-13, -38); ctx.quadraticCurveTo(-12, -52, 0, -54);
    ctx.lineTo(2, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a443b';
    ctx.fillRect(-13, -40, 26, 5);
    ctx.fillRect(-2, -34, 5, 16);
    ctx.fillRect(-9, -12, 18, 3);
    ctx.fillStyle = '#c0412d';
    roundRect(ctx, -12, -64, 24, 8, 3); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Breite des Strandes / Meeres am Kartenrand */
const SHORE = 22;

export function buildBackground(game: Game): HTMLCanvasElement {
  const S = 2;
  const cv = document.createElement('canvas');
  cv.width = W * S;
  cv.height = H * S;
  const ctx = cv.getContext('2d')!;
  ctx.scale(S, S);
  const th = game.level.theme;
  const rng = mulberry32(game.level.seed * 7 + 3);

  // --- Meer und Strand am Rand ---
  const sea = ctx.createLinearGradient(0, 0, W, H);
  sea.addColorStop(0, '#2ba3c9');
  sea.addColorStop(1, '#1b7fa8');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, W, H);
  const island = (inset: number, wob: number) => {
    // Inselumriss als leicht gewellte, abgerundete Fläche
    ctx.beginPath();
    const pts: [number, number][] = [];
    const n = 120;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let x: number, y: number;
      if (t < 0.25) { x = inset + (W - 2 * inset) * (t / 0.25); y = inset; }
      else if (t < 0.5) { x = W - inset; y = inset + (H - 2 * inset) * ((t - 0.25) / 0.25); }
      else if (t < 0.75) { x = W - inset - (W - 2 * inset) * ((t - 0.5) / 0.25); y = H - inset; }
      else { x = inset; y = H - inset - (H - 2 * inset) * ((t - 0.75) / 0.25); }
      const w = Math.sin(t * 61 + game.level.seed) * wob + Math.sin(t * 23) * wob * 0.6;
      const cx = W / 2, cy = H / 2;
      const d = Math.hypot(x - cx, y - cy);
      pts.push([x - ((x - cx) / d) * w, y - ((y - cy) / d) * w]);
    }
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  // Flachwasser
  island(SHORE * 0.2, 3);
  ctx.fillStyle = 'rgba(120,215,225,0.55)';
  ctx.fill();
  // Sand
  island(SHORE * 0.45, 3);
  ctx.fillStyle = '#ecd9a6';
  ctx.fill();

  // --- Wiese ---
  ctx.save();
  island(SHORE, 4);
  ctx.clip();
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, shade(th.grass, 10));
  base.addColorStop(1, shade(th.grass, -10));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // große, weiche Farbflecken statt Schachbrett
  for (let i = 0; i < 70; i++) {
    const x = rng() * W, y = rng() * H, r = 40 + rng() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = rng() < 0.5 ? shade(th.grass, 18) : shade(th.grass2, -16);
    g.addColorStop(0, hexA(c, 0.35));
    g.addColorStop(1, hexA(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Grashalme
  ctx.lineCap = 'round';
  for (let i = 0; i < 1400; i++) {
    const x = rng() * W, y = rng() * H, h = 3 + rng() * 5;
    ctx.strokeStyle = rng() < 0.5 ? hexA(shade(th.grass, -28), 0.5) : hexA(shade(th.grass, 30), 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 3, y - h); ctx.stroke();
  }
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = ['#ffffffcc', '#ffd34dcc', '#ff8fb6cc', '#b9a6ffcc'][i % 4];
    circle(ctx, rng() * W, rng() * H, 1.8);
    ctx.fill();
  }
  ctx.restore();
  // Übergang Wiese -> Sand
  island(SHORE, 4);
  ctx.strokeStyle = 'rgba(120,150,70,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // --- Wege ---
  const strokePath = (pts: { x: number; y: number }[], w: number, col: string | CanvasGradient) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  };
  // weicher Schatten unter dem Weg
  ctx.save();
  ctx.shadowColor = 'rgba(20,40,10,0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  for (const path of game.paths) strokePath(path.pts, TILE * 0.84, th.pathEdge);
  ctx.restore();
  for (const path of game.paths) strokePath(path.pts, TILE * 0.84, th.pathEdge);
  for (const path of game.paths) strokePath(path.pts, TILE * 0.72, th.path);
  // heller Mittelstreifen (ausgetretene Spur)
  for (const path of game.paths) strokePath(path.pts, TILE * 0.36, hexA(shade(th.path, 16), 0.55));
  // Kiesel und Fußspuren
  for (const k of game.pathTiles) {
    const c = k % COLS, r = Math.floor(k / COLS);
    for (let i = 0; i < 6; i++) {
      const px = c * TILE + 12 + rng() * 40, py = r * TILE + 12 + rng() * 40;
      ctx.fillStyle = hexA(shade(th.path, -35), 0.5);
      ellipse(ctx, px, py + 0.8, 2.2, 1.4); ctx.fill();
      ctx.fillStyle = rng() < 0.5 ? shade(th.path, -18) : shade(th.path, 20);
      ellipse(ctx, px, py, 2, 1.4); ctx.fill();
    }
  }

  // Start-Markierungen (dezente Pfeile)
  for (const path of game.paths) {
    let i = 0;
    while (i < path.pts.length - 1 && !inBounds(Math.floor(path.pts[i].x / TILE), Math.floor(path.pts[i].y / TILE))) i++;
    const a = path.pts[Math.max(0, i - 1)], b = path.pts[i];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const p = path.at(TILE * 0.9);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(190,50,40,0.5)';
    for (const o of [-12, 6]) {
      ctx.beginPath(); ctx.moveTo(o, -11); ctx.lineTo(o + 13, 0); ctx.lineTo(o, 11); ctx.lineTo(o + 5, 0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  const drng = mulberry32(game.level.seed + 99);
  const sorted = [...game.decor].sort((a, b) => a.r - b.r);
  for (const d of sorted) drawDecor(ctx, d, th.decor, drng);

  drawSanctuary(ctx, game.goal.x, game.goal.y - 6);

  // warmes Licht von oben links + weiche Vignette
  const light = ctx.createLinearGradient(0, 0, W, H);
  light.addColorStop(0, 'rgba(255,240,200,0.12)');
  light.addColorStop(0.5, 'rgba(255,240,200,0)');
  light.addColorStop(1, 'rgba(0,30,50,0.12)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,25,40,0.25)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  return cv;
}

// ======================= Szene =======================

/** Partikelfarben, die additiv leuchten (Feuer, Blitz, Heilung, Funken) */
const GLOW = new Set(['#ff7a1a', '#ffd34d', '#ff8a2a', '#ffb02e', '#ff5a1a', '#ffe28a', '#bfefff', '#bfe9ff', '#7dff9a', '#fff3a0']);

export class Renderer {
  private bg: HTMLCanvasElement;

  constructor(private game: Game) {
    this.bg = buildBackground(game);
  }

  draw(ctx: Ctx): void {
    const g = this.game;
    const t = performance.now() / 1000;
    if (g.shake > 0) { ctx.fillStyle = '#0a2a3d'; ctx.fillRect(0, 0, W, H); }
    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
    ctx.drawImage(this.bg, 0, 0, W, H);
    this.drawSurf(ctx, t);

    // Bau-Raster
    if (g.placing) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (g.canPlace(c, r)) ctx.strokeRect(c * TILE + 4, r * TILE + 4, TILE - 8, TILE - 8);
      }
    }

    // Reichweiten
    if (g.selected) this.range(ctx, g.selected.x, g.selected.y, g.selected.stats.range, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.6)');
    if (g.placing && g.hover && inBounds(g.hover.c, g.hover.r)) {
      const { c, r } = g.hover;
      const ok = g.canPlace(c, r) && g.coins >= TOWERS[g.placing].cost;
      const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
      ctx.fillStyle = ok ? 'rgba(90,220,120,0.35)' : 'rgba(235,80,80,0.4)';
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      this.range(ctx, x, y, TOWERS[g.placing].levels[0].range, ok ? 'rgba(255,255,255,0.12)' : 'rgba(235,80,80,0.12)', ok ? 'rgba(255,255,255,0.55)' : 'rgba(235,80,80,0.6)');
    }

    // Bodengegner + Türme nach Y sortiert, damit sie sich korrekt überlappen
    const items: { y: number; draw: () => void }[] = [];
    for (const e of g.enemies) if (!e.def.flying) items.push({ y: e.y, draw: () => drawEnemy(ctx, e) });
    for (const tw of g.towers) items.push({ y: tw.y + 8, draw: () => drawTower(ctx, tw.def.id, tw.level, tw.x, tw.y, tw.angle, t, tw.recoil, tw.branch) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    if (g.selected) {
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(g.selected.x, g.selected.y + 4, 30, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Projektile
    for (const p of g.projectiles) {
      const id = p.tower.def.id;
      if (id === 'fire') {
        const rem = Math.hypot(p.tx - p.x, p.ty - p.y);
        const f = p.traveled / (p.traveled + rem + 0.001);
        const lift = Math.sin(f * Math.PI) * 40;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ellipse(ctx, p.x, p.y, 6, 3); ctx.fill();
        ctx.fillStyle = '#ff7a1a';
        circle(ctx, p.x, p.y - lift, 7); ctx.fill();
        ctx.fillStyle = '#ffe28a';
        circle(ctx, p.x, p.y - lift, 3.5); ctx.fill();
      } else if (id === 'spear') {
        const a = Math.atan2(p.ty - p.y, p.tx - p.x);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.strokeStyle = '#d9c39a';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.fillStyle = '#eee';
        ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(20, 0); ctx.lineTo(10, 4); ctx.fill();
        ctx.restore();
      } else if (p.tower.stats.splash) {
        ctx.fillStyle = '#6d665c';
        circle(ctx, p.x, p.y, 8); ctx.fill();
        ctx.fillStyle = '#9a9184';
        circle(ctx, p.x - 2, p.y - 2, 3.5); ctx.fill();
      } else {
        ctx.fillStyle = '#7d7d7d';
        circle(ctx, p.x, p.y, 4.5); ctx.fill();
        ctx.fillStyle = '#aaa';
        circle(ctx, p.x - 1, p.y - 1, 2); ctx.fill();
      }
    }

    for (const e of g.enemies) if (e.def.flying) drawEnemy(ctx, e);

    // Fallende Vulkanbrocken
    for (const m of g.meteors) {
      const f = 1 - m.t / m.max;
      ctx.strokeStyle = `rgba(255,90,30,${0.4 + f * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(m.x, m.y, METEOR_RADIUS * (1 - f * 0.3), 0, TAU); ctx.stroke();
      const mx = m.x + (1 - f) * 260, my = m.y - (1 - f) * 520;
      const tr = ctx.createLinearGradient(mx, my, mx + 70, my - 140);
      tr.addColorStop(0, 'rgba(255,200,80,0.9)');
      tr.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.strokeStyle = tr;
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 70, my - 140); ctx.stroke();
      ctx.fillStyle = '#5a3a24';
      circle(ctx, mx, my, 16); ctx.fill();
      ctx.fillStyle = '#ff7a1a';
      circle(ctx, mx - 3, my + 3, 9); ctx.fill();
      ctx.fillStyle = '#ffe28a';
      circle(ctx, mx - 4, my + 4, 4); ctx.fill();
    }

    this.drawClouds(ctx, t);

    // Effekte
    for (const f of g.fx) {
      const a = Math.max(0, f.life / f.max);
      switch (f.k) {
        case 'p':
          ctx.globalAlpha = a;
          ctx.fillStyle = f.color;
          if (GLOW.has(f.color)) {
            // leuchtende Funken: additiv mit weichem Hof
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = a * 0.35;
            circle(ctx, f.x, f.y, f.size * 1.8); ctx.fill();
            ctx.globalAlpha = a;
            circle(ctx, f.x, f.y, f.size * 0.6); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          } else {
            circle(ctx, f.x, f.y, f.size * 0.6); ctx.fill();
          }
          break;
        case 'ring':
          ctx.globalAlpha = a;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.w * a + 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - a), 0, TAU); ctx.stroke();
          break;
        case 'bolt': {
          ctx.globalAlpha = a;
          ctx.globalCompositeOperation = 'lighter';
          for (const [w, col] of [[7, 'rgba(120,200,255,0.5)'], [2.5, '#f2fbff']] as const) {
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.beginPath();
            f.pts.forEach((p, i) => {
              if (i === 0) { ctx.moveTo(p.x, p.y); return; }
              const q = f.pts[i - 1];
              for (let s = 1; s <= 4; s++) {
                const k = s / 4;
                const j = s < 4 ? (Math.random() - 0.5) * 16 : 0;
                ctx.lineTo(q.x + (p.x - q.x) * k + j, q.y + (p.y - q.y) * k + j);
              }
            });
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'flood': {
          // Welle läuft von links nach rechts über die Insel
          const f = 1 - a;
          const x = -260 + f * (W + 520);
          const gr = ctx.createLinearGradient(x - 260, 0, x, 0);
          gr.addColorStop(0, 'rgba(40,150,220,0)');
          gr.addColorStop(0.75, 'rgba(60,170,235,0.45)');
          gr.addColorStop(1, 'rgba(220,245,255,0.8)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.moveTo(x - 260, 0);
          for (let yy = 0; yy <= H; yy += 32) ctx.lineTo(x + Math.sin(yy / 40 + t * 8) * 14, yy);
          ctx.lineTo(x - 260, H);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'txt':
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.font = `800 ${f.size}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.strokeText(f.text, f.x, f.y);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y);
          break;
      }
    }
    ctx.globalAlpha = 1;

    // Bau-Vorschau
    if (g.placing && g.hover && g.canPlace(g.hover.c, g.hover.r)) {
      ctx.globalAlpha = 0.65;
      drawTower(ctx, g.placing, 0, (g.hover.c + 0.5) * TILE, (g.hover.r + 0.5) * TILE, -Math.PI / 2, t);
      ctx.globalAlpha = 1;
    }

    // Zielvorschau für den Vulkanbrocken
    if (g.aiming === 'meteor' && g.hoverPt) {
      const { x, y } = g.hoverPt;
      ctx.fillStyle = 'rgba(255,90,30,0.18)';
      ctx.strokeStyle = 'rgba(255,120,40,0.9)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.arc(x, y, METEOR_RADIUS, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10); ctx.stroke();
    }
    ctx.restore();
  }

  private range(ctx: Ctx, x: number, y: number, r: number, fill: string, stroke: string): void {
    // nach außen dichter werdende Fläche + gestrichelter, rotierender Rand
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, fill);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -performance.now() / 60;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Brandung: helle Schaumlinien am Ufer, die langsam vor- und zurücklaufen */
  private drawSurf(ctx: Ctx, t: number): void {
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const off = 6 + k * 5 + Math.sin(t * 1.2 + k * 1.7) * 2.5;
      ctx.strokeStyle = `rgba(255,255,255,${0.45 - k * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, off + Math.sin(x / 37 + t * 1.5 + k) * 1.5);
      ctx.moveTo(W, H - off);
      for (let x = W; x >= 0; x -= 16) ctx.lineTo(x, H - off + Math.sin(x / 37 - t * 1.5 + k) * 1.5);
      ctx.moveTo(off, 0);
      for (let y = 0; y <= H; y += 16) ctx.lineTo(off + Math.sin(y / 31 + t * 1.3 + k) * 1.5, y);
      ctx.moveTo(W - off, H);
      for (let y = H; y >= 0; y -= 16) ctx.lineTo(W - off + Math.sin(y / 31 - t * 1.3 + k) * 1.5, y);
      ctx.stroke();
    }
    // Glitzern auf dem Wasser
    for (let i = 0; i < 14; i++) {
      const ph = (t * 0.6 + i * 0.37) % 1;
      const along = ((i * 977) % 1000) / 1000;
      const edge = i % 4;
      const x = edge < 2 ? along * W : edge === 2 ? 5 : W - 5;
      const y = edge === 0 ? 4 : edge === 1 ? H - 4 : along * H;
      ctx.fillStyle = `rgba(255,255,255,${Math.sin(ph * Math.PI) * 0.8})`;
      circle(ctx, x, y, 1.6);
      ctx.fill();
    }
    ctx.restore();
  }

  private cloud: HTMLCanvasElement | null = null;

  /** Langsam ziehende, weiche Wolkenschatten für mehr Tiefe */
  private drawClouds(ctx: Ctx, t: number): void {
    if (!this.cloud) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 160;
      const cx = c.getContext('2d')!;
      for (const [x, y, r] of [[90, 80, 70], [150, 70, 60], [120, 100, 55], [190, 95, 45], [60, 95, 40]] as const) {
        const g = cx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(10,30,40,0.10)');
        g.addColorStop(1, 'rgba(10,30,40,0)');
        cx.fillStyle = g;
        cx.fillRect(0, 0, 256, 160);
      }
      this.cloud = c;
    }
    for (let i = 0; i < 3; i++) {
      const sp = 9 + i * 4;
      const x = ((t * sp + i * 520) % (W + 700)) - 400;
      const y = (i * 230 + 60) % H;
      ctx.drawImage(this.cloud, x, y - 100, 512 - i * 60, 320 - i * 40);
    }
  }
}

/** Klickbare Kachel aus Spielkoordinaten (für UI). */
export function tileAt(x: number, y: number): { c: number; r: number } {
  return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}
export { key };

// ======================= Helfer =======================

function circle(ctx: Ctx, x: number, y: number, r: number): void { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number): void { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); }
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function hex(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function star(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function flame(ctx: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w, y - h * 0.6, x, y - h);
  ctx.quadraticCurveTo(x + w, y - h * 0.6, x + w, y);
  ctx.closePath();
  ctx.fill();
}
/** Farbe (#rrggbb oder rgb()) mit Transparenz */
function hexA(col: string, a: number): string {
  if (col.startsWith('rgb(')) return col.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const n = parseInt(col.slice(1, 7), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export function drawEnemyIcon(ctx: Ctx, e: Enemy): void { drawEnemy(ctx, e); }
