// Génération procédurale déterministe du terrain.
import { Simplex, hash2, hash3, mulberry32 } from './noise.js';
import { B, CHUNK, HEIGHT, SEA, CHUNK_VOL } from './blocks.js';

export const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, TUNDRA: 5, MOUNTAIN: 6 };
export const BIOME_NAMES = ['Océan', 'Plage', 'Plaine', 'Forêt', 'Désert', 'Toundra', 'Montagne'];
export const STRUCT_NAMES = { house: 'Maison abandonnée', camp: 'Camp militaire', bunker: 'Bunker', extract: "Zone d'extraction" };
export const LOT_NAMES = { tower: 'Immeuble', block: 'Résidence', shops: 'Commerces', houses: 'Pavillons', station: 'Station-service', parking: 'Parking', ruin: 'Ruines', park: 'Square' };
const TOWN_A = ['Saint-', 'Val-', 'Mont-', 'Port-', 'Vieux-', 'Haute-', 'Basse-', 'Fort-', 'Pont-', 'Bois-', 'Clos-'];
const TOWN_B = ['Rouille', 'Cendres', 'Oubli', 'Poussière', 'Ferraille', 'Silence', 'Brûlé', 'Grisaille', 'Moulin', 'Noirval', 'Carrière', 'Friche', 'Charbon', 'Sombre'];
const TOWN_CELL = 512;

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const bidx = (x, y, z) => x + (z << 4) + (y << 8);

const TREE_DENSITY = [0, 0, 0.006, 0.045, 0.008, 0.02, 0.012];
const BORDER = 3, CW = CHUNK + BORDER * 2;

export class WorldGen {
  constructor(seed) {
    this.seed = seed | 0;
    const s = this.seed;
    this.nCont = new Simplex(s + 11); this.nHill = new Simplex(s + 22); this.nMount = new Simplex(s + 33);
    this.nTemp = new Simplex(s + 44); this.nHum = new Simplex(s + 55); this.nRiver = new Simplex(s + 66);
    this.nCave1 = new Simplex(s + 77); this.nCave2 = new Simplex(s + 88); this.nCave3 = new Simplex(s + 99);
    this.nDetail = new Simplex(s + 111);
    this._H = new Int16Array(CW * CW); this._B = new Uint8Array(CW * CW);
  }

  fbm(n, x, z, oct) {
    let s = 0, a = 1, f = 1, t = 0;
    for (let i = 0; i < oct; i++) { s += a * n.noise2(x * f, z * f); t += a; a *= 0.5; f *= 2.03; }
    return s / t;
  }

  // Renvoie hauteur | (biome << 8), villes comprises (terrain aplani)
  column(x, z) {
    const c = this.rawColumn(x, z);
    const ti = this.townInfo(x, z);
    if (!ti) return c;
    const h = Math.round((c & 255) + (ti.t.base - (c & 255)) * ti.w);
    let b = c >> 8;
    if (h > SEA && (b === BIOME.OCEAN || b === BIOME.BEACH)) b = BIOME.PLAINS;
    if (ti.w > 0.5 && (b === BIOME.TUNDRA || b === BIOME.MOUNTAIN)) b = BIOME.PLAINS;
    return h | (b << 8);
  }

  // Terrain naturel, sans les villes
  rawColumn(x, z) {
    const c = this.fbm(this.nCont, x * 0.0016, z * 0.0016, 3) * 1.3;
    const hills = this.fbm(this.nHill, x * 0.009, z * 0.009, 4);
    const ridge = Math.max(0, 1 - Math.abs(this.fbm(this.nMount, x * 0.004, z * 0.004, 4)) * 2.2);
    const temp = this.fbm(this.nTemp, x * 0.0012 + 50, z * 0.0012, 2) * 1.4;
    const hum = this.fbm(this.nHum, x * 0.0014, z * 0.0014 - 70, 2) * 1.4;
    let h = SEA + 5 + c * 16 + hills * (5 + Math.max(0, c) * 8);
    const m = smooth(0.1, 0.45, c);
    h += m * ridge * ridge * 40;
    const rv = Math.abs(this.fbm(this.nRiver, x * 0.0021, z * 0.0021, 2));
    if (rv < 0.02 && h < SEA + 14) {
      const k = Math.min(1, (1 - rv / 0.02) * 1.6);
      h += (SEA - 3 - h) * k * (1 - m);
    }
    h = Math.max(4, Math.min(HEIGHT - 10, Math.floor(h)));
    let b;
    if (h < SEA - 1) b = BIOME.OCEAN;
    else if (h <= SEA && temp > -0.4) b = BIOME.BEACH;
    else if (h > SEA + 28) b = temp < -0.15 ? BIOME.TUNDRA : BIOME.MOUNTAIN;
    else if (temp < -0.4) b = BIOME.TUNDRA;
    else if (temp > 0.3 && hum < 0.0) b = BIOME.DESERT;
    else if (hum > 0.12) b = BIOME.FOREST;
    else b = BIOME.PLAINS;
    return h | (b << 8);
  }

  biomeAt(x, z) { return this.column(x, z) >> 8; }

  treeAt(wx, wz, biome, h) {
    if (h <= SEA || biome === BIOME.BEACH || biome === BIOME.OCEAN) return false;
    const ti = this.townInfo(wx, wz);
    if (ti && ti.w > 0.15) return false;
    if (biome === BIOME.MOUNTAIN && h > SEA + 34) return false;
    return hash2(wx, wz, this.seed + 7) < TREE_DENSITY[biome];
  }

