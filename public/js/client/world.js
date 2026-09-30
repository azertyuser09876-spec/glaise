// Monde côté client : génération locale déterministe (même graine que le serveur) + modifications.
import { WorldGen, bidx, BIOME_NAMES } from '../shared/worldgen.js';
import { B, BLOCKS, SOLID, CHUNK, HEIGHT } from '../shared/blocks.js';
import { EMIT } from './mesher.js';

const key = (cx, cz) => cx + ',' + cz;

export class ClientWorld {
  constructor(seed, edits, mesher, renderer) {
    this.gen = new WorldGen(seed);
    this.mesher = mesher;
    this.renderer = renderer;
    this.chunks = new Map();
    this.edits = new Map();
    for (const k in edits || {}) {
      const m = new Map();
      for (const i in edits[k]) m.set(+i, edits[k][i]);
      this.edits.set(k, m);
    }
    this.dirty = new Set();
    this.radius = 6;
    this.center = [0, 0];
    this.genQueue = [];
    this.stats = { gen: 0, mesh: 0 };
  }

  chunk(cx, cz) { return this.chunks.get(key(cx, cz)); }

  generate(cx, cz) {
    const k = key(cx, cz);
    let c = this.chunks.get(k);
    if (c) return c;
    const data = this.gen.generate(cx, cz);
    const e = this.edits.get(k);
    if (e) for (const [i, id] of e) data[i] = id;
    let nLights = 0;
    for (let i = 0; i < data.length; i++) if (EMIT[data[i]]) nLights++;
    c = { cx, cz, key: k, data, nLights, mesh: null, hm: null, blight: null, torches: [], meshed: false };
    this.chunks.set(k, c);
    this.stats.gen++;
    return c;
  }

  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const c = this.chunks.get(key(x >> 4, z >> 4));
    if (!c) return -1;
    return c.data[bidx(x & 15, y, z & 15)];
  }

  loaded(x, z) { return this.chunks.has(key(Math.floor(x) >> 4, Math.floor(z) >> 4)); }

  solid(x, y, z) {
    const id = this.get(x, y, z);
    return id < 0 ? true : SOLID[id] === 1;
  }

  // Lumière (0..1) du ciel et des torches à une position
  light(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const c = this.chunks.get(key(x >> 4, z >> 4));
    if (!c || !c.hm) return [1, 0];
    const lx = x & 15, lz = z & 15, h = c.hm[lx + lz * 16];
    const sky = y >= h ? 1 : Math.max(0, 1 - (h - y) * 0.14);
    let blk = 0;
    if (c.blight && y >= 0 && y < HEIGHT) blk = c.blight[bidx(lx, y, lz)] / 15;
    return [sky, blk];
  }

  biome(x, z) { return BIOME_NAMES[this.gen.biomeAt(Math.floor(x), Math.floor(z))]; }

  set(x, y, z, id) {
    if (y < 0 || y >= HEIGHT) return;
    const cx = x >> 4, cz = z >> 4, k = key(cx, cz), i = bidx(x & 15, y, z & 15);
    let e = this.edits.get(k);
    if (!e) { e = new Map(); this.edits.set(k, e); }
    e.set(i, id);
    const c = this.chunks.get(k);
    if (!c) return;
    const old = c.data[i];
    if (old === id) return;
    c.data[i] = id;
    if (EMIT[old]) c.nLights--;
    if (EMIT[id]) c.nLights++;
    const lx = x & 15, lz = z & 15;
    const lightChange = EMIT[old] || EMIT[id] || this.nearLight(cx, cz);
    // tronçon courant tout de suite, voisins ensuite
    this.remesh(c, true);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const edge = (dx === -1 ? lx === 0 : dx === 1 ? lx === 15 : true) && (dz === -1 ? lz === 0 : dz === 1 ? lz === 15 : true);
      if (edge || lightChange) { const n = this.chunks.get(key(cx + dx, cz + dz)); if (n && n.meshed) this.dirty.add(n); }
    }
  }

  nearLight(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = this.chunks.get(key(cx + dx, cz + dz)); if (n && n.nLights > 0) return true; }
    return false;
  }

  neighborsReady(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.chunks.has(key(cx + dx, cz + dz))) return false;
    return true;
  }

  remesh(c, now) {
    if (!now) { this.dirty.add(c); return; }
    if (!this.neighborsReady(c.cx, c.cz)) return;
    const t0 = performance.now();
    const r = this.mesher.build((dx, dz) => this.chunks.get(key(c.cx + dx, c.cz + dz)), c.cx, c.cz);
    this.stats.mesh++;
    this.stats.meshMs = performance.now() - t0;
    c.hm = r.hm; c.blight = r.blight; c.torches = r.torches;
    this.renderer.uploadChunk(c, r);
    c.meshed = true;
    this.dirty.delete(c);
  }

  // Charge / maille / décharge autour de (px, pz) avec un budget de temps en ms
  update(px, pz, budget) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4, R = this.radius;
    const t0 = performance.now();
    // tronçons modifiés en priorité
    for (const c of this.dirty) {
      this.remesh(c, true);
      if (performance.now() - t0 > budget) return;
    }
    // candidats triés par distance
    if (pcx !== this.center[0] || pcz !== this.center[1] || !this.order || this.orderR !== R) {
      this.center = [pcx, pcz]; this.orderR = R;
      const list = [];
      for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
        const d = dx * dx + dz * dz;
        if (d <= (R + 1.5) * (R + 1.5)) list.push([d, dx, dz]);
      }
      list.sort((a, b) => a[0] - b[0]);
      this.order = list;
      // déchargement
      for (const c of this.chunks.values()) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > (R + 3) * (R + 3)) {
          this.renderer.freeChunk(c);
          this.chunks.delete(c.key);
          this.dirty.delete(c);
        }
      }
    }
    for (const [d, dx, dz] of this.order) {
      const cx = pcx + dx, cz = pcz + dz;
      if (!this.chunks.has(key(cx, cz))) {
        this.generate(cx, cz);
        if (performance.now() - t0 > budget) return;
      }
      if (d > (R + 0.5) * (R + 0.5)) continue;
      const c = this.chunks.get(key(cx, cz));
      if (!c.meshed) {
        let ok = true;
        for (let oz = -1; oz <= 1 && ok; oz++) for (let ox = -1; ox <= 1; ox++) {
          if (!this.chunks.has(key(cx + ox, cz + oz))) { this.generate(cx + ox, cz + oz); if (performance.now() - t0 > budget) return; }
        }
        this.remesh(c, true);
        if (performance.now() - t0 > budget) return;
      }
    }
  }

  // Nombre de tronçons prêts autour du joueur (pour l'écran de chargement)
  readyAround(px, pz, r) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    let n = 0, t = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { t++; const c = this.chunk(pcx + dx, pcz + dz); if (c && c.meshed) n++; }
    return n / t;
  }

  // Lancer de rayon voxel (DDA). Renvoie { x, y, z, id, nx, ny, nz, dist } ou null.
  raycast(ox, oy, oz, dx, dy, dz, maxD, pick) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity, tdz = dz ? Math.abs(1 / dz) : Infinity;
    let tx = dx ? (sx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
    let ty = dy ? (sy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
    let tz = dz ? (sz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    const steps = 200 + Math.ceil(maxD * 3);
    for (let i = 0; i < steps; i++) {
      const id = this.get(x, y, z);
      if (id > 0 && pick(id)) {
        const b = BLOCKS[id];
        // boîtes réduites pour plantes / torches
        if (b.render === 'cross' || b.render === 'torch') {
          const m = b.render === 'torch' ? 0.38 : 0.15, top = b.render === 'torch' ? 0.65 : 0.9;
          const hit = rayBox(ox, oy, oz, dx, dy, dz, x + m, y, z + m, x + 1 - m, y + top, z + 1 - m);
          if (hit !== null && hit <= maxD) return { x, y, z, id, nx: 0, ny: 1, nz: 0, dist: hit };
        } else return { x, y, z, id, nx, ny, nz, dist: t };
      }
      if (tx < ty && tx < tz) { t = tx; if (t > maxD) break; x += sx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { t = ty; if (t > maxD) break; y += sy; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { t = tz; if (t > maxD) break; z += sz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}

// Intersection rayon / boîte, renvoie la distance d'entrée ou null
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return null; continue; }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
