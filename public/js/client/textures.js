// Génération procédurale de toutes les images du jeu : textures de blocs 16×16, icônes d'objets,
// fissures, peaux des créatures et des joueurs, icônes isométriques pour l'interface.
// Tout est calculé dans des tampons RGBA purs (classe Img) : utilisable sous Node pour vérification.
import { mulberry32, hashStr } from '../shared/noise.js';
import { B, BLOCKS, ITEMS, I, TIERS, toolId } from '../shared/blocks.js';
import { MODELS } from './models.js';
import '../shared/guns.js';
import { gunGeometry, modParts } from './gunmodels.js';

export class Img {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4); }
  px(x, y, r, g, b, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.data;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
  }
  set(x, y, c, a) { this.px(x, y, c[0], c[1], c[2], a ?? (c[3] ?? 255)); }
  get(x, y) { const i = (y * this.w + x) * 4, d = this.data; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
  alpha(x, y) { return this.data[(y * this.w + x) * 4 + 3]; }
  blit(src, dx, dy, sx = 0, sy = 0, w = src.w, h = src.h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = src.get(sx + x, sy + y);
      if (c[3]) this.px(dx + x, dy + y, c[0], c[1], c[2], c[3]);
    }
  }
  clone() { const o = new Img(this.w, this.h); o.data.set(this.data); return o; }
  map(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.get(x, y); const r = fn(c, x, y); if (r) this.set(x, y, r, r[3] ?? c[3]);
    }
    return this;
  }
  toCanvas() {
    if (this._canvas) return this._canvas;
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(this.data), this.w, this.h), 0, 0);
    this._canvas = c;
    return c;
  }
}

// ------------------------------------------------------------------ Outils de couleur
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const jit = (c, r, amt) => { const f = 1 + (r() - 0.5) * amt; return mul(c, f); };
const cl = (v) => Math.max(0, Math.min(1, v));

// Bruit de valeur lissé et répétable sur une grille size×size (cellules de taille cell)
function tileNoise(r, size, cell) {
  const n = size / cell, g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(y0 % n) * n + (x0 % n)], b = g[(y0 % n) * n + ((x0 + 1) % n)];
    const c = g[((y0 + 1) % n) * n + (x0 % n)], d = g[((y0 + 1) % n) * n + ((x0 + 1) % n)];
    out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}

function fill(img, fn) { for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const c = fn(x, y); if (c) img.set(x, y, c, c[3]); } }

// ------------------------------------------------------------------ Textures de blocs (16×16)
const T = {};
const tex = (name, fn) => { T[name] = fn; };

const DIRT = hex('#86603f'), GRASS = hex('#62a044'), STONE = [124, 124, 126], SAND = hex('#dccf96');
const BARK = hex('#6a4b2c'), SBARK = hex('#46321f'), PLANK = hex('#b68a57');

function noisy(img, r, base, amt = 0.18, cell = 4, namt = 0.25) {
  const n = tileNoise(r, 16, cell);
  fill(img, (x, y) => jit(mul(base, 1 + (n[y * 16 + x] - 0.5) * namt), r, amt));
}

tex('dirt', (img, r) => {
  noisy(img, r, DIRT, 0.2, 4, 0.3);
  for (let i = 0; i < 9; i++) { const x = r() * 16, y = r() * 16, c = r() < 0.5 ? mul(DIRT, 0.72) : mul(DIRT, 1.22); img.set(x, y, c); if (r() < 0.5) img.set(x + 1, y, c); }
});
tex('grass_top', (img, r) => {
  const n = tileNoise(r, 16, 4), n2 = tileNoise(r, 16, 8);
  const dark = hex('#5c6236'), light = hex('#8e8a56');
  fill(img, (x, y) => jit(mix(dark, light, cl(n[y * 16 + x] * 0.7 + n2[y * 16 + x] * 0.5 - 0.1)), r, 0.16));
  for (let i = 0; i < 14; i++) { const x = r() * 16, y = r() * 16; img.set(x, y, mul(dark, 0.85)); img.set(x, y + 1, mul(dark, 0.95)); }
});
function capSide(img, r, base, capColor, capAmt, depth) {
  T.dirt(img, r);
  for (let x = 0; x < 16; x++) {
    let d = depth + (r() < 0.5 ? 1 : 0);
    if (r() < 0.25) d += 2;
    for (let y = 0; y < d; y++) img.set(x, y, jit(mul(capColor, 1 - y * 0.03), r, capAmt));
    img.set(x, d, mul(capColor, 0.72));
  }
}
tex('grass_side', (img, r) => capSide(img, r, DIRT, hex('#76744a'), 0.2, 3));
tex('snow_side', (img, r) => capSide(img, r, DIRT, hex('#eef2f6'), 0.06, 4));
tex('snow', (img, r) => { const n = tileNoise(r, 16, 4); fill(img, (x, y) => jit(mix(hex('#dfe8f0'), hex('#f7fafc'), n[y * 16 + x]), r, 0.04)); });