  generate(cx, cz) {
    const data = new Uint8Array(CHUNK_VOL);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const H = this._H, BI = this._B;
    for (let lz = 0; lz < CW; lz++) for (let lx = 0; lx < CW; lx++) {
      const c = this.column(x0 + lx - BORDER, z0 + lz - BORDER);
      H[lz * CW + lx] = c & 255; BI[lz * CW + lx] = c >> 8;
    }
    const seed = this.seed;

    // ---- terrain de base + grottes
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const ci = (lz + BORDER) * CW + lx + BORDER;
      const h = H[ci], biome = BI[ci];
      const wx = x0 + lx, wz = z0 + lz;
      const slope = Math.max(Math.abs(H[ci + 1] - H[ci - 1]), Math.abs(H[ci + CW] - H[ci - CW]));
      let top = B.GRASS, fill = B.DIRT, fillDepth = 3;
      if (biome === BIOME.DESERT) { top = B.SAND; fill = B.SAND; fillDepth = 4; }
      else if (biome === BIOME.BEACH) { top = B.SAND; fill = B.SAND; }
      else if (biome === BIOME.OCEAN) {
        const g = this.nDetail.noise2(wx * 0.06, wz * 0.06) > 0.25;
        top = g ? B.GRAVEL : B.SAND; fill = top;
      } else if (biome === BIOME.TUNDRA) { top = h > SEA + 34 ? B.SNOW : B.SNOW_GRASS; }
      else if (biome === BIOME.MOUNTAIN) { if (h > SEA + 36) top = B.SNOW; }
      if (slope >= 4 && biome !== BIOME.DESERT && biome !== BIOME.BEACH && biome !== BIOME.OCEAN) {
        top = B.STONE; fill = B.STONE;
      }
      if (h < SEA && top === B.GRASS) { top = B.DIRT; }
      const bedrockH = 1 + (hash2(wx, wz, seed + 3) < 0.5 ? 1 : 0);
      const maxY = Math.max(h, SEA);
      for (let y = 0; y <= maxY; y++) {
        let id;
        if (y <= bedrockH && (y === 0 || hash3(wx, y, wz, seed) < 0.6)) id = B.BEDROCK;
        else if (y < h - fillDepth) id = (biome === BIOME.DESERT && y >= h - fillDepth - 3) ? B.SANDSTONE : B.STONE;
        else if (y < h) id = fill;
        else if (y === h) id = top;
        else id = B.WATER;
        data[bidx(lx, y, lz)] = id;
      }
      // grottes
      const hasTree = this.treeAt(wx, wz, biome, h);
      const town = this.townInfo(wx, wz);
      const carveTop = hasTree || town ? h - 6 : (h > SEA + 1 ? h : h - 6);
      for (let y = 2; y <= carveTop; y++) {
        const i = bidx(lx, y, lz);
        const cur = data[i];
        if (cur === B.WATER || cur === B.BEDROCK || cur === B.AIR) continue;
        const n1 = this.nCave1.noise3(wx * 0.021, y * 0.034, wz * 0.021);
        let carve = false;
        if (Math.abs(n1) < 0.09) {
          const n2 = this.nCave2.noise3(wx * 0.021, y * 0.034, wz * 0.021);
          carve = n1 * n1 + n2 * n2 < 0.0048;
        }
        if (!carve && y < 36) {
          const n3 = this.nCave3.noise3(wx * 0.017, y * 0.03, wz * 0.017);
          carve = n3 > 0.64 - (36 - y) * 0.004;
        }
        if (carve) data[i] = B.AIR;
      }
      // ne pas laisser d'herbe sous un bloc (grotte à ciel ouvert)
    }

    // ---- minerais (filons)
    const rnd = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ seed) | 0);
    const ORES = [[B.COAL_ORE, 18, 9, 80], [B.IRON_ORE, 12, 6, 54], [B.GOLD_ORE, 3, 5, 30], [B.DIAMOND_ORE, 2, 4, 16], [B.GRAVEL, 4, 14, 60], [B.DIRT, 4, 14, 60]];
    for (const [ore, count, size, ymax] of ORES) {
      for (let v = 0; v < count; v++) {
        let x = Math.floor(rnd() * 16), y = 3 + Math.floor(rnd() * (ymax - 3)), z = Math.floor(rnd() * 16);
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < HEIGHT) {
            const i = bidx(x, y, z);
            if (data[i] === B.STONE) data[i] = ore;
          }
          const d = Math.floor(rnd() * 6);
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else if (d === 3) z--; else if (d === 4) y++; else y--;
        }
      }
    }

    // ---- arbres (incluant ceux des colonnes voisines qui débordent)
    for (let lz = -BORDER; lz < CHUNK + BORDER; lz++) for (let lx = -BORDER; lx < CHUNK + BORDER; lx++) {
      const ci = (lz + BORDER) * CW + lx + BORDER;
      const h = H[ci], biome = BI[ci];
      const wx = x0 + lx, wz = z0 + lz;
      if (!this.treeAt(wx, wz, biome, h)) continue;
      if (h + 12 >= HEIGHT) continue;
      const r = hash2(wx, wz, seed + 13);
      if (biome === BIOME.DESERT) {
        if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK) continue;
        if (data[bidx(lx, h, lz)] !== B.SAND) continue;
        const ch = 1 + Math.floor(r * 3);
        for (let y = h + 1; y <= h + ch; y++) data[bidx(lx, y, lz)] = B.CACTUS;
      } else if (biome === BIOME.TUNDRA || biome === BIOME.MOUNTAIN) {
        this.spruce(data, lx, h + 1, lz, 6 + Math.floor(r * 4), wx, wz);
      } else {
        this.oak(data, lx, h + 1, lz, 4 + Math.floor(r * 3), wx, wz);
      }
    }

    // ---- plantes
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const ci = (lz + BORDER) * CW + lx + BORDER;
      const h = H[ci], biome = BI[ci];
      if (h + 1 >= HEIGHT) continue;
      const below = data[bidx(lx, h, lz)], above = bidx(lx, h + 1, lz);
      if (data[above] !== B.AIR) continue;
      const wx = x0 + lx, wz = z0 + lz;
      const r = hash2(wx, wz, seed + 21);
      if (below === B.GRASS) {
        const inTown = this.townInfo(wx, wz);
        const tg = inTown ? 0.08 : biome === BIOME.PLAINS ? 0.2 : biome === BIOME.FOREST ? 0.1 : 0.05;
        const fl = inTown ? 0 : biome === BIOME.PLAINS ? 0.012 : 0.006;
        if (r < fl) data[above] = hash2(wx, wz, seed + 5) < 0.5 ? B.POPPY : B.DANDELION;
        else if (r < fl + tg) data[above] = B.TALL_GRASS;
      } else if (below === B.SAND && biome === BIOME.DESERT && r < 0.012) {
        data[above] = B.DEAD_BUSH;
      }
    }
    // ---- villes en ruine
    this.stampTown(data, x0, z0, H);
    // ---- points d'intérêt (bâtiments, camps, bunkers, zones d'extraction)
    const st = this.structureAt(cx >> 2, cz >> 2);
    if (st) this.stamp(st, data, x0, z0);
    return data;
  }

  // ------------------------------------------------------------------ Points d'intérêt
  // Le monde est découpé en régions de 64×64 blocs ; chaque région contient au plus une structure,
  // entièrement incluse dans la région (un tronçon n'a donc qu'une région à consulter).
  structureAt(rx, rz) {
    const key = rx + ',' + rz;
    if (!this._st) this._st = new Map();
    if (this._st.has(key)) return this._st.get(key);
    const st = this._structure(rx, rz);
    if (this._st.size > 4000) this._st.clear();
    this._st.set(key, st);
    return st;
  }

  _structure(rx, rz) {
    const seed = this.seed;
    const [ex, ez] = this.extractRegion(Math.floor(rx / 5), Math.floor(rz / 5));
    let type = null;
    if (rx === ex && rz === ez) type = 'extract';
    else {
      const r = hash2(rx, rz, seed + 501);
      if (r < 0.34) type = 'house'; else if (r < 0.44) type = 'camp'; else if (r < 0.5) type = 'bunker';
    }
    if (!type) return null;
    if (this.townInfo(rx * 64 + 32, rz * 64 + 32) || this.nearTown(rx * 64 + 32, rz * 64 + 32, 70)) return null;
    const dims = { house: [9, 7], camp: [15, 15], bunker: [11, 14], extract: [11, 11] }[type];
    let [w, d] = dims;
    if (type === 'house' && hash2(rx, rz, seed + 503) < 0.5) [w, d] = [d, w];
    const x0 = rx * 64 + 4 + Math.floor(hash2(rx, rz, seed + 504) * (56 - w));
    const z0 = rz * 64 + 4 + Math.floor(hash2(rx, rz, seed + 505) * (56 - d));
    const cx = x0 + (w >> 1), cz = z0 + (d >> 1);
    const c = this.column(cx, cz);
    let y = c & 255;
    const biome = c >> 8;
    if (type === 'extract') y = Math.max(y, SEA + 1);
    else {
      if (y <= SEA + 1 || biome === BIOME.OCEAN || y > HEIGHT - 18) return null;
      let lo = y, hi = y;
      for (const [px, pz] of [[x0, z0], [x0 + w - 1, z0], [x0, z0 + d - 1], [x0 + w - 1, z0 + d - 1]]) {
        const h = this.column(px, pz) & 255; lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      if (hi - lo > 7 || lo <= SEA) return null;
      if (type === 'bunker' && y - 8 < 5) return null;
    }
    const st = { type, rx, rz, x0, z0, w, d, y, cx: cx + 0.5, cz: cz + 0.5, name: STRUCT_NAMES[type], v: hash2(rx, rz, seed + 506), spawns: [] };
    if (type === 'house') st.spawns.push([cx, y + 1, cz]);
    else if (type === 'camp') st.spawns.push([x0 + 4, y + 1, z0 + 10], [x0 + 7, y + 1, z0 + 7], [x0 + 11, y + 1, z0 + 4], [x0 + 2, y + 1, z0 + 12]);
    else if (type === 'bunker') st.spawns.push([x0 + 3, y - 7, z0 + 9], [x0 + 7, y - 7, z0 + 10], [x0 + 5, y - 7, z0 + 12]);
    return st;
  }

  // ------------------------------------------------------------------ Villes en ruine
  // Une ville au plus par cellule de 512×512 blocs, entièrement incluse dans sa cellule (aplanissement compris).
  townAtCell(tx, tz) {
    const key = tx + ',' + tz;
    if (!this._tw) this._tw = new Map();
    if (this._tw.has(key)) return this._tw.get(key);
    let t = null;
    const sd = this.seed;
    if (hash2(tx, tz, sd + 701) < 0.72) {
      const cx = tx * TOWN_CELL + 192 + Math.floor(hash2(tx, tz, sd + 702) * 4) * 32;
      const cz = tz * TOWN_CELL + 192 + Math.floor(hash2(tx, tz, sd + 703) * 4) * 32;
      let R = 96 + Math.floor(hash2(tx, tz, sd + 704) * 60);
      const c = this.rawColumn(cx, cz), base = Math.max(c & 255, SEA + 3);
      if ((c & 255) > SEA - 4 && (c & 255) < SEA + 26) {
        while (R >= 64) {
          let wet = 0, steep = 0;
          for (let k = 0; k < 12; k++) {
            const a = k / 12 * Math.PI * 2, h = this.rawColumn(cx + Math.cos(a) * R * 0.85, cz + Math.sin(a) * R * 0.85) & 255;
            if (h < SEA - 3) wet++;
            if (Math.abs(h - base) > 26) steep++;
          }
          if (wet <= 3 && steep <= 1) break;
          R -= 16;
        }
        if (R >= 64) t = { tx, tz, cx, cz, R, base, name: TOWN_A[Math.floor(hash2(tx, tz, sd + 705) * TOWN_A.length)] + TOWN_B[Math.floor(hash2(tx, tz, sd + 707) * TOWN_B.length)], v: hash2(tx, tz, sd + 706) };
      }
    }
    this._tw.set(key, t);
    return t;
  }
  // { t, d, w } : ville, distance au centre, poids d'aplanissement (1 = plat)
  townInfo(x, z) {
    const t = this.townAtCell(Math.floor(x / TOWN_CELL), Math.floor(z / TOWN_CELL));
    if (!t) return null;
    const d = Math.hypot(x - t.cx, z - t.cz);
    if (d > t.R + 36) return null;
    return { t, d, w: 1 - smooth(t.R - 6, t.R + 36, d) };
  }
  nearTown(x, z, margin) {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = this.townAtCell(Math.floor(x / TOWN_CELL) + dx, Math.floor(z / TOWN_CELL) + dz);
      if (t && Math.hypot(x - t.cx, z - t.cz) < t.R + margin) return t;
    }
    return null;
  }
  townsNear(x, z, r) {
    const out = [];
    for (let tz = Math.floor((z - r) / TOWN_CELL); tz <= Math.floor((z + r) / TOWN_CELL); tz++) for (let tx = Math.floor((x - r) / TOWN_CELL); tx <= Math.floor((x + r) / TOWN_CELL); tx++) {
      const t = this.townAtCell(tx, tz);
      if (t && Math.hypot(t.cx - x, t.cz - z) < r + t.R) out.push(t);
    }
    return out;
  }

  // Parcelle de la ville (cellule de 32×32 : rue sur les 5 premières lignes, trottoir, puis 25×25 constructibles)
  lotAt(gx, gz) {
    const key = 'L' + gx + ',' + gz;
    if (!this._tw) this._tw = new Map();
    if (this._tw.has(key)) return this._tw.get(key);
    let lot = null;
    const cx = gx * 32 + 18, cz = gz * 32 + 18;
    const t = this.townAtCell(Math.floor(cx / TOWN_CELL), Math.floor(cz / TOWN_CELL));
    if (t) {
      const d = Math.hypot(cx - t.cx, cz - t.cz);
      const far = Math.max(...[[6, 6], [30, 6], [6, 30], [30, 30]].map(([a, b]) => Math.hypot(gx * 32 + a - t.cx, gz * 32 + b - t.cz)));
      if (far < t.R - 7) {
        const k = d / t.R, r = hash2(gx, gz, this.seed + 711), v = hash2(gx, gz, this.seed + 712);
        let type;
        if (k < 0.42) type = r < 0.58 ? 'tower' : r < 0.88 ? 'shops' : 'ruin';
        else if (k < 0.75) type = r < 0.3 ? 'block' : r < 0.5 ? 'shops' : r < 0.6 ? 'station' : r < 0.74 ? 'parking' : r < 0.9 ? 'houses' : 'ruin';
        else type = r < 0.5 ? 'houses' : r < 0.62 ? 'park' : r < 0.72 ? 'parking' : r < 0.8 ? 'station' : 'ruin';
        let floors = type === 'tower' ? 4 + Math.floor(v * 4) : type === 'block' ? 2 + Math.floor(v * 3) : type === 'shops' ? 2 : 1;
        while (t.base + 4 * floors + 3 >= HEIGHT - 1) floors--;
        lot = {
          type, gx, gz, x0: gx * 32, z0: gz * 32, F: t.base, floors, v, v2: hash2(gx, gz, this.seed + 713), town: t.name,
          name: LOT_NAMES[type], cx: cx + 0.5, cz: cz + 0.5, spawns: [],
        };
        const X0 = lot.x0 + 6, Z0 = lot.z0 + 6, F = lot.F;
        if (type === 'tower' || type === 'block') for (let f = 0; f < floors; f++) lot.spawns.push([X0 + 8 + (f % 3) * 4, F + 1 + 4 * f, Z0 + 8]);
        else if (type === 'shops') lot.spawns.push([X0 + 10, F + 1, Z0 + 6], [X0 + 14, F + 5, Z0 + 6]);
        else if (type === 'houses') lot.spawns.push([X0 + 6, F + 1, Z0 + 7], [X0 + 18, F + 1, Z0 + 17]);
        else if (type === 'station') lot.spawns.push([X0 + 9, F + 1, Z0 + 12], [X0 + 20, F + 1, Z0 + 7]);
        else lot.spawns.push([X0 + 12, F + 1, Z0 + 12]);
      }
    }
    if (this._tw.size > 6000) this._tw.clear();
    this._tw.set(key, lot);
    return lot;
  }
  lotsNear(x, z, r) {
    const out = [];
    for (let gz = Math.floor((z - r) / 32); gz <= Math.floor((z + r) / 32); gz++) for (let gx = Math.floor((x - r) / 32); gx <= Math.floor((x + r) / 32); gx++) {
      if (!this.nearTown(gx * 32 + 16, gz * 32 + 16, 0)) continue;
      const l = this.lotAt(gx, gz);
      if (l && Math.hypot(l.cx - x, l.cz - z) <= r) out.push(l);
    }
    return out;
  }

  stampTown(data, x0, z0, H) {
    const t = this.townAtCell(Math.floor((x0 + 8) / TOWN_CELL), Math.floor((z0 + 8) / TOWN_CELL));
    if (!t || Math.hypot(x0 + 8 - t.cx, z0 + 8 - t.cz) > t.R + 16) return;
    const W = this.writer(data, x0, z0), { set, get } = W;
    const sd = this.seed;
    const lot = this.lotAt(Math.floor(x0 / 32), Math.floor(z0 / 32));
    // rues, trottoirs, sol des parcelles
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, z = z0 + lz, d = Math.hypot(x - t.cx, z - t.cz);
      if (d > t.R + 2) continue;
      const h = H[(lz + BORDER) * CW + lx + BORDER];
      const mx = ((x % 32) + 32) % 32, mz = ((z % 32) + 32) % 32;
      const road = mx < 5 || mz < 5;
      if (road) {
        let id = B.ASPHALT;
        if (mz < 5 && mx >= 5 && mz === 2 && (x & 7) < 4) id = B.ROAD_LX;
        else if (mx < 5 && mz >= 5 && mx === 2 && (z & 7) < 4) id = B.ROAD_LZ;
        const r = hash3(x, h, z, sd + 721);
        if (r < 0.035) id = B.GRAVEL; else if (r < 0.05) id = B.DIRT;
        set(x, h, z, id);
        for (let y = h + 1; y <= h + 4; y++) set(x, y, z, B.AIR);
        if (r > 0.992) set(x, h + 1, z, B.RUBBLE);
      } else if (lot && (mx === 5 || mx === 31 || mz === 5 || mz === 31)) {
        set(x, h, z, hash3(x, h, z, sd + 722) < 0.1 ? B.RUBBLE : B.SIDEWALK);
        for (let y = h + 1; y <= h + 3; y++) set(x, y, z, B.AIR);
      }
    }
    // épaves sur la chaussée
    const gx = Math.floor(x0 / 32), gz = Math.floor(z0 / 32), cx0 = gx * 32, cz0 = gz * 32, F0 = H[(8 + BORDER) * CW + 8 + BORDER];
    if (Math.hypot(cx0 + 16 - t.cx, cz0 + 2 - t.cz) < t.R - 8) {
      const r = hash2(gx, gz, sd + 731);
      if (r < 0.45) this.car(W, cx0 + 7 + Math.floor(hash2(gx, gz, sd + 732) * 18), t.base, cz0 + 1 + (r < 0.2 ? 0 : 1), true, hash2(gx, gz, sd + 733));
      else if (r < 0.52) { for (let x = cx0 + 12; x < cx0 + 20; x++) if (hash3(x, 0, gz, sd) < 0.7) set(x, t.base + 1, cz0 + 2, B.CONCRETE); }
    }
    if (Math.hypot(cx0 + 2 - t.cx, cz0 + 16 - t.cz) < t.R - 8) {
      const r = hash2(gx, gz, sd + 741);
      if (r < 0.35) this.car(W, cx0 + 1 + (r < 0.15 ? 0 : 1), t.base, cz0 + 7 + Math.floor(hash2(gx, gz, sd + 742) * 18), false, hash2(gx, gz, sd + 743));
      else if (r < 0.42) set(cx0 + 2, t.base + 1, cz0 + 12, B.FIRE_BARREL);
    }
    if (lot) this.stampLot(lot, W);
    void F0;
  }

  // Écrivain de blocs limité au tronçon courant (coordonnées monde)
  writer(data, x0, z0) {
    const inC = (x, z) => x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16;
    const set = (x, y, z, id) => { if (y >= 0 && y < HEIGHT && inC(x, z)) data[bidx(x - x0, y, z - z0)] = id; };
    const get = (x, y, z) => (y >= 0 && y < HEIGHT && inC(x, z) ? data[bidx(x - x0, y, z - z0)] : -1);
    const box = (xa, ya, za, xb, yb, zb, id) => {
      for (let x = Math.max(xa, x0); x <= Math.min(xb, x0 + 15); x++) for (let z = Math.max(za, z0); z <= Math.min(zb, z0 + 15); z++) for (let y = ya; y <= yb; y++) set(x, y, z, id);
    };
    return { set, get, box, x0, z0 };
  }

  // Épave de voiture (3 × 5 blocs), le long de x (alongX) ou de z
  car(W, x, F, z, alongX, v) {
    const body = v < 0.3 ? B.RUST : v < 0.6 ? B.METAL_PLATE : v < 0.8 ? B.RUST : B.CONCRETE;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const X = alongX ? x + i : x + j, Z = alongX ? z + j : z + i;
      const wheel = (i === 0 || i === 4) && (j === 0 || j === 2);
      W.set(X, F + 1, Z, wheel ? B.TIRE : body);
      if (i >= 1 && i <= 3) {
        const glassy = i !== 2 || j !== 1;
        W.set(X, F + 2, Z, glassy ? (hash3(X, F, Z, this.seed + 751) < 0.35 ? B.GLASS : B.AIR) : body);
      } else W.set(X, F + 2, Z, B.AIR);
    }
    if (v > 0.5) for (let i = 1; i <= 3; i += 2) { const X = alongX ? x + i : x + 1, Z = alongX ? z + 1 : z + i; W.set(X, F + 2, Z, body); }
  }

  // Arbre mort : tronc penché, branches asymétriques qui montent
  deadTree(W, x, F, z, v) {
    const h = 4 + Math.floor(v * 4), sd = this.seed;
    const lean = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(hash3(x, 1, z, sd + 760) * 4)];
    let tx = x, tz = z;
    for (let y = F + 1; y <= F + h; y++) {
      if (y === F + Math.floor(h * 0.6)) { tx += lean[0]; tz += lean[1]; }
      W.set(tx, y, tz, B.LOG);
    }
    const n = 1 + Math.floor(hash3(x, 2, z, sd + 762) * 2);
    for (let k = 0; k < n; k++) {
      const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(hash3(x, k + 5, z, sd + 761) * 4)];
      const y0 = F + h - 1 - k * 2;
      const len = 1 + Math.floor(hash3(x, k, z, sd + 763) * 2);
      for (let i = 1; i <= len; i++) W.set(tx + dx * i, y0 + i - 1, tz + dz * i, B.LOG);
    }
  }

  // Bâtiment à étages : murs, fenêtres brisées, dalles, escalier en lacets jusqu'au toit, butin, effondrement partiel
  building(W, o) {
    const { x0, z0, x1, z1, F, floors, mat, shop, v, v2 } = o;
    const sd = this.seed, top = F + 4 * floors;
    const sxA = x0 + 1, sxB = x0 + 2, sz = z0 + 2;          // cage d'escalier
    const collapse = v2 < 0.35 && floors > 1;
    const cw = x1 - x0;
    const maxY = (x, z) => {
      if (!collapse) return top + 1;
      const k = (x - x0) - cw * 0.45;
      return k <= 0 ? top + 1 : Math.max(F + 4, Math.floor(top + 1 - k * 1.6 - hash2(x, z, sd + 771) * 2));
    };
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const my = maxY(x, z);
      const edgeX = x === x0 || x === x1, edgeZ = z === z0 || z === z1, edge = edgeX || edgeZ, corner = edgeX && edgeZ;
      for (let y = F; y <= top + 1; y++) {
        let id = B.AIR;
        const f = Math.floor((y - F) / 4), ly = (y - F) % 4;
        if (y === top + 1) id = edge ? mat : B.AIR;                       // acrotère
        else if (ly === 0) {                                              // dalles
          id = f === 0 ? B.TILE_FLOOR : B.CONCRETE;
          if (edge) id = mat;
          const k = f - 1; // l'escalier de l'étage k arrive sur la dalle f
          if (k >= 0 && !edge) {
            const lane = k % 2 === 0 ? sxA : sxB;
            if (x === lane && (k % 2 === 0 ? (z === sz + 1 || z === sz + 2) : (z === sz || z === sz + 1))) id = B.AIR;
          }
        } else if (edge) {
          id = mat;
          const i = edgeZ ? x - x0 : z - z0;
          const win = !corner && i % 3 !== 0 && (ly === 2 || (shop && f === 0 && ly !== 0));
          const door = f === 0 && edgeZ && z === z0 && (ly === 1 || ly === 2) && Math.abs(x - Math.floor((x0 + x1) / 2)) <= 1;
          if (door) id = B.AIR;
          else if (win) id = hash3(x, y, z, sd + 772) < 0.22 ? B.GLASS : B.AIR;
        } else {
          // marches : étage pair vers +z sur la voie A, impair vers -z sur la voie B
          const lane = f % 2 === 0 ? sxA : sxB;
          if (x === lane) {
            if (f % 2 === 0 && z === sz + ly - 1) id = mat === B.BRICKS ? B.STONE_BRICKS : B.CONCRETE;
            if (f % 2 === 1 && z === sz + 3 - ly) id = B.CONCRETE;
          }
        }
        if (y > my) id = B.AIR;
        W.set(x, y, z, id);
      }
    }
    // gravats de l'effondrement
    if (collapse) for (let x = x1 - 3; x <= x1 + 3; x++) for (let z = z0 - 1; z <= z1 + 1; z++) {
      const hh = Math.floor(hash2(x, z, sd + 773) * 3 * (1 - Math.abs(x - x1) / 5));
      for (let y = F + 1; y <= F + hh; y++) if (W.get(x, y, z) === B.AIR) W.set(x, y, z, B.RUBBLE);
    }
    // butin et mobilier, étage par étage
    for (let f = 0; f < floors; f++) {
      const y = F + 1 + 4 * f, r = hash2(x0 + f, z0, sd + 774 + f);
      const spots = [[x1 - 1, z1 - 1], [x1 - 1, z0 + 1], [x0 + 5, z1 - 1], [Math.floor((x0 + x1) / 2), z1 - 1]];
      const place = (k, id) => { const [px, pz] = spots[k % spots.length]; if (y <= maxY(px, pz) && W.get(px, y, pz) === B.AIR) W.set(px, y, pz, id); };
      if (r < 0.62) place(Math.floor(r * 10), B.CRATE);
      if (r > 0.5 && r < 0.7) place(1, B.MED_CABINET);
      if (f === floors - 1 && r > 0.86) place(2, B.SAFE);
      if (r > 0.9) place(3, B.MIL_CRATE);
      if (r < 0.3) place(3, B.TABLE);
      if (hash2(x0, z0 + f, sd + 775) < 0.25) {
        const px = x0 + 4 + Math.floor(r * (cw - 6)), pz = z0 + 3 + Math.floor(hash2(x0, z0, sd + f) * (z1 - z0 - 5));
        if (W.get(px, y, pz) === B.AIR && y <= maxY(px, pz)) W.set(px, y, pz, B.RUBBLE);
      }
    }
    if (shop) for (let x = x0 + 2; x <= x1 - 2; x++) if (hash3(x, F, z0, sd + 776) < 0.8) W.set(x, F + 4, z0 - 1, B.CANVAS);
  }

  house(W, x0, z0, F, v) {
    const x1 = x0 + 8, z1 = z0 + 7, sd = this.seed;
    const mat = [B.PLASTER, B.BRICKS, B.PLASTER2, B.PLANKS][Math.floor(v * 4)];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1, corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      W.set(x, F, z, B.PLANKS);
      for (let y = F + 1; y <= F + 3; y++) {
        let id = B.AIR;
        if (edge) {
          id = mat;
          const i = z === z0 || z === z1 ? x - x0 : z - z0;
          if (!corner && y === F + 2 && i % 3 === 1) id = hash3(x, y, z, sd + 781) < 0.3 ? B.GLASS : B.AIR;
          if (z === z0 && x === x0 + 4 && y <= F + 2) id = B.AIR;
          if (hash3(x, y, z, sd + 782) < 0.06 && y === F + 3) id = B.AIR;
        }
        W.set(x, y, z, id);
      }
    }
    // toit en tuiles, en gradins
    for (let k = 0; k <= 4; k++) for (let x = x0 - 1 + k; x <= x1 + 1 - k; x++) for (let z = z0 - 1; z <= z1 + 1; z++) {
      if (x > x0 - 1 + k && x < x1 + 1 - k && k < 4) continue;
      if (hash3(x, k, z, sd + 783) < 0.07) continue;
      W.set(x, F + 4 + k, z, B.ROOF_TILE);
    }
    for (let k = 0; k < 4; k++) for (let z = z0; z <= z1; z++) { if (W.get(x0 + k + 1, F + 4 + k, z) === B.AIR) W.set(x0 + k + 1, F + 4 + k, z, B.AIR); }
    const r = hash2(x0, z0, sd + 784);
    W.set(x1 - 1, F + 1, z1 - 1, B.CRATE);
    if (r < 0.35) W.set(x0 + 1, F + 1, z1 - 1, B.MED_CABINET);
    else if (r < 0.6) W.set(x0 + 1, F + 1, z1 - 1, B.TABLE);
    if (r > 0.93) W.set(x1 - 1, F + 1, z0 + 1, B.SAFE);
  }

  stampLot(lot, W) {
    const { x0, z0, F, type, v, v2 } = lot, sd = this.seed;
    const X0 = x0 + 6, X1 = x0 + 30, Z0 = z0 + 6, Z1 = z0 + 30;
    // nettoyage de la parcelle et sol
    const ground = type === 'parking' || type === 'station' ? B.ASPHALT : type === 'ruin' ? B.GRAVEL : B.GRASS;
    W.box(X0, F, Z0, X1, F, Z1, ground);
    W.box(X0, F + 1, Z0, X1, F + 3, Z1, B.AIR);
    if (type === 'tower' || type === 'block') {
      const mat = [B.CONCRETE, B.BRICKS, B.PLASTER2, B.PLASTER][Math.floor(v * 4)];
      const d = type === 'tower' ? 17 : 13 + Math.floor(v2 * 5);
      this.building(W, { x0: X0 + 1, z0: Z0 + 1, x1: X1 - 1, z1: Z0 + 1 + d, F, floors: lot.floors, mat, shop: false, v, v2 });
      if (v2 > 0.6) this.car(W, X0 + 4, F, Z1 - 4, true, v);
      if (v2 < 0.2) W.set(X1 - 2, F + 1, Z1 - 2, B.FIRE_BARREL);
    } else if (type === 'shops') {
      const mat = [B.BRICKS, B.PLASTER, B.PLASTER2][Math.floor(v * 3)];
      this.building(W, { x0: X0 + 1, z0: Z0 + 1, x1: X1 - 1, z1: Z0 + 11, F, floors: 2, mat, shop: true, v, v2: v2 * 1.5 });
      // tas de gravats groupés et herbes sèches dans la cour
      for (let x = X0; x <= X1; x++) for (let z = Z0 + 13; z <= Z1; z++) {
        const n = this.nDetail.noise2(x * 0.22, z * 0.22);
        if (n > 0.45) { W.set(x, F + 1, z, B.RUBBLE); if (n > 0.62) W.set(x, F + 2, z, B.RUBBLE); }
        else if (hash3(x, F, z, sd + 791) < 0.1) W.set(x, F + 1, z, B.TALL_GRASS);
      }
      this.deadTree(W, X1 - 3, F, Z1 - 3, v2);
    } else if (type === 'houses') {
      this.house(W, X0 + 2, Z0 + 3, F, v);
      this.house(W, X0 + 13, Z0 + 14, F, v2);
      this.deadTree(W, X0 + 4, F, Z1 - 3, v);
      for (let x = X0; x <= X1; x++) if (hash3(x, F, Z1, sd + 792) < 0.7) W.set(x, F + 1, Z1, B.COBBLE);
    } else if (type === 'station') {
      // auvent sur piliers, pompes, boutique
      for (let x = X0 + 1; x <= X0 + 15; x++) for (let z = Z0 + 3; z <= Z0 + 12; z++) if (hash3(x, F + 5, z, sd + 793) > 0.08) W.set(x, F + 5, z, B.CONCRETE);
      for (const [px, pz] of [[X0 + 2, Z0 + 4], [X0 + 14, Z0 + 4], [X0 + 2, Z0 + 11], [X0 + 14, Z0 + 11]]) for (let y = F + 1; y <= F + 4; y++) W.set(px, y, pz, B.METAL_PLATE);
      W.set(X0 + 6, F + 1, Z0 + 7, B.PUMP); W.set(X0 + 10, F + 1, Z0 + 7, B.PUMP);
      W.set(X0 + 6, F + 1, Z0 + 8, B.PUMP); W.set(X0 + 10, F + 1, Z0 + 8, B.PUMP);
      this.building(W, { x0: X0 + 17, z0: Z0 + 2, x1: X1 - 1, z1: Z0 + 11, F, floors: 1, mat: B.PLASTER, shop: true, v, v2: 1 });
      this.car(W, X0 + 3, F, Z0 + 14, true, v2);
      if (v > 0.5) this.car(W, X0 + 11, F, Z0 + 16, false, v);
    } else if (type === 'parking') {
      for (let x = X0 + 1; x <= X1 - 1; x += 4) for (const z of [Z0 + 3, Z0 + 4, Z0 + 16, Z0 + 17]) W.set(x, F, z, B.ROAD_LZ);
      const n = 2 + Math.floor(v * 4);
      for (let i = 0; i < n; i++) { const k = Math.floor(hash2(x0 + i, z0, sd + 794) * 5); this.car(W, X0 + 2 + k * 4, F, i % 2 ? Z0 + 14 : Z0 + 1, false, hash2(x0, z0 + i, sd + 795)); }
      if (v2 < 0.4) W.set(X1 - 1, F + 1, Z1 - 1, B.FIRE_BARREL);
      if (v2 > 0.7) W.set(X1 - 2, F + 1, Z0 + 11, B.CRATE);
    } else if (type === 'ruin' || type === 'park') {
      // fondations effondrées, tas de gravats, arbres morts, brasero
      if (type === 'ruin') {
        const mat = [B.BRICKS, B.CONCRETE, B.PLASTER][Math.floor(v * 3)];
        for (let x = X0 + 2; x <= X1 - 2; x++) for (let z = Z0 + 2; z <= Z1 - 2; z++) {
          const edge = x === X0 + 2 || x === X1 - 2 || z === Z0 + 2 || z === Z1 - 2;
          const hh = edge ? Math.floor(hash2(x, z, sd + 796) * 4) : Math.floor(Math.max(0, this.nDetail.noise2(x * 0.15, z * 0.15) + 0.2) * 5);
          for (let y = F + 1; y <= F + hh; y++) W.set(x, y, z, edge ? mat : B.RUBBLE);
        }
        W.set(X0 + 6, F + 1, Z0 + 6, B.CRATE);
        if (v2 > 0.6) W.set(X1 - 6, F + 1, Z1 - 6, B.MIL_CRATE);
      } else {
        for (let i = 0; i < 4; i++) this.deadTree(W, X0 + 3 + Math.floor(hash2(x0 + i, z0, sd + 797) * 19), F, Z0 + 3 + Math.floor(hash2(x0, z0 + i, sd + 798) * 19), hash2(i, x0, sd));
        for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) if (hash3(x, F, z, sd + 799) < 0.12) W.set(x, F + 1, z, B.TALL_GRASS);
      }
      W.set(X0 + 12, F + 1, Z0 + 12, B.FIRE_BARREL);
    }
  }

  // Région choisie pour la zone d'extraction d'une super-cellule 5×5 (de préférence sur la terre ferme)
  extractRegion(sx, sz) {
    const key = 'e' + sx + ',' + sz;
    if (this._st && this._st.has(key)) return this._st.get(key);
    let pick = null;
    for (let k = 0; k < 10 && !pick; k++) {
      const rx = sx * 5 + Math.floor(hash2(sx, sz, this.seed + 601 + k * 7) * 5), rz = sz * 5 + Math.floor(hash2(sx, sz, this.seed + 602 + k * 7) * 5);
      if (((this.column(rx * 64 + 32, rz * 64 + 32) & 255) > SEA + 1 && !this.nearTown(rx * 64 + 32, rz * 64 + 32, 70)) || k === 9) pick = [rx, rz];
    }
    if (!this._st) this._st = new Map();
    this._st.set(key, pick);
    return pick;
  }

  // Liste des structures dont le centre est à moins de r blocs de (x, z)
  structuresNear(x, z, r) {
    const out = [];
    const r0x = Math.floor((x - r) / 64), r1x = Math.floor((x + r) / 64), r0z = Math.floor((z - r) / 64), r1z = Math.floor((z + r) / 64);
    for (let rz = r0z; rz <= r1z; rz++) for (let rx = r0x; rx <= r1x; rx++) {
      const st = this.structureAt(rx, rz);
      if (st && Math.hypot(st.cx - x, st.cz - z) <= r) out.push(st);
    }
    return out;
  }
  extractionsNear(x, z, r) { return this.structuresNear(x, z, r).filter((s) => s.type === 'extract'); }

  // Dessine la structure dans le tronçon (x0, z0 = origine monde du tronçon)
  stamp(st, data, cx0, cz0) {
    const inC = (x, z) => x >= cx0 && x < cx0 + 16 && z >= cz0 && z < cz0 + 16;
    const set = (x, y, z, id) => { if (y >= 0 && y < HEIGHT && inC(x, z)) data[bidx(x - cx0, y, z - cz0)] = id; };
    const get = (x, y, z) => (y >= 0 && y < HEIGHT && inC(x, z) ? data[bidx(x - cx0, y, z - cz0)] : -1);
    const hs = (x, y, z, k) => hash3(x, y, z, this.seed + k);
    const { x0, z0, w, d, y: F } = st, x1 = x0 + w - 1, z1 = z0 + d - 1;
    // les colonnes hors tronçon sont ignorées très tôt
    if (x1 < cx0 || x0 >= cx0 + 16 || z1 < cz0 || z0 >= cz0 + 16) return;
    const ground = (id) => id > 0 && id !== B.WATER && id !== B.LEAVES && id !== B.SPRUCE_LEAVES && id !== B.LOG && id !== B.SPRUCE_LOG
      && id !== B.TALL_GRASS && id !== B.POPPY && id !== B.DANDELION && id !== B.DEAD_BUSH && id !== B.CACTUS;
    const found = (x, z, top, fillId) => {
      set(x, F, z, top);
      for (let y = F - 1; y > 0; y--) { if (ground(get(x, y, z))) break; set(x, y, z, fillId); }
    };
    const clear = (x, z, h) => { for (let y = F + 1; y <= F + h; y++) set(x, y, z, B.AIR); };

    if (st.type === 'extract') {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { found(x, z, B.PAD, B.CONCRETE); clear(x, z, 12); }
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { set(x, F + 1, z, B.METAL_PLATE); set(x, F + 2, z, B.FLARE); }
      return;
    }
    if (st.type === 'house') {
      const mat = [B.PLANKS, B.BRICKS, B.STONE_BRICKS, B.COBBLE][Math.floor(st.v * 4)];
      const roof = mat === B.PLANKS ? B.PLANKS : (st.v * 10 % 1 < 0.5 ? B.PLANKS : B.CONCRETE);
      const door = [Math.floor((x0 + x1) / 2), z1];
      for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        const inside = x >= x0 && x <= x1 && z >= z0 && z <= z1;
        if (!inside) { if (get(x, F + 1, z) > 0 && !ground(get(x, F + 1, z))) clear(x, z, 8); continue; }
        found(x, z, mat === B.PLANKS ? B.COBBLE : B.PLANKS, B.COBBLE);
        clear(x, z, 9);
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        if (edge) {
          for (let y = F + 1; y <= F + 3; y++) {
            if (x === door[0] && z === door[1] && y <= F + 2) continue;
            const win = !corner && y === F + 2 && ((x - x0) % 3 === 1 || (z - z0) % 3 === 1) && !(x === door[0] && z === door[1]);
            if (win) { if (hs(x, y, z, 11) < 0.6) set(x, y, z, B.GLASS); continue; }
            if (hs(x, y, z, 12) < 0.07 && y > F + 1) continue; // ruine
            set(x, y, z, mat);
          }
        }
        if (hs(x, F + 4, z, 13) > 0.1) set(x, F + 4, z, roof);
      }
      set(x0 + 1, F + 1, z0 + 1, B.CRATE);
      if (st.v * 7 % 1 < 0.6) set(x1 - 1, F + 1, z0 + 1, B.CRATE);
      if (st.v * 13 % 1 < 0.35) set(x0 + 1, F + 1, z1 - 1, B.MED_CABINET);
      if (st.v * 17 % 1 < 0.12) set(x1 - 1, F + 1, z1 - 1, B.SAFE);
      else if (st.v * 19 % 1 < 0.4) set(x1 - 1, F + 1, z1 - 1, B.TABLE);
      if (st.v * 23 % 1 < 0.4) set(Math.floor((x0 + x1) / 2), F + 3, Math.floor((z0 + z1) / 2), B.LANTERN);
      return;
    }
    if (st.type === 'camp') {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        found(x, z, B.GRAVEL, B.DIRT); clear(x, z, 8);
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        const gap = (Math.abs(x - (x0 + 7)) <= 1 && (z === z0 || z === z1)) || (Math.abs(z - (z0 + 7)) <= 1 && (x === x0 || x === x1));
        if (edge && !gap) { set(x, F + 1, z, B.SANDBAG); if (hs(x, F, z, 21) < 0.8) set(x, F + 2, z, B.SANDBAG); }
      }
      const tent = (tx, tz) => {
        for (let z = tz; z < tz + 5; z++) {
          set(tx, F + 1, z, B.CANVAS); set(tx + 4, F + 1, z, B.CANVAS);
          set(tx + 1, F + 2, z, B.CANVAS); set(tx + 3, F + 2, z, B.CANVAS);
          set(tx + 2, F + 3, z, B.CANVAS);
        }
        set(tx + 2, F + 1, tz + 3, B.MIL_CRATE);
      };
      tent(x0 + 2, z0 + 8);
      tent(x0 + 7, z0 + 8);
      // conteneur maritime en tôle, ouvert côté +z
      for (let z = z0 + 2; z <= z0 + 7; z++) for (let x = x0 + 9; x <= x0 + 11; x++) for (let y = F + 1; y <= F + 3; y++) {
        const shell = x === x0 + 9 || x === x0 + 11 || y === F + 3 || z === z0 + 2;
        set(x, y, z, shell ? B.METAL_PLATE : B.AIR);
      }
      set(x0 + 10, F + 1, z0 + 3, B.MIL_CRATE);
      set(x0 + 3, F + 1, z0 + 3, B.CRATE);
      if (st.v < 0.5) set(x0 + 4, F + 1, z0 + 3, B.MED_CABINET);
      for (const [px, pz] of [[x0 + 2, z0 + 6], [x0 + 12, z0 + 12]]) { set(px, F + 1, pz, B.LOG); set(px, F + 2, pz, B.LOG); set(px, F + 3, pz, B.LANTERN); }
      return;
    }
    if (st.type === 'bunker') {
      const RF = F - 8;
      // salle souterraine
      for (let z = z0 + 6; z <= z1; z++) for (let x = x0; x <= x1; x++) for (let y = RF; y <= RF + 5; y++) {
        const shell = x === x0 || x === x1 || z === z0 + 6 || z === z1 || y === RF || y === RF + 5;
        set(x, y, z, shell ? B.CONCRETE : B.AIR);
      }
      // abri d'entrée
      for (let z = z0; z <= z0 + 4; z++) for (let x = x0; x <= x0 + 4; x++) {
        found(x, z, B.CONCRETE, B.CONCRETE); clear(x, z, 6);
        const edge = x === x0 || x === x0 + 4 || z === z0 || z === z0 + 4;
        for (let y = F + 1; y <= F + 3; y++) if (edge && !(x === x0 + 2 && z === z0 + 4 && y <= F + 2)) set(x, y, z, B.CONCRETE);
        set(x, F + 4, z, B.CONCRETE);
      }
      for (let z = z0 + 5; z <= z0 + 6; z++) for (let x = x0 + 1; x <= x0 + 3; x++) clear(x, z, 3);
      // escalier vers la salle
      const sx = x0 + 2;
      for (let k = 0; k <= 7; k++) {
        const z = z0 + 1 + k, top = F - k;
        set(sx, top - 1, z, B.CONCRETE);
        for (let y = top; y <= top + 3; y++) if (y <= F + 3) set(sx, y, z, B.AIR);
        if (k >= 4 && z < z0 + 7) {
          for (let y = top; y <= top + 2; y++) { set(sx - 1, y, z, B.CONCRETE); set(sx + 1, y, z, B.CONCRETE); }
          set(sx, top + 3, z, B.CONCRETE);
        }
      }
      set(x0 + 1, RF + 1, z1 - 1, B.MIL_CRATE);
      set(x1 - 1, RF + 1, z1 - 1, B.MIL_CRATE);
      set(x0 + 5, RF + 1, z1 - 1, B.SAFE);
      set(x1 - 1, RF + 1, z0 + 7, B.MED_CABINET);
      set(x0 + 3, RF + 4, z0 + 10, B.LANTERN);
      set(x0 + 8, RF + 4, z0 + 10, B.LANTERN);
    }
  }

  setIf(data, x, y, z, id, force) {
    if (x < 0 || z < 0 || x >= CHUNK || z >= CHUNK || y < 0 || y >= HEIGHT) return;
    const i = bidx(x, y, z), cur = data[i];
    if (force || cur === B.AIR || cur === B.TALL_GRASS || cur === B.POPPY || cur === B.DANDELION) data[i] = id;
  }

  oak(data, lx, by, lz, hgt, wx, wz) {
    const top = by + hgt - 1;
    for (let y = top - 2; y <= top + 1; y++) {
      const dy = y - top, r = dy >= 0 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && (dy === 1 || hash3(wx + dx, y, wz + dz, this.seed + 9) < 0.55)) continue;
        this.setIf(data, lx + dx, y, lz + dz, B.LEAVES, false);
      }
    }
    for (let y = by; y <= top; y++) this.setIf(data, lx, y, lz, B.LOG, true);
    if (lx >= 0 && lz >= 0 && lx < CHUNK && lz < CHUNK && by - 1 >= 0) {
      const i = bidx(lx, by - 1, lz);
      if (data[i] === B.GRASS) data[i] = B.DIRT;
    }
  }

  spruce(data, lx, by, lz, hgt, wx, wz) {
    const top = by + hgt - 1;
    const RAD = [0, 1, 1, 2, 1, 2, 3, 2, 3, 2, 3];
    for (let y = by + 2; y <= top + 1; y++) {
      const dt = top + 1 - y;
      const r = RAD[Math.min(dt, RAD.length - 1)];
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const d = Math.abs(dx) + Math.abs(dz);
        if (d > r + (r > 1 ? 1 : 0)) continue;
        this.setIf(data, lx + dx, y, lz + dz, B.SPRUCE_LEAVES, false);
      }
    }
    for (let y = by; y <= top; y++) this.setIf(data, lx, y, lz, B.SPRUCE_LOG, true);
  }
}