tex('stone', (img, r) => {
  noisy(img, r, STONE, 0.12, 4, 0.22);
  for (let i = 0; i < 5; i++) { let x = r() * 16, y = r() * 16; const len = 2 + r() * 4; for (let k = 0; k < len; k++) { img.set(x, y, mul(STONE, 0.78)); x += r() < 0.7 ? 1 : 0; y += r() < 0.4 ? 1 : 0; } }
});
function voronoi(img, r, n, colorFn, mortar) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([r() * 16, r() * 16, r()]);
  fill(img, (x, y) => {
    let d1 = 1e9, d2 = 1e9, best = null;
    for (const p of pts) for (let oy = -16; oy <= 16; oy += 16) for (let ox = -16; ox <= 16; ox += 16) {
      const d = Math.hypot(x + 0.5 - p[0] - ox, y + 0.5 - p[1] - oy);
      if (d < d1) { d2 = d1; d1 = d; best = [p, ox, oy]; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 1.1) return jit(mortar, r, 0.1);
    const [p, ox, oy] = best;
    const lit = (p[0] + ox - x) * 0.04 + (p[1] + oy - y) * 0.04;
    return jit(mul(colorFn(p[2]), 1 + lit - d1 * 0.02), r, 0.1);
  });
}
tex('cobble', (img, r) => voronoi(img, r, 9, (v) => [100 + v * 55, 100 + v * 55, 104 + v * 52], [58, 58, 62]));
tex('gravel', (img, r) => voronoi(img, r, 13, (v) => (v < 0.3 ? [120 + v * 60, 104, 96] : [110 + v * 50, 108 + v * 48, 106 + v * 48]), [84, 78, 74]));
tex('sand', (img, r) => { noisy(img, r, SAND, 0.08, 4, 0.1); for (let i = 0; i < 12; i++) img.set(r() * 16, r() * 16, mul(SAND, r() < 0.5 ? 0.86 : 1.08)); });
tex('water', (img, r) => {
  fill(img, (x, y) => {
    const w = Math.sin((x / 16) * Math.PI * 2 + Math.sin((y / 16) * Math.PI * 2) * 1.3) * 0.5 + 0.5;
    const band = Math.sin(((y + w * 3) / 16) * Math.PI * 4) * 0.5 + 0.5;
    const c = mix(hex('#2a58a8'), hex('#4f86d0'), band * 0.7 + r() * 0.12);
    return [...c, 170];
  });
});
tex('log_side', (img, r) => barkTex(img, r, BARK));
tex('spruce_log_side', (img, r) => barkTex(img, r, SBARK));
function barkTex(img, r, base) {
  const col = []; for (let x = 0; x < 16; x++) col.push(r());
  const n = tileNoise(r, 16, 4);
  fill(img, (x, y) => {
    const g = col[x] < 0.28 || (col[x] < 0.4 && n[y * 16 + x] > 0.55);
    return jit(mul(base, g ? 0.66 : 1 + (n[y * 16 + x] - 0.5) * 0.3), r, 0.12);
  });
}
function ringsTex(img, r, light, dark, bark) {
  fill(img, (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return jit(bark, r, 0.15);
    const d = Math.hypot(x - 7.5, y - 7.5) + r() * 0.6;
    return jit(mix(light, dark, Math.sin(d * 2.1) * 0.5 + 0.5), r, 0.06);
  });
}
tex('log_top', (img, r) => ringsTex(img, r, hex('#bb935c'), hex('#94703f'), BARK));
tex('spruce_log_top', (img, r) => ringsTex(img, r, hex('#9d7648'), hex('#735333'), SBARK));
function leavesTex(img, r, dark, light) {
  const n = tileNoise(r, 16, 4);
  fill(img, (x, y) => {
    const v = n[y * 16 + x];
    if (r() < 0.2 + (0.4 - v) * 0.4) return [0, 0, 0, 0];
    return jit(mix(dark, light, cl(v + r() * 0.3 - 0.15)), r, 0.15);
  });
}
tex('leaves', (img, r) => leavesTex(img, r, hex('#3d4a2a'), hex('#66703f')));
tex('spruce_leaves', (img, r) => leavesTex(img, r, hex('#27392c'), hex('#465a48')));
tex('planks', (img, r) => {
  const offs = [5, 12, 2, 9];
  const grain = []; for (let i = 0; i < 16; i++) grain.push(r());
  fill(img, (x, y) => {
    const board = y >> 2;
    if ((y & 3) === 3) return jit(mul(PLANK, 0.66), r, 0.06);
    if (x === offs[board]) return jit(mul(PLANK, 0.74), r, 0.06);
    const g = Math.sin(x * 0.7 + grain[y] * 6) * 0.06 + (grain[(y + x) & 15] - 0.5) * 0.08;
    return jit(mul(PLANK, 1 + g + (board % 2 ? -0.04 : 0.02)), r, 0.05);
  });
});
tex('bedrock', (img, r) => {
  const n = tileNoise(r, 16, 2);
  const cols = [[28, 28, 30], [60, 60, 62], [96, 96, 98], [130, 130, 132]];
  fill(img, (x, y) => jit(cols[Math.min(3, Math.floor((n[y * 16 + x] * 0.7 + r() * 0.5) * 4))], r, 0.1));
});
function oreTex(img, r, main, light, dark) {
  T.stone(img, r);
  for (let c = 0; c < 5; c++) {
    const cx = 2 + r() * 12, cy = 2 + r() * 12, n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const x = Math.floor(cx + (r() - 0.5) * 3), y = Math.floor(cy + (r() - 0.5) * 3);
      img.set(x, y, main); img.set(x + 1, y + 1, dark);
      if (r() < 0.4) img.set(x, y - 1, light);
    }
  }
}
tex('coal_ore', (img, r) => oreTex(img, r, [44, 44, 48], [84, 84, 92], [22, 22, 24]));
tex('iron_ore', (img, r) => oreTex(img, r, hex('#d6ab8c'), hex('#f0d0b8'), hex('#9a7058')));
tex('gold_ore', (img, r) => oreTex(img, r, hex('#f2cf3c'), hex('#fff2a0'), hex('#b08a18')));
tex('diamond_ore', (img, r) => oreTex(img, r, hex('#5fe3dc'), hex('#d4fffb'), hex('#23948f')));
tex('glass', (img, r) => {
  fill(img, (x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (edge) return [...jit(hex('#d9eef4'), r, 0.06), 255];
    const streak = (x + y === 8 && x > 2 && x < 6) || (x + y === 10 && x > 3 && x < 6) || (x + y === 22 && x > 9 && x < 13);
    if (streak) return [245, 252, 255, 255];
    return [0, 0, 0, 0];
  });
  img.set(1, 1, hex('#ffffff')); img.set(14, 14, hex('#a9c7d1'));
});
tex('cactus_side', (img, r) => {
  const base = hex('#3f7d2c');
  fill(img, (x, y) => {
    let c = base;
    if (x === 0 || x === 15) c = mul(base, 0.62);
    else if (x === 2 || x === 7 || x === 12) c = mul(base, 0.8);
    else if (x === 4 || x === 9 || x === 13) c = mul(base, 1.2);
    return jit(c, r, 0.08);
  });
  for (let i = 0; i < 12; i++) { const x = [3, 8, 11, 14][Math.floor(r() * 4)], y = Math.floor(r() * 16); img.set(x, y, hex('#e6e2b4')); }
});
tex('cactus_top', (img, r) => {
  const base = hex('#4b8c34');
  fill(img, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.9) return jit(mul(base, 0.6), r, 0.08);
    if (d > 5.9) return jit(mul(base, 0.85), r, 0.08);
    return jit(mul(base, 1.1 - (d < 2 ? 0.15 : 0)), r, 0.08);
  });
});
function frameWood(img, r) {
  T.planks(img, r);
  for (let i = 0; i < 16; i++) { img.set(i, 0, mul(PLANK, 0.55)); img.set(i, 15, mul(PLANK, 0.55)); img.set(0, i, mul(PLANK, 0.55)); img.set(15, i, mul(PLANK, 0.55)); }
}
tex('table_top', (img, r) => {
  frameWood(img, r);
  for (let i = 1; i < 15; i++) { for (const k of [5, 10]) { img.set(i, k, mul(PLANK, 0.62)); img.set(k, i, mul(PLANK, 0.62)); } }
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (x % 5 !== 0 && y % 5 !== 0 && ((x % 5) + (y % 5)) === 2) img.set(x, y, mul(PLANK, 1.18));
});
tex('table_side', (img, r) => {
  frameWood(img, r);
  for (let x = 1; x < 15; x++) for (let y = 1; y < 4; y++) img.set(x, y, jit(mul(PLANK, 0.72), r, 0.06));
  // scie
  for (let x = 3; x < 12; x++) for (let y = 6; y < 9 + (x - 3) * 0.25; y++) img.set(x, y, jit([170, 172, 178], r, 0.08));
  for (let x = 3; x < 12; x += 2) img.set(x, 9 + Math.floor((x - 3) * 0.25), [120, 122, 128]);
  for (let y = 5; y < 10; y++) { img.set(12, y, hex('#6b4526')); img.set(13, y, hex('#6b4526')); }
});
tex('table_front', (img, r) => {
  frameWood(img, r);
  for (let x = 1; x < 15; x++) for (let y = 1; y < 4; y++) img.set(x, y, jit(mul(PLANK, 0.72), r, 0.06));
  // marteau
  for (let y = 6; y < 14; y++) img.set(5, y, hex('#6b4526'));
  for (let x = 3; x < 8; x++) { img.set(x, 5, [150, 152, 158]); img.set(x, 6, [120, 122, 128]); }
  // pinces
  for (let y = 5; y < 14; y++) { img.set(10 + (y > 9 ? 0 : 0), y, [130, 132, 138]); img.set(12 - (y > 10 ? 1 : 0), y, [110, 112, 118]); }
});
function smoothStone(img, r, base) {
  noisy(img, r, base, 0.06, 8, 0.12);
  for (let i = 0; i < 16; i++) { img.set(i, 0, mul(base, 1.15)); img.set(0, i, mul(base, 1.1)); img.set(i, 15, mul(base, 0.72)); img.set(15, i, mul(base, 0.75)); }
}
tex('furnace_top', (img, r) => smoothStone(img, r, [132, 132, 134]));
tex('furnace_side', (img, r) => {
  T.cobble(img, r);
  for (let i = 0; i < 16; i++) { img.set(i, 0, [150, 150, 152]); img.set(i, 15, [70, 70, 72]); }
});
tex('furnace_front', (img, r) => {
  T.furnace_side(img, r);
  for (let y = 7; y < 14; y++) for (let x = 3; x < 13; x++) img.set(x, y, [32, 28, 26]);
  for (let x = 3; x < 13; x++) { img.set(x, 13, jit(hex('#e8892a'), r, 0.2)); img.set(x, 12, r() < 0.6 ? hex('#f7c95a') : hex('#c2531c')); if (r() < 0.4) img.set(x, 11, hex('#b24a18')); }
  for (let x = 3; x < 13; x++) img.set(x, 6, [150, 150, 152]);
  for (let x = 4; x < 12; x += 2) { img.set(x, 3, [40, 40, 42]); img.set(x, 4, [40, 40, 42]); }
});
tex('torch', (img) => {
  for (let y = 8; y < 16; y++) { img.set(7, y, hex('#8a6236')); img.set(8, y, hex('#6b4526')); }
  img.set(7, 6, hex('#fff3a8')); img.set(8, 6, hex('#ffd865'));
  img.set(7, 7, hex('#f7a33a')); img.set(8, 7, hex('#e9772a'));
});
tex('stone_bricks', (img, r) => {
  noisy(img, r, [122, 122, 124], 0.08, 4, 0.16);
  fill(img, (x, y) => {
    const row = y >> 3, ly = y & 7, lx = (x + (row ? 8 : 0)) & 15;
    if (ly === 7 || lx === 15) return [70, 70, 72];
    if (ly === 0 || lx === 0) return mul(img.get(x, y), 1.14);
    if (ly === 6 || lx === 14) return mul(img.get(x, y), 0.86);
    return null;
  });
});
tex('wool', (img, r) => {
  fill(img, (x, y) => {
    const v = Math.sin(x * 1.3 + Math.sin(y * 0.9) * 2) * Math.sin(y * 1.1 + Math.cos(x * 0.8) * 2);
    return jit(mul(hex('#ebe7de'), 0.93 + v * 0.06), r, 0.04);
  });
});
function blade(img, r, x, h, lean, dark, light) {
  let fx = x;
  for (let i = 0; i < h; i++) {
    img.set(Math.round(fx), 15 - i, mix(dark, light, i / h));
    fx += lean * (i / h);
  }
}
tex('tall_grass', (img, r) => {
  for (let i = 0; i < 9; i++) blade(img, r, 1 + r() * 14, 5 + r() * 10, (r() - 0.5) * 0.6, hex('#6a6236'), hex('#b8a86a'));
});
function stem(img, top) { for (let y = top; y < 16; y++) img.set(7 + (y > 12 ? 1 : 0), y, hex('#3e7e2b')); img.set(6, 12, hex('#4f9a38')); img.set(9, 11, hex('#4f9a38')); img.set(5, 11, hex('#3e7e2b')); }
tex('poppy', (img) => {
  stem(img, 8);
  const red = hex('#cf2e28');
  for (let y = 3; y < 9; y++) for (let x = 4; x < 12; x++) {
    const d = Math.hypot(x - 7.5, y - 5.5);
    if (d < 3.4) img.set(x, y, d < 1.2 ? [44, 24, 20] : mul(red, 1.1 - d * 0.08 - (y > 6 ? 0.12 : 0)));
  }
});
tex('dandelion', (img) => {
  stem(img, 9);
  for (let y = 4; y < 10; y++) for (let x = 5; x < 11; x++) {
    const d = Math.hypot(x - 7.5, y - 6.5);
    if (d < 2.7) img.set(x, y, mul(hex('#f2cf2e'), 1.1 - d * 0.1 + (x < 7 && y < 6 ? 0.1 : 0)));
  }
});
tex('dead_bush', (img, r) => {
  const c = hex('#8a6236'), d = hex('#5e4022');
  const branch = (x, y, dx, n) => { for (let i = 0; i < n; i++) { img.set(x, y, i % 3 ? c : d); y--; x += dx * (r() < 0.6 ? 1 : 0); if (x < 0 || x > 15) break; } };
  branch(7, 15, 0, 5); branch(7, 11, -1, 6); branch(8, 11, 1, 7); branch(7, 9, -1, 4); branch(9, 8, 1, 4); branch(5, 7, 1, 3);
});
tex('sandstone_top', (img, r) => smoothStone(img, r, hex('#d8ca92')));
tex('sandstone_side', (img, r) => {
  noisy(img, r, hex('#d6c78d'), 0.05, 4, 0.08);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 3; y++) img.set(x, y, jit(hex('#e2d6a2'), r, 0.04));
    img.set(x, 3, hex('#b9a86c')); img.set(x, 12, hex('#b9a86c'));
    for (let y = 13; y < 16; y++) img.set(x, y, jit(hex('#cbbb7f'), r, 0.05));
  }
});
tex('lantern', (img, r) => {
  fill(img, (x, y) => {
    if (x < 2 || x > 13 || y < 2 || y > 13) return jit([48, 48, 54], r, 0.1);
    if (x === 5 || x === 10) return [62, 62, 68];
    const d = Math.hypot(x - 7.5, y - 7.5);
    return mix(hex('#fff2b0'), hex('#e59a32'), cl(d / 7));
  });
  for (let i = 2; i < 14; i++) { img.set(i, 2, [78, 78, 86]); img.set(2, i, [78, 78, 86]); }
});
tex('slime_block', (img, r) => {
  fill(img, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.9) return jit(hex('#5f9f4c'), r, 0.05);
    if (d > 4.9) return jit(hex('#7cc466'), r, 0.05);
    return jit(hex('#9bdc80'), r, 0.05);
  });
  img.set(4, 4, hex('#d4ffc4')); img.set(5, 4, hex('#c0f5ae')); img.set(4, 5, hex('#c0f5ae'));
});
function metal(img, r, base) {
  fill(img, (x, y) => {
    let c = jit(base, r, 0.04);
    if (x === 0 || y === 0) c = mul(base, 1.18);
    else if (x === 15 || y === 15) c = mul(base, 0.66);
    else if (x === 1 || y === 1) c = mul(base, 1.07);
    else if (x === 14 || y === 14) c = mul(base, 0.82);
    if ((x + y === 9 || x + y === 10) && x > 2 && x < 8) c = mul(base, 1.22);
    return c;
  });
}
tex('iron_block', (img, r) => metal(img, r, [214, 214, 218]));
tex('gold_block', (img, r) => metal(img, r, hex('#f0c63c')));
tex('diamond_block', (img, r) => metal(img, r, hex('#62ddd6')));

// Fissures : chaque pixel reçoit un « temps d'apparition », révélé en 8 étapes
function crackStages(r) {
  const t = new Float32Array(256).fill(9);
  const walk = (x, y, dir, start, len) => {
    for (let i = 0; i < len; i++) {
      if (x < 0 || y < 0 || x > 15 || y > 15) return;
      const k = y * 16 + x; t[k] = Math.min(t[k], start + i * 0.35);
      dir += (r() - 0.5) * 1.2;
      x = Math.round(x + Math.cos(dir)); y = Math.round(y + Math.sin(dir));
      if (r() < 0.12) walk(x, y, dir + (r() < 0.5 ? 1 : -1), start + i * 0.35, len - i - 2);
    }
  };
  for (let a = 0; a < 5; a++) walk(8, 8, a * 1.3 + r(), a * 0.4, 12);
  return t;
}

// ------------------------------------------------------------------ Icônes d'objets (16×16)
const ICON = {};
function grid(img, rows, pal) {
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = pal[row[x]]; if (c) img.set(x, y, c); } });
}
function disc(img, cx, cy, rad, colFn) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d <= rad) { const c = colFn(x, y, d / rad); if (c) img.set(x, y, c); }
  }
}
// Relief : éclaircit le haut-gauche, assombrit le bas-droite, contour sombre
function bevel(img) {
  const src = img.clone();
  const a = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && src.alpha(x, y) > 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!a(x, y)) continue;
    const c = src.get(x, y);
    let f = 1;
    if (!a(x + 1, y) || !a(x, y + 1)) f = 0.72;
    else if (!a(x - 1, y) || !a(x, y - 1)) f = 1.18;
    img.set(x, y, mul(c, f), c[3]);
  }
}
const HANDLE = { h: hex('#6d4a26'), H: hex('#93683a'), k: hex('#4a311a') };
const MAT = {
  wood: [hex('#8a6236'), hex('#b3864f'), hex('#5e4022')],
  stone: [[128, 128, 130], [170, 170, 172], [84, 84, 86]],
  iron: [[214, 214, 218], [250, 250, 252], [140, 140, 146]],
  diamond: [hex('#4fd8cf'), hex('#b8fff6'), hex('#1f8f88')],
};
const TOOL_GRIDS = {
  pickaxe: [
    '................',
    '...MMMMMMm......',
    '..Mmmmmmmmmd....',
    '..dd.....dmmd...',
    '........Hhdmmd..',
    '.......Hh..dmmd.',
    '......Hh....dmd.',
    '.....Hh.....dmd.',
    '....Hh.......dmd',
    '...Hh........dm.',
    '..Hh..........d.',
    '.Hh.............',
    'Hh..............',
    'k...............',
    '................',
    '................',
  ],
  axe: [
    '................',
    '......MMM.......',
    '.....MmmmM......',
    '....Mmmmmmd.....',
    '....mmmmmHhd....',
    '....mmmmHh.d....',
    '....dmmHh.......',
    '.....dHhd.......',
    '.....Hh.........',
    '....Hh..........',
    '...Hh...........',
    '..Hh............',
    '.Hh.............',
    'Hh..............',
    'k...............',
    '................',
  ],
  shovel: [
    '................',
    '..........MMm...',
    '.........Mmmmm..',
    '.........mmmmmd.',
    '.........mmmmmd.',
    '..........dmmd..',
    '.........Hh.....',
    '........Hh......',
    '.......Hh.......',
    '......Hh........',
    '.....Hh.........',
    '....Hh..........',
    '...Hh...........',
    '..Hh............',
    '.kk.............',
    '................',
  ],
  sword: [
    '................',
    '.............Mm.',
    '............Mmd.',
    '...........Mmd..',
    '..........Mmd...',
    '.........Mmd....',
    '........Mmd.....',
    '.......Mmd......',
    '..kk..Mmd.......',
    '...kkMmd........',
    '....kkd.........',
    '...Hhkk.........',
    '..Hh..kk........',
    '.Hh.............',
    'kk..............',
    '................',
  ],
};
function toolIcon(kind, mat) {
  const img = new Img(16, 16);
  const [m, M, d] = MAT[mat];
  grid(img, TOOL_GRIDS[kind], { m, M, d, ...HANDLE });
  return img;
}
function meatIcon(img, r, base, fat, bone) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - 7.5) / 6.5, dy = (y - 8.5) / 4.8;
    const e = dx * dx + dy * dy + Math.sin(x * 1.7 + y) * 0.05;
    if (e < 1) {
      const band = Math.abs(dy + dx * 0.3 - 0.2) < 0.18;
      img.set(x, y, jit(band ? fat : mul(base, 1.05 - dy * 0.12), r, 0.08));
    }
  }
  if (bone) { img.set(13, 5, bone); img.set(14, 4, bone); img.set(14, 5, mul(bone, 0.85)); }
  bevel(img);
}
function drumstick(img, r, meat) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - 6), dy = (y - 10);
    const e = (dx * dx) / 22 + (dy * dy) / 16 + (dx * dy) / 40;
    if (e < 1) img.set(x, y, jit(mul(meat, 1.05 - dy * 0.03), r, 0.08));
  }
  const bone = [240, 234, 220];
  for (let i = 0; i < 4; i++) img.set(9 + i, 6 - i, bone);
  img.set(13, 1, bone); img.set(12, 2, bone); img.set(13, 2, bone); img.set(14, 2, bone); img.set(13, 3, bone);
  bevel(img);
}
const ICON_FN = {
  stick: (img) => { for (let i = 0; i < 12; i++) { img.set(2 + i, 13 - i, hex('#93683a')); img.set(3 + i, 13 - i, hex('#6d4a26')); } },
  coal: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot((x - 7.5) * 1.05, (y - 8.5) * 1.2) + Math.sin(x * 2.1 + y * 1.3) * 0.8;
      if (d < 5.6) img.set(x, y, jit(r() < 0.25 ? [78, 78, 88] : [38, 38, 42], r, 0.1));
    }
    bevel(img);
  },
  ingot_iron: (img, r) => ingot(img, r, [214, 214, 220]),
  ingot_gold: (img, r) => ingot(img, r, hex('#f2c83a')),
  diamond: (img) => {
    const c = hex('#5fe3dc');
    for (let y = 3; y < 14; y++) {
      const half = y < 7 ? 3 + (y - 3) : Math.max(0, 6 - (y - 7) * 0.9);
      for (let x = Math.round(7.5 - half); x <= Math.round(7.5 + half); x++) {
        const f = y < 7 ? 1.2 - (x - 4) * 0.03 : 0.95 - (x - 7.5) * 0.04;
        img.set(x, y, mul(c, f));
      }
    }
    img.set(6, 4, [230, 255, 255]); img.set(5, 5, [230, 255, 255]);
    bevel(img);
  },
  string: (img) => {
    for (let x = 1; x < 15; x++) {
      const y = Math.round(8 + Math.sin(x * 0.9) * 3.5);
      img.set(x, y, [236, 236, 236]); img.set(x, y + 1, [180, 180, 186]);
    }
  },
  feather: (img) => {
    for (let i = 0; i < 12; i++) {
      const x = 3 + i, y = 13 - i;
      img.set(x, y, [200, 196, 188]);
      const w = i < 2 ? 0 : Math.min(3, (12 - i) * 0.45);
      for (let k = 1; k <= w; k++) { img.set(x - k, y - k + 1, mul([244, 244, 240], 1 - k * 0.05)); img.set(x + k - 1, y + k, mul([226, 226, 222], 1 - k * 0.05)); }
    }
    img.set(2, 14, [150, 140, 130]);
  },
  slimeball: (img) => { disc(img, 8, 8.5, 4.8, (x, y, d) => mul(hex('#7ccb5e'), 1.15 - d * 0.35 + (x < 7 && y < 7 ? 0.1 : 0))); img.set(6, 6, [220, 255, 210]); bevel(img); },
  flesh: (img, r) => meatIcon(img, r, hex('#8e5a3c'), hex('#6f7a48'), null),
  apple: (img) => appleIcon(img, hex('#c9302c')),
  golden_apple: (img) => { appleIcon(img, hex('#f1c83a')); img.set(4, 7, [255, 255, 230]); img.set(11, 12, [255, 250, 200]); },
  pork_raw: (img, r) => meatIcon(img, r, hex('#eb9a9a'), hex('#f8e6dc'), null),
  pork_cooked: (img, r) => meatIcon(img, r, hex('#a8653a'), hex('#dfae72'), null),
  mutton_raw: (img, r) => meatIcon(img, r, hex('#c24a44'), hex('#eed8cc'), [236, 230, 216]),
  mutton_cooked: (img, r) => meatIcon(img, r, hex('#8a5234'), hex('#c68e5c'), [236, 230, 216]),
  chicken_raw: (img, r) => drumstick(img, r, hex('#f0c0aa')),
  chicken_cooked: (img, r) => drumstick(img, r, hex('#c98a3e')),
  charm: (img) => {
    for (let a = 0; a < 20; a++) { const t = (a / 19) * Math.PI; img.set(Math.round(8 + Math.cos(t) * 5), Math.round(6 - Math.sin(t) * 5), [226, 222, 212]); }
    img.set(3, 7, [226, 222, 212]); img.set(13, 7, [226, 222, 212]);
    disc(img, 8, 8, 1.8, () => hex('#f2c83a'));
    for (let i = 0; i < 6; i++) { img.set(8, 10 + i, [210, 206, 198]); img.set(7, 10 + i, [245, 245, 242]); img.set(9, 11 + i * 0.8, [232, 232, 228]); if (i > 1) img.set(6, 10 + i, [236, 236, 232]); }
  },
};
function ingot(img, r, c) {
  for (let y = 5; y < 12; y++) for (let x = 1; x < 15; x++) {
    const top = y < 8, sl = top ? (8 - y) : 0;
    if (x < 2 + sl || x > 13 - (top ? 0 : (y - 8))) continue;
    img.set(x, y, mul(c, top ? 1.15 : 0.88 - (y - 8) * 0.05));
  }
  bevel(img);
}
function appleIcon(img, c) {
  disc(img, 8, 9.5, 5.3, (x, y, d) => mul(c, 1.12 - d * 0.3 - (x > 9 ? 0.1 : 0)));
  img.set(8, 4, hex('#5e4022')); img.set(8, 3, hex('#5e4022'));
  img.set(9, 3, hex('#4f9a38')); img.set(10, 3, hex('#4f9a38')); img.set(10, 2, hex('#3e7e2b'));
  img.set(5, 7, mul(c, 1.5));
  bevel(img);
}

// ------------------------------------------------------------------ Peaux (64×64)
function faceIter(part, fn) {
  const [, , , w, h, d] = part.box, [u, v] = part.uv;
  const W = Math.round(w), H = Math.round(h), D = Math.round(d);
  const faces = {
    top: [u + D, v, W, D], bottom: [u + D + W, v, W, D], right: [u, v + D, D, H],
    front: [u + D, v + D, W, H], left: [u + D + W, v + D, D, H], back: [u + 2 * D + W, v + D, W, H],
  };
  for (const f in faces) {
    const [fu, fv, fw, fh] = faces[f];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) fn(f, x, y, fw, fh, fu + x, fv + y);
  }
}
function paintSkin(type, painter, seed) {
  const img = new Img(64, 64), r = mulberry32(seed || hashStr(type));
  for (const part of MODELS[type].parts) {
    faceIter(part, (face, x, y, w, h, px, py) => {
      const c = painter(part.name, face, x, y, w, h, r);
      if (c) img.set(px, py, c, c[3] ?? 255);
    });
  }
  return img;
}

const PAINT = {
  pig(part, f, x, y, w, h, r) {
    const pink = hex('#eba3a3');
    if (part === 'snout') return f === 'front' && y === 1 && (x === 0 || x === 3) ? hex('#a0525c') : jit(hex('#f4bcbc'), r, 0.05);
    if (part.startsWith('leg')) return (y >= h - 1 && f !== 'top') || f === 'bottom' ? hex('#8a5a52') : jit(pink, r, 0.06);
    if (part === 'head' && f === 'front') {
      if (y === 3 && (x === 1 || x === 6)) return [245, 245, 245];
      if (y === 3 && (x === 2 || x === 5)) return [30, 22, 24];
    }
    if (part === 'body' && f === 'bottom') return jit(mul(pink, 0.9), r, 0.05);
    return jit(mul(pink, f === 'top' ? 1.04 : 1), r, 0.07);
  },
  sheep(part, f, x, y, w, h, r) {
    const wool = [236, 234, 226], skin = hex('#c7ab8c');
    const woolly = () => jit(wool, r, 0.1);
    if (part === 'body') return woolly();
    if (part.startsWith('leg')) return y < 3 && f !== 'bottom' ? woolly() : (y >= h - 1 ? hex('#6e5a48') : jit(skin, r, 0.06));
    if (part === 'head') {
      if (f === 'top' || (f !== 'front' && f !== 'bottom' && y < 2) || (f === 'front' && y === 0)) return woolly();
      if (f === 'front') {
        if (y === 2 && (x === 0 || x === 5)) return [250, 250, 250];
        if (y === 2 && (x === 1 || x === 4)) return [30, 26, 22];
        if (y === 4 && (x === 2 || x === 3)) return hex('#d68a8a');
      }
      return jit(skin, r, 0.06);
    }
    return woolly();
  },
  chicken(part, f, x, y, w, h, r) {
    const white = [242, 242, 236];
    if (part === 'beak') return jit(hex('#f0a23a'), r, 0.05);
    if (part === 'wattle') return jit(hex('#d23a32'), r, 0.05);
    if (part.endsWith('leg')) return jit(hex('#e5ad3c'), r, 0.05);
    if (part.endsWith('wing')) return y >= h - 1 && f !== 'top' ? [200, 200, 196] : jit(white, r, 0.05);
    if (part === 'head' && f === 'front' && y === 1 && (x === 0 || x === 3)) return [20, 20, 20];
    return jit(white, r, 0.05);
  },
  zombie(part, f, x, y, w, h, r) {
    const skin = hex('#5e8f52'), shirt = hex('#2f8f95'), pants = hex('#463e8e');
    if (part === 'head') {
      if (f === 'top' || (f !== 'front' && f !== 'bottom' && y < 2)) return jit(mul(skin, 0.7), r, 0.1);
      if (f === 'front') {
        if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return (x === 2 || x === 5) ? [16, 14, 12] : [40, 60, 34];
        if (y === 6 && x > 1 && x < 6) return mul(skin, 0.55);
        if (y === 5 && x === 3) return mul(skin, 0.75);
      }
      return jit(skin, r, 0.1);
    }
    if (part === 'body') return (y > 9 && r() < 0.4) ? jit(skin, r, 0.1) : jit(mul(shirt, y > 10 ? 0.85 : 1), r, 0.1);
    if (part.endsWith('arm')) return y < 4 ? jit(shirt, r, 0.1) : jit(skin, r, 0.1);
    if (part.endsWith('leg')) return y >= h - 2 ? jit([56, 50, 48], r, 0.1) : jit(pants, r, 0.1);
    return null;
  },
  spider(part, f, x, y, w, h, r) {
    const body = hex('#35291f'), dark = hex('#241a14');
    if (part === 'eyes') return f === 'front' ? ((x % 2 === 0 && y === 0) || (x % 3 === 1 && y === 1) ? hex('#ff2b1e') : hex('#7a0e08')) : null;
    if (part === 'head' && f === 'front' && y === 5 && (x === 2 || x === 5)) return hex('#ff2b1e');
    if (part === 'abdomen') {
      if (f === 'top') {
        const cx = x - w / 2 + 0.5, cz = y - h / 2 + 0.5;
        if (Math.abs(cx) < 1.5 && Math.abs(cz) < 4) return jit(hex('#7a3a22'), r, 0.1);
        if (Math.abs(Math.abs(cx) - 3) < 1 && Math.abs(cz) < 2) return jit(hex('#6a3220'), r, 0.1);
      }
      return jit(mul(body, 0.95), r, 0.14);
    }
    if (part.includes('leg')) return jit(((x + y) % 4 === 0) ? mul(dark, 1.4) : dark, r, 0.1);
    return jit(body, r, 0.12);
  },
  slime(part, f, x, y, w, h, r) {
    if (part === 'shell') return [...jit(hex('#78c95c'), r, 0.06), 140];
    if (part === 'core') return [...jit(hex('#5aa844'), r, 0.06), 255];
    return [18, 52, 16, 255];
  },
};

export function playerSkin(name) {
  const r = mulberry32(hashStr(name || 'x') ^ 0x5bd1e995);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const skin = hex(pick(['#f1c7a3', '#e0ac7e', '#c68b5c', '#8d5a3b', '#f5d6bf', '#b07650']));
  const hair = hex(pick(['#2b1d14', '#5a3b22', '#a8662f', '#d9b25f', '#1a1a1a', '#7a2e1c', '#c9c9c9']));
  const shirt = hex(pick(['#b8453a', '#3a6fb8', '#3f8a4f', '#8a4fb8', '#d9a441', '#2e3b2c', '#c4c0b0', '#1f7a7a']));
  const pants = hex(pick(['#2f3a5c', '#3b3b3b', '#5c4632', '#243b2e', '#4a2f5c']));
  const eye = hex(pick(['#3a5fa8', '#4f7a3a', '#5a3b22', '#2b2b2b']));
  const stripe = r() < 0.5;
  return paintSkin('player', (part, f, x, y, w, h, rr) => {
    if (part === 'head') {
      if (f === 'top' || f === 'back' || (f !== 'front' && f !== 'bottom' && y < 3) || (f === 'front' && y < 2)) return jit(hair, rr, 0.08);
      if (f === 'front') {
        if (y === 4 && (x === 1 || x === 6)) return [245, 245, 245];
        if (y === 4 && (x === 2 || x === 5)) return eye;
        if (y === 6 && x > 2 && x < 5) return mul(skin, 0.72);
        if (y === 2 && (x === 1 || x === 2 || x === 5 || x === 6)) return mul(hair, 1.1);
      }
      return jit(skin, rr, 0.04);
    }
    if (part === 'body') {
      if (f === 'front' && y === 0 && x > 2 && x < 5) return skin;
      if (stripe && y > 4 && y < 7) return jit(mul(shirt, 0.72), rr, 0.05);
      if (y === 11) return mul(pants, 0.8);
      return jit(shirt, rr, 0.06);
    }
    if (part.endsWith('arm')) return y < 4 ? jit(shirt, rr, 0.06) : jit(skin, rr, 0.04);
    if (part.endsWith('leg')) return y >= h - 2 ? jit([48, 42, 40], rr, 0.08) : jit(pants, rr, 0.06);
    return null;
  }, hashStr(name || 'x'));
}

// ------------------------------------------------------------------ Extraction : blocs
const OLIVE = hex('#5b6640'), CONC = [168, 166, 160];
function planked(img, r, base, dir) {
  fill(img, (x, y) => {
    const k = dir ? x : y, band = Math.floor(k / 4), lk = k % 4;
    let c = jit(mul(base, 0.92 + (hashStr('p' + band) % 100) / 900), r, 0.08);
    if (lk === 3) c = mul(base, 0.62);
    return c;
  });
}
function border(img, c, w = 1) { for (let i = 0; i < 16; i++) for (let k = 0; k < w; k++) { img.set(i, k, c); img.set(i, 15 - k, c); img.set(k, i, c); img.set(15 - k, i, c); } }
tex('crate_side', (img, r) => {
  planked(img, r, hex('#a77b48'), false);
  border(img, hex('#6b4a28'), 2);
  for (let i = 2; i < 14; i++) { img.set(i, i, hex('#7d5731')); img.set(i + 1, i, hex('#7d5731')); }
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) img.set(x, y, [150, 150, 156]);
});
tex('crate_top', (img, r) => { planked(img, r, hex('#b0844f'), true); border(img, hex('#6b4a28'), 2); });
tex('milcrate_side', (img, r) => {
  planked(img, r, OLIVE, false); border(img, mul(OLIVE, 0.6), 1);
  for (let x = 1; x < 15; x++) { img.set(x, 5, mul(OLIVE, 0.72)); img.set(x, 10, mul(OLIVE, 0.72)); }
  for (const x of [3, 12]) for (let y = 6; y < 10; y++) img.set(x, y, [140, 140, 138]);
});
tex('milcrate_top', (img, r) => { planked(img, r, mul(OLIVE, 1.05), true); border(img, mul(OLIVE, 0.6), 1); for (let y = 3; y < 13; y++) img.set(7, y, mul(OLIVE, 0.7)); });
tex('milcrate_front', (img, r) => {
  T.milcrate_side(img, r);
  const st = hex('#e0c36a');
  // pochoir : flèche et chevrons
  for (let i = 0; i < 4; i++) { img.set(7 - i, 6 + i, st); img.set(8 + i, 6 + i, st); }
  for (let y = 6; y < 10; y++) { img.set(7, y, st); img.set(8, y, st); }
  for (let x = 4; x < 12; x += 2) img.set(x, 12, st);
});
tex('metal_plate', (img, r) => {
  const base = [128, 132, 136];
  fill(img, (x, y) => { let c = jit(base, r, 0.04); if (x % 4 === 0) c = mul(base, 1.14); else if (x % 4 === 3) c = mul(base, 0.8); return c; });
  for (let x = 0; x < 16; x++) { img.set(x, 0, mul(base, 0.7)); img.set(x, 15, mul(base, 0.6)); }
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { img.set(x, y, [180, 182, 186]); img.set(x + 1, y + 1, [80, 82, 86]); }
  for (let i = 0; i < 6; i++) img.set(r() * 16, r() * 16, hex('#8a5a3a'));
});
tex('medcab_front', (img, r) => {
  fill(img, (x, y) => jit([222, 224, 222], r, 0.03));
  border(img, [150, 152, 150], 1);
  for (let y = 1; y < 15; y++) img.set(8, y, [170, 172, 170]);
  const red = hex('#c8332b');
  for (let i = 3; i < 13; i++) { img.set(i, 7, red); img.set(i, 8, red); img.set(7, i, red); img.set(8, i, red); }
  img.set(6, 10, [120, 120, 120]); img.set(9, 10, [120, 120, 120]);
});
tex('safe_top', (img, r) => { fill(img, () => jit([70, 74, 80], r, 0.05)); border(img, [48, 50, 54], 1); for (let i = 1; i < 15; i++) img.set(i, 1, [96, 100, 106]); });
tex('safe_front', (img, r) => {
  T.safe_top(img, r);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) img.set(x, y, jit([84, 88, 94], r, 0.04));
  disc(img, 7.5, 8, 2.6, (x, y, d) => (d > 0.7 ? [200, 196, 180] : [130, 130, 128]));
  img.set(7, 6, [40, 40, 40]); img.set(11, 8, [200, 196, 180]); img.set(12, 8, [200, 196, 180]); img.set(12, 9, [200, 196, 180]);
});
tex('concrete', (img, r) => { noisy(img, r, CONC, 0.05, 8, 0.1); for (let i = 0; i < 14; i++) img.set(r() * 16, r() * 16, mul(CONC, r() < 0.5 ? 0.85 : 1.08)); });
tex('sandbag_side', (img, r) => {
  const base = hex('#b8a47a');
  fill(img, (x, y) => {
    const row = y >> 2, ly = y & 3, lx = (x + (row % 2 ? 4 : 0)) & 7;
    let c = jit(base, r, 0.08);
    if (ly === 3 || lx === 7) c = mul(base, 0.62);
    else if (ly === 0) c = mul(base, 1.12);
    else if (lx === 0 || lx === 6) c = mul(base, 0.85);
    return c;
  });
});
tex('sandbag_top', (img, r) => { noisy(img, r, hex('#bba97f'), 0.08, 4, 0.2); for (let x = 0; x < 16; x++) { img.set(x, 7, hex('#8a7a58')); img.set(x, 15, hex('#8a7a58')); } });
tex('pad_top', (img, r) => {
  noisy(img, r, [70, 72, 74], 0.05, 4, 0.1);
  for (let i = 0; i < 16; i++) { img.set(i, 0, hex('#e6c229')); img.set(i, 1, hex('#d9b21f')); img.set(0, i, hex('#e6c229')); img.set(1, i, hex('#d9b21f')); }
});
tex('pad_side', (img, r) => {
  T.concrete(img, r);
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) img.set(x, y, ((x + y) >> 1) % 2 ? [30, 30, 30] : hex('#e6c229'));
});
tex('flare_side', (img, r) => {
  fill(img, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (x < 2 || x > 13) return [60, 62, 66];
    return jit(d < 3 ? [255, 235, 220] : d < 6 ? [255, 70, 50] : [200, 30, 24], r, 0.05);
  });
});
tex('flare_top', (img, r) => { fill(img, (x, y) => (Math.hypot(x - 7.5, y - 7.5) < 5 ? [255, 120, 90] : [70, 72, 76])); });
tex('bricks', (img, r) => {
  const base = hex('#9a4a36');
  fill(img, (x, y) => {
    const row = y >> 2, ly = y & 3, lx = (x + (row % 2 ? 4 : 0)) & 7;
    if (ly === 3 || lx === 7) return jit([178, 170, 158], r, 0.05);
    return jit(mul(base, 0.9 + (hashStr('b' + row + ((x + (row % 2 ? 4 : 0)) >> 3)) % 100) / 400 + (ly === 0 ? 0.1 : 0)), r, 0.07);
  });
});
tex('canvas', (img, r) => { const base = hex('#6d7446'); fill(img, (x, y) => jit(mul(base, (x + y) % 2 ? 1.04 : 0.95), r, 0.05)); for (let x = 0; x < 16; x++) img.set(x, 8, mul(base, 0.75)); });
tex('storage_side', (img, r) => { planked(img, r, hex('#6e4b2a'), false); for (let y = 0; y < 16; y++) { img.set(2, y, [90, 92, 96]); img.set(13, y, [90, 92, 96]); } border(img, hex('#3f2a16'), 1); });
tex('storage_top', (img, r) => { planked(img, r, hex('#77522e'), true); border(img, hex('#3f2a16'), 1); for (let x = 1; x < 15; x++) { img.set(x, 3, [90, 92, 96]); img.set(x, 12, [90, 92, 96]); } });
tex('storage_front', (img, r) => {
  T.storage_side(img, r);
  for (let y = 6; y < 11; y++) for (let x = 6; x < 10; x++) img.set(x, y, [200, 168, 70]);
  img.set(7, 8, [40, 30, 20]); img.set(8, 8, [40, 30, 20]); img.set(7, 9, [40, 30, 20]);
});
// ------------------------------------------------------------------ Ville en ruine
const ASPH = [62, 62, 64];
function asphalt(img, r) {
  noisy(img, r, ASPH, 0.06, 4, 0.12);
  for (let i = 0; i < 22; i++) img.set(r() * 16, r() * 16, mul(ASPH, 1.25 + r() * 0.2));
  // fissures
  let x = r() * 16, y = r() * 16;
  for (let i = 0; i < 12; i++) { img.set(x, y, mul(ASPH, 0.55)); x += (r() - 0.5) * 2.2; y += r() < 0.5 ? 1 : 0; }
}
tex('asphalt', asphalt);
tex('asphalt_side', (img, r) => { T.gravel(img, r); for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) img.set(x, y, jit(ASPH, r, 0.08)); });
const LINE = hex('#d9b43a');
tex('road_lx', (img, r) => { asphalt(img, r); for (let x = 0; x < 16; x++) for (const y of [7, 8]) if (r() > 0.15) img.set(x, y, jit(LINE, r, 0.1)); });
tex('road_lz', (img, r) => { asphalt(img, r); for (let y = 0; y < 16; y++) for (const x of [7, 8]) if (r() > 0.15) img.set(x, y, jit(LINE, r, 0.1)); });
tex('sidewalk', (img, r) => {
  const base = [150, 148, 142];
  fill(img, (x, y) => ((x & 7) === 7 || (y & 7) === 7 ? mul(base, 0.68) : jit(mul(base, 0.95 + (hashStr('s' + (x >> 3) + (y >> 3)) % 100) / 900), r, 0.05)));
  for (let i = 0; i < 6; i++) img.set(r() * 16, r() * 16, [90, 96, 70]);
});
tex('rubble', (img, r) => {
  fill(img, (x, y) => {
    const k = hashStr('r' + (x >> 2) + ',' + ((y + (x >> 2)) >> 2)) % 5;
    const c = [[150, 146, 138], [120, 116, 110], [154, 84, 64], [96, 92, 86], [170, 166, 156]][k];
    return ((x + y * 3) % 7 === 0) ? [52, 50, 48] : jit(c, r, 0.1);
  });
});
tex('rust', (img, r) => {
  const n = tileNoise(r, 16, 4);
  fill(img, (x, y) => jit(mix(hex('#6e3a22'), hex('#b0623a'), cl(n[y * 16 + x] * 0.8 + 0.3)), r, 0.12));
  for (let x = 0; x < 16; x += 5) for (let y = 0; y < 16; y++) if (r() < 0.6) img.set(x, y, hex('#4a2616'));
});
function plaster(img, r, base) {
  noisy(img, r, base, 0.05, 8, 0.12);
  for (let i = 0; i < 3; i++) { const x = Math.floor(r() * 16); for (let y = Math.floor(r() * 8); y < 16; y++) if (r() < 0.8) img.set(x, y, mul(base, 0.82)); }
  let x = r() * 16, y = 0;
  for (let i = 0; i < 10; i++) { img.set(x, y, mul(base, 0.6)); x += (r() - 0.5) * 2; y += 1.4; }
}
tex('plaster', (img, r) => plaster(img, r, [192, 180, 156]));
tex('plaster2', (img, r) => plaster(img, r, [134, 144, 150]));
tex('tile_floor', (img, r) => fill(img, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? jit([170, 164, 150], r, 0.06) : jit([96, 92, 86], r, 0.06))));
tex('roof_tile', (img, r) => {
  const base = hex('#8e4a36');
  fill(img, (x, y) => {
    const row = y >> 2, lx = (x + (row % 2 ? 2 : 0)) & 3, ly = y & 3;
    if (ly === 3) return mul(base, 0.55);
    return jit(mul(base, 1.08 - lx * 0.06 + (ly === 0 ? 0.08 : 0)), r, 0.08);
  });
});
tex('tire_side', (img, r) => fill(img, (x, y) => ((x + y) % 4 === 0 ? [20, 20, 22] : jit([40, 40, 42], r, 0.1))));
tex('tire_top', (img, r) => fill(img, (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 3 ? [120, 122, 126] : d < 4 ? [70, 70, 72] : jit([36, 36, 38], r, 0.1); }));
tex('pump_side', (img, r) => { fill(img, () => jit(hex('#a3322a'), r, 0.06)); for (let y = 0; y < 16; y++) img.set(0, y, hex('#5c1c16')); });
tex('pump_front', (img, r) => {
  T.pump_side(img, r);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 13; x++) img.set(x, y, [30, 34, 30]);
  for (let x = 4; x < 11; x += 2) img.set(x, 5, [120, 180, 90]);
  for (let y = 9; y < 15; y++) img.set(11, y, [30, 30, 30]);
  for (let y = 9; y < 12; y++) for (let x = 3; x < 7; x++) img.set(x, y, [210, 206, 190]);
});
tex('barrel_side', (img, r) => {
  T.rust(img, r);
  for (let x = 0; x < 16; x++) { img.set(x, 2, hex('#3a2012')); img.set(x, 13, hex('#3a2012')); }
  for (let x = 0; x < 16; x++) if (r() < 0.5) img.set(x, 0, [255, 170, 60]);
});
tex('fire_top', (img, r) => fill(img, (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d > 6.5 ? hex('#4a2616') : jit(d < 3 ? [255, 236, 150] : [255, 130 + r() * 60, 40], r, 0.1); }));

// Matériaux des armes et effets
const MATC = { dark: [46, 48, 52], steel: [112, 116, 122], poly: [32, 32, 34], wood: [138, 86, 48], tan: [172, 150, 106], olive: [92, 102, 62], lens: [70, 140, 200], red: [255, 50, 36], lamp: [255, 250, 225], brass: [200, 162, 70] };
for (const k in MATC) tex('gm_' + k, (img, r) => { const c = MATC[k]; fill(img, (x, y) => (k === 'lamp' || k === 'red' ? c : jit(c, r, k === 'wood' ? 0.14 : 0.06))); if (k === 'wood') for (let y = 0; y < 16; y += 3) for (let x = 0; x < 16; x++) if (r() < 0.6) img.set(x, y, mul(c, 0.82)); });
tex('fx_blood', (img, r) => fill(img, () => jit([150, 16, 14], r, 0.25)));
tex('fx_tracer', (img) => fill(img, (x, y) => { const d = Math.abs(y - 7.5) / 8; return [255, 236, 160, Math.max(0, 255 * (1 - d * d * 1.6))]; }));
tex('fx_flash', (img) => fill(img, (x, y) => {
  const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const ray = Math.pow(Math.abs(Math.cos(a * 3)), 6) * 7 + 3;
  if (d > ray) return [0, 0, 0, 0];
  return [255, 230 - d * 12, 140 - d * 12, 255 - d * 18];
}));
tex('fx_smoke', (img, r) => fill(img, (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5) / 8; return d > 1 ? [0, 0, 0, 0] : [...jit([236, 90, 70], r, 0.1), 220 * (1 - d)]; }));
tex('fx_dust', (img, r) => fill(img, (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5) / 8; return d > 1 ? [0, 0, 0, 0] : [...jit([190, 184, 170], r, 0.1), 200 * (1 - d)]; }));
tex('bag', (img, r) => { noisy(img, r, hex('#4d5236'), 0.08, 4, 0.2); for (let x = 0; x < 16; x++) img.set(x, 5, hex('#33361f')); for (let y = 0; y < 16; y++) img.set(4, y, hex('#33361f')); });

// ------------------------------------------------------------------ Extraction : icônes
const BRASS = [206, 168, 74], COPPER = [196, 110, 60];
function cartridge(img, x, top, len, w, caseC, tipC, band) {
  for (let y = top; y < 15; y++) for (let k = 0; k < w; k++) {
    const t = y - top;
    let c = t < 2 ? tipC : caseC;
    if (t === 2 && band) c = band;
    if (y === 14) c = mul(caseC, 0.7);
    img.set(x + k, y, mul(c, k === 0 ? 1.2 : k === w - 1 ? 0.75 : 1));
  }
  if (w > 2) img.set(x + 1, top, mul(tipC, 1.3));
}
const ICON2 = {
  ammo9: (img) => { for (const [i, x] of [[0, 2], [1, 6], [2, 10]]) cartridge(img, x, 7 + (i % 2), 0, 3, BRASS, [150, 150, 156]); },
  ammo556: (img) => { for (const x of [2, 7, 12]) cartridge(img, x, 3, 0, 2, BRASS, COPPER); },
  ammo762: (img) => { for (const x of [1, 6, 11]) cartridge(img, x, 2, 0, 3, [150, 140, 90], COPPER); },
  ammo12: (img) => { for (const x of [2, 9]) { for (let y = 3; y < 15; y++) for (let k = 0; k < 5; k++) img.set(x + k, y, y > 11 ? mul(BRASS, k === 0 ? 1.2 : 1) : mul(hex('#b8322a'), k === 0 ? 1.25 : k === 4 ? 0.7 : 1)); } },
  ammo556ap: (img) => { for (const x of [2, 7, 12]) cartridge(img, x, 3, 0, 2, BRASS, [30, 30, 30], hex('#c8332b')); },
  ammo762ap: (img) => { for (const x of [1, 6, 11]) cartridge(img, x, 2, 0, 3, [150, 140, 90], [30, 30, 30], hex('#c8332b')); },
  helm1: (img) => { disc(img, 8, 10, 6.5, (x, y, d) => (y > 10 ? null : mul(hex('#6b7348'), 1.15 - d * 0.35))); for (let x = 2; x < 15; x++) img.set(x, 10, hex('#3f4428')); bevel(img); },
  helm2: (img) => { disc(img, 8, 10, 6.8, (x, y, d) => (y > 11 ? null : mul([56, 58, 60], 1.2 - d * 0.3))); for (let x = 3; x < 14; x++) { img.set(x, 11, [30, 30, 32]); img.set(x, 7, [90, 92, 96]); } bevel(img); },
  vest1: (img) => vestIcon(img, hex('#9c8a62')),
  vest2: (img) => vestIcon(img, hex('#5b6640'), true),
  vest3: (img) => vestIcon(img, [44, 46, 48], true, true),
  bandage: (img) => { disc(img, 7, 9, 5, (x, y, d) => (d > 0.35 ? [240, 238, 230] : [210, 200, 180])); for (let x = 10; x < 15; x++) { img.set(x, 12, [236, 232, 222]); img.set(x, 13, [220, 216, 206]); } bevel(img); },
  medkit: (img) => { for (let y = 5; y < 14; y++) for (let x = 2; x < 14; x++) img.set(x, y, mul(hex('#c8332b'), y < 7 ? 1.15 : 1)); for (let x = 5; x < 11; x++) img.set(x, 3, [40, 40, 40]); img.set(5, 4, [40, 40, 40]); img.set(10, 4, [40, 40, 40]); for (let i = 6; i < 13; i++) { img.set(i + 1, 9, [250, 250, 250]); img.set(8, i, [250, 250, 250]); } bevel(img); },
  stim: (img) => { for (let i = 0; i < 9; i++) { img.set(3 + i, 12 - i, hex('#6fc3e8')); img.set(4 + i, 12 - i, hex('#3a8fc0')); img.set(3 + i, 11 - i, [230, 240, 245]); } for (let i = 0; i < 3; i++) img.set(12 + i, 3 - i, [200, 200, 205]); img.set(2, 13, [60, 60, 64]); img.set(3, 14, [60, 60, 64]); bevel(img); },
  watch: (img) => { for (let y = 0; y < 16; y++) { img.set(7, y, [70, 50, 34]); img.set(8, y, [90, 64, 44]); } disc(img, 8, 8, 4.5, (x, y, d) => (d > 0.75 ? hex('#e6c24a') : [245, 242, 230])); img.set(8, 6, [30, 30, 30]); img.set(8, 7, [30, 30, 30]); img.set(9, 8, [30, 30, 30]); bevel(img); },
  gpu: (img) => { for (let y = 4; y < 12; y++) for (let x = 1; x < 15; x++) img.set(x, y, y < 6 ? [30, 30, 34] : [50, 52, 58]); disc(img, 5, 8, 2.4, (x, y, d) => (d < 0.3 ? [120, 120, 124] : [24, 24, 26])); disc(img, 11, 8, 2.4, (x, y, d) => (d < 0.3 ? [120, 120, 124] : [24, 24, 26])); for (let x = 3; x < 13; x++) img.set(x, 12, hex('#d6a82a')); for (let x = 2; x < 15; x++) img.set(x, 4, hex('#3fae5a')); bevel(img); },
  usb: (img) => { for (let y = 6; y < 11; y++) for (let x = 3; x < 11; x++) img.set(x, y, hex('#2f5fa8')); for (let y = 7; y < 10; y++) for (let x = 11; x < 14; x++) img.set(x, y, [190, 192, 198]); img.set(6, 8, [240, 200, 60]); img.set(7, 8, [240, 200, 60]); bevel(img); },
  battery: (img) => { for (let y = 5; y < 14; y++) for (let x = 3; x < 13; x++) img.set(x, y, [62, 74, 50]); for (const x of [5, 10]) { img.set(x, 4, [180, 180, 186]); img.set(x, 3, [180, 180, 186]); } for (let x = 4; x < 12; x++) img.set(x, 9, hex('#e0c36a')); bevel(img); },
  cigs: (img) => { for (let y = 4; y < 14; y++) for (let x = 4; x < 12; x++) img.set(x, y, y < 8 ? [240, 240, 236] : hex('#c8332b')); for (let x = 5; x < 11; x += 2) img.set(x, 3, [230, 200, 150]); bevel(img); },
  screws: (img) => { for (let y = 4; y < 15; y++) for (let x = 3; x < 13; x++) img.set(x, y, [170, 200, 210, 150]); for (let x = 3; x < 13; x++) img.set(x, 3, [130, 100, 60]); for (let i = 0; i < 16; i++) img.set(4 + (i * 7) % 8, 8 + (i * 5) % 6, [110, 112, 118]); bevel(img); },
  radio: (img) => { for (let y = 5; y < 15; y++) for (let x = 4; x < 11; x++) img.set(x, y, [40, 42, 44]); for (let y = 1; y < 5; y++) img.set(9, y, [30, 30, 30]); for (let y = 7; y < 10; y++) for (let x = 5; x < 10; x++) img.set(x, y, hex('#9fd08a')); img.set(6, 12, [150, 150, 150]); img.set(8, 12, [150, 150, 150]); bevel(img); },
  docs: (img) => { for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) img.set(x, y, hex('#d9b877')); for (let x = 2; x < 7; x++) img.set(x, 2, hex('#c9a867')); for (let x = 5; x < 12; x++) img.set(x, 8, hex('#b8322a')); for (let x = 6; x < 11; x++) img.set(x, 10, hex('#b8322a')); bevel(img); },
  stew: (img) => { for (let y = 4; y < 14; y++) for (let x = 3; x < 13; x++) img.set(x, y, y < 6 || y > 11 ? [180, 184, 190] : hex('#b86a2a')); for (let x = 5; x < 11; x++) img.set(x, 8, hex('#f0d690')); bevel(img); },
  bar: (img) => { for (let i = 0; i < 10; i++) for (let k = 0; k < 4; k++) img.set(3 + i, 10 - i * 0.5 + k, k === 0 ? hex('#f0c040') : hex('#2d5fa8')); bevel(img); },
};
function vestIcon(img, c, pouches, plate) {
  for (let y = 2; y < 15; y++) for (let x = 2; x < 14; x++) {
    if (y < 5 && x > 4 && x < 11) continue;
    if (y < 3 && (x < 3 || x > 12)) continue;
    img.set(x, y, mul(c, y < 5 ? 1.1 : 1));
  }
  if (pouches) for (const x of [3, 6, 9]) for (let y = 10; y < 14; y++) for (let k = 0; k < 3; k++) img.set(x + k, y, mul(c, k === 0 ? 1.2 : 0.85));
  if (plate) for (let y = 5; y < 9; y++) for (let x = 4; x < 12; x++) img.set(x, y, [70, 72, 76]);
  bevel(img);
}

// Vue de profil (depuis +X) d'une liste de boîtes d'arme : canon vers la droite
export function projectParts(parts, W, H, pad = 1) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of parts) { u0 = Math.min(u0, -p[5]); u1 = Math.max(u1, -p[2]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[4]); }
  const sc = Math.min((W - 2 * pad) / (u1 - u0), (H - 2 * pad) / (v1 - v0));
  const ox = (W - (u1 - u0) * sc) / 2, oy = (H - (v1 - v0) * sc) / 2;
  const img = new Img(W, H);
  const sorted = parts.slice().sort((a, b) => a[3] - b[3]);
  for (const p of sorted) {
    const c = MATC[p[6]] || MATC.dark;
    let px0 = Math.floor(ox + (-p[5] - u0) * sc), px1 = Math.round(ox + (-p[2] - u0) * sc);
    let py0 = Math.floor(oy + (v1 - p[4]) * sc), py1 = Math.round(oy + (v1 - p[1]) * sc);
    if (px1 <= px0) px1 = px0 + 1;
    if (py1 <= py0) py1 = py0 + 1;
    for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) {
      const f = y === py0 ? 1.28 : y === py1 - 1 ? 0.72 : 1;
      img.set(x, y, mul(c, f));
    }
  }
  // contour sombre
  const out = img.clone();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (img.alpha(x, y)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && img.alpha(x + dx, y + dy))) out.px(x, y, 14, 14, 16, 200);
  }
  return out;
}

// Peaux des pillards
export function banditSkin(v) {
  const pal = [
    { shirt: hex('#556b3a'), pants: hex('#3d4a2c'), mask: [30, 30, 32], camo: hex('#3f4f2a') },
    { shirt: hex('#8a7550'), pants: hex('#4a4034'), mask: [120, 120, 118], camo: hex('#6b5a3c') },
    { shirt: [48, 50, 54], pants: [36, 38, 40], mask: hex('#8a2a24'), camo: [70, 72, 76] },
  ][v % 3];
  const skin = hex(['#e0ac7e', '#c68b5c', '#8d5a3b'][v % 3]);
  return paintSkin('player', (part, f, x, y, w, h, rr) => {
    const camo = () => (rr() < 0.3 ? jit(pal.camo, rr, 0.1) : jit(pal.shirt, rr, 0.08));
    if (part === 'head') {
      if (f === 'front' && y === 4 && x > 0 && x < 7) return x === 2 || x === 5 ? [20, 20, 20] : skin;
      if (f === 'front' && y === 3 && x > 0 && x < 7) return mul(pal.mask, 0.8);
      return jit(pal.mask, rr, 0.06);
    }
    if (part === 'body') {
      if (y === 10) return [40, 34, 28];
      if (f === 'front' && y > 2 && y < 9 && (x === 1 || x === 6)) return mul(pal.shirt, 0.7);
      return camo();
    }
    if (part.endsWith('arm')) return y > 9 ? jit([40, 40, 40], rr, 0.1) : camo();
    if (part.endsWith('leg')) return y >= h - 3 ? jit([36, 30, 26], rr, 0.08) : jit(pal.pants, rr, 0.08);
    return null;
  }, 777 + v);
}

// ------------------------------------------------------------------ Icônes isométriques 32×32
function isoIcon(top, left, right) {
  const img = new Img(32, 32);
  const solve = (px, py, ax, ay, ux, uy, vx, vy) => {
    const det = ux * vy - uy * vx, dx = px - ax, dy = py - ay;
    return [(dx * vy - dy * vx) / det, (ux * dy - uy * dx) / det];
  };
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const px = x + 0.5, py = y + 0.5;
    let s, t, src, f;
    [s, t] = solve(px, py, 16, 1.5, 14, 7, -14, 7);
    if (s >= 0 && s < 1 && t >= 0 && t < 1) { src = top; f = 1; }
    else {
      [s, t] = solve(px, py, 2, 8.5, 14, 7, 0, 15.5);
      if (s >= 0 && s < 1 && t >= 0 && t < 1) { src = left; f = 0.8; }
      else {
        [s, t] = solve(px, py, 16, 15.5, 14, -7, 0, 15.5);
        if (s >= 0 && s < 1 && t >= 0 && t < 1) { src = right; f = 0.62; }
      }
    }
    if (!src) continue;
    const c = src.get(Math.min(15, Math.floor(s * 16)), Math.min(15, Math.floor(t * 16)));
    if (c[3] < 128) continue;
    img.px(x, y, c[0] * f, c[1] * f, c[2] * f, 255);
  }
  return img;
}
function scale2(src) {
  const img = new Img(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const c = src.get(x >> 1, y >> 1); if (c[3]) img.set(x, y, c, c[3]); }
  // ombre portée douce
  const out = new Img(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (img.alpha(x, y) > 100 && x + 2 < 32 && y + 2 < 32) out.px(x + 2, y + 2, 0, 0, 0, 70);
  out.blit(img, 0, 0);
  return out;
}

// ------------------------------------------------------------------ Assemblage
export function buildAssets() {
  const blockTex = {};
  const names = Object.keys(T);
  for (const n of names) {
    const img = new Img(16, 16);
    T[n](img, mulberry32(hashStr(n) ^ 0x9e3779b9));
    blockTex[n] = img;
  }
  // Fissures
  const ct = crackStages(mulberry32(1234));
  const cracks = [];
  for (let s = 0; s < 8; s++) {
    const img = new Img(16, 16);
    for (let i = 0; i < 256; i++) if (ct[i] <= s * 0.9 + 0.3) img.px(i & 15, i >> 4, 20, 16, 14, 200);
    cracks.push(img);
    blockTex['crack_' + s] = img;
  }
  // Tableau de couches pour la texture array des blocs
  const layerNames = Object.keys(blockTex), layers = {};
  layerNames.forEach((n, i) => { layers[n] = i; });
  const layerImgs = layerNames.map((n) => blockTex[n]);
  // face → couche (ordre des faces : +y, -y, +z, -z, +x, -x)
  const faceLayer = new Uint16Array(256 * 6);
  for (const b of BLOCKS) {
    if (!b || !b.tex) continue;
    const t = b.tex;
    const f = [t.top, t.bottom, t.front, t.front, t.side, t.side];
    for (let i = 0; i < 6; i++) faceLayer[b.id * 6 + i] = layers[f[i]] ?? 0;
  }

  // Icônes d'objets
  for (const k in ICON_FN) { const img = new Img(16, 16); ICON_FN[k](img, mulberry32(hashStr(k))); ICON[k] = img; }
  for (const k in ICON2) { const img = new Img(16, 16); ICON2[k](img, mulberry32(hashStr(k))); ICON[k] = img; }
  const itemImg = {}, bigIcon = {};
  for (const it of ITEMS) {
    if (!it || it.block) continue;
    if (it.tool) itemImg[it.id] = toolIcon(it.tool.kind, it.material);
    else if (it.gun) { const parts = gunGeometry({ id: it.id, m: {} }).parts; itemImg[it.id] = projectParts(parts, 16, 16, 0); bigIcon[it.id] = projectParts(parts, 32, 32, 1); }
    else if (it.mod) { const parts = modParts(it.id, it.mod.fits[0]); itemImg[it.id] = projectParts(parts, 16, 16, 2); bigIcon[it.id] = projectParts(parts, 32, 32, 4); }
    else itemImg[it.id] = ICON[it.icon] || ICON.stick;
  }

  // Atlas 2D (entités, objets au sol, particules) : 16×16 tuiles de 16 px
  const atlas = new Img(256, 256), tile = {};
  let n = 0;
  const put = (key, img) => { const tx = n % 16, ty = Math.floor(n / 16); atlas.blit(img, tx * 16, ty * 16); tile[key] = [tx * 16, ty * 16]; n++; };
  for (const nm of layerNames) put(nm, blockTex[nm]);
  for (const id in itemImg) put('item:' + id, itemImg[id]);
  // sprite plat d'un objet (clé de tuile) — null pour les blocs cubiques
  const spriteTile = {};
  const flatAlpha = {};
  for (const it of ITEMS) {
    if (!it) continue;
    if (!it.block) spriteTile[it.id] = 'item:' + it.id;
    else { const b = BLOCKS[it.id]; if (b.render === 'cross' || b.render === 'torch') spriteTile[it.id] = b.tex.side; }
  }
  for (const id in spriteTile) {
    const key = spriteTile[id], [ax, ay] = tile[key];
    flatAlpha[id] = (x, y) => atlas.alpha(ax + x, ay + y);
  }

  // Icônes 32 px pour l'interface
  const iconIndex = {}, ids = [];
  for (const it of ITEMS) if (it) ids.push(it.id);
  const COLS = 16, rows = Math.ceil(ids.length / COLS);
  const icons = new Img(COLS * 32, rows * 32);
  ids.forEach((id, i) => {
    iconIndex[id] = i;
    const it = ITEMS[id];
    let img;
    if (it.block) {
      const b = BLOCKS[id];
      if (b.render === 'cross' || b.render === 'torch') img = scale2(blockTex[b.tex.side]);
      else img = isoIcon(blockTex[b.tex.top], blockTex[b.tex.front], blockTex[b.tex.side]);
    } else img = bigIcon[id] || scale2(itemImg[id]);
    icons.blit(img, (i % COLS) * 32, Math.floor(i / COLS) * 32);
  });

  // Peaux des créatures
  const skins = {};
  for (const t of ['pig', 'sheep', 'chicken', 'zombie', 'spider', 'slime']) skins[t] = paintSkin(t, PAINT[t]);
  for (let v = 0; v < 3; v++) skins['bandit' + v] = banditSkin(v);

  return { blockTex, layers, layerImgs, faceLayer, atlas, tile, spriteTile, flatAlpha, icons, iconIndex, iconCols: COLS, skins };
}

// Petites images d'interface (cœurs, cuisses) — 9×9 dessinées en pixel art
const HEART = [
  '.##...##.',
  '#oo#.#oo#',
  '#ooo#ooo#',
  '#ooooooo#',
  '.#ooooo#.',
  '..#ooo#..',
  '...#o#...',
  '....#....',
];
const FOOD = [
  '.....###.',
  '....#ooo#',
  '...#oooo#',
  '..#oooo#.',
  '.#oooo#..',
  '#bb##.#..',
  '#b#......',
  '.#.......',
];
export function hudSprite(kind, state) {
  // state : 'full' | 'half' | 'empty'
  const g = kind === 'heart' ? HEART : FOOD;
  const img = new Img(9, 8);
  const full = kind === 'heart' ? hex('#c8453b') : hex('#b5773a');
  const emptyC = [40, 34, 30];
  g.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '#') img.set(x, y, [26, 20, 18]);
      else if (c === 'o' || c === 'b') {
        const filled = state === 'full' || (state === 'half' && x < 5);
        let col = c === 'b' ? [236, 230, 216] : (filled ? full : emptyC);
        if (filled && c === 'o' && y < 3 && x < 4) col = mul(col, 1.3);
        img.set(x, y, col);
      }
    }
  });
  return img;
}

export { hex, TIERS, toolId, I, B };
