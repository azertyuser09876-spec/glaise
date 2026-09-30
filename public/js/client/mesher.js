// Construction des maillages de tronçons (16×16×96).
// Occlusion ambiante par sommet, lumière du ciel par carte de hauteurs, lumière des torches par
// propagation (BFS) sur une région 48×48 autour du tronçon.
// Format de sommet (16 octets) : u16 x,y,z (1/16 de bloc), u16 pad, u8 u,v (1/16), u8 couche, u8 drapeaux,
// u8 ombrage (AO × face), u8 ciel, u8 torche, u8 pad.
import { BLOCKS, OPAQUE, LIGHT_BLOCK, CHUNK, HEIGHT } from '../shared/blocks.js';

const PX = 18, PXZ = PX * PX, PH = HEIGHT + 2, PVOL = PXZ * PH;
const R_NONE = 0, R_CUBE = 1, R_LEAVES = 2, R_WATER = 3, R_GLASS = 4, R_CROSS = 5, R_TORCH = 6;
export const RENDER = new Uint8Array(256), EMIT = new Uint8Array(256);
const RMAP = { none: R_NONE, cube: R_CUBE, leaves: R_LEAVES, water: R_WATER, glass: R_GLASS, cross: R_CROSS, torch: R_TORCH };
for (const b of BLOCKS) { if (!b) continue; RENDER[b.id] = RMAP[b.render]; EMIT[b.id] = b.light || 0; }
const SWAY = new Uint8Array(256);
for (const b of BLOCKS) if (b && b.render === 'cross') SWAY[b.id] = 1;

// Faces : +y, -y, +z, -z, +x, -x ; coins TL, TR, BR, BL vus de l'extérieur
export const FACES = [
  { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], shade: 1 },
  { n: [0, -1, 0], c: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], shade: 0.5 },
  { n: [0, 0, 1], c: [[0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1]], shade: 0.8 },
  { n: [0, 0, -1], c: [[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]], shade: 0.8 },
  { n: [1, 0, 0], c: [[1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1]], shade: 0.65 },
  { n: [-1, 0, 0], c: [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0]], shade: 0.65 },
];
const UVC = [[0, 0], [16, 0], [16, 16], [0, 16]];
const AO_CURVE = [0.45, 0.62, 0.8, 1];
const poff = (dx, dy, dz) => dx + dz * PX + dy * PXZ;
const NOFF = FACES.map((f) => poff(f.n[0], f.n[1], f.n[2]));
// Pour chaque face et chaque coin : décalages (depuis la cellule devant la face) des deux côtés et du coin
const S1 = [], S2 = [], SC = [];
FACES.forEach((f, fi) => {
  const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2;
  const t = [0, 1, 2].filter((a) => a !== axis);
  S1[fi] = []; S2[fi] = []; SC[fi] = [];
  for (let k = 0; k < 4; k++) {
    const c = f.c[k];
    const v1 = [0, 0, 0], v2 = [0, 0, 0];
    v1[t[0]] = c[t[0]] ? 1 : -1; v2[t[1]] = c[t[1]] ? 1 : -1;
    S1[fi][k] = poff(v1[0], v1[1], v1[2]);
    S2[fi][k] = poff(v2[0], v2[1], v2[2]);
    SC[fi][k] = poff(v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]);
  }
});

class VB {
  constructor(cap = 8192) { this.alloc(cap); this.n = 0; }
  alloc(cap) {
    const nb = new ArrayBuffer(cap * 16);
    if (this.u8) new Uint8Array(nb).set(this.u8.subarray(0, this.n * 16));
    this.buf = nb; this.u8 = new Uint8Array(nb); this.u16 = new Uint16Array(nb); this.cap = cap;
  }
  reset() { this.n = 0; }
  v(x, y, z, u, v, layer, flags, shade, sky, blk) {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    const i = this.n++, o = i * 16, h = i * 8;
    this.u16[h] = x; this.u16[h + 1] = y; this.u16[h + 2] = z; this.u16[h + 3] = 0;
    const b = this.u8;
    b[o + 8] = u; b[o + 9] = v; b[o + 10] = layer; b[o + 11] = flags;
    b[o + 12] = shade; b[o + 13] = sky; b[o + 14] = blk; b[o + 15] = 0;
  }
  take() { return this.u8.slice(0, this.n * 16); }
}

const LR = 48, LRA = LR * LR;

export class Mesher {
  constructor(faceLayer) {
    this.faceLayer = faceLayer;
    this.pad = new Uint8Array(PVOL);
    this.sky = new Uint8Array(PVOL);
    this.bl = new Uint8Array(PVOL);
    this.hm = new Int16Array(PXZ);
    this.opq = new VB(16384); this.wat = new VB(4096);
    this.lblk = null; this.llight = null; this.lq = null;
  }

  // chunks : fonction (dx, dz) ∈ [-1,1]² → objet tronçon { data, nLights }
  build(chunks, cx, cz) {
    const pad = this.pad, sky = this.sky, bl = this.bl, hm = this.hm;
    const C = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) C.push(chunks(dx, dz));
    // Remplissage du tableau paddé
    for (let pz = 0; pz < PX; pz++) {
      const z = pz - 1, czo = z < 0 ? 0 : z > 15 ? 2 : 1, lz = (z + 16) & 15;
      for (let px = 0; px < PX; px++) {
        const x = px - 1, cxo = x < 0 ? 0 : x > 15 ? 2 : 1, lx = (x + 16) & 15;
        const d = C[czo * 3 + cxo].data, base = lx + (lz << 4), col = px + pz * PX;
        pad[col] = 11; // y = -1 : socle
        let h = 0;
        for (let y = 0; y < HEIGHT; y++) {
          const id = d[base + (y << 8)];
          pad[col + (y + 1) * PXZ] = id;
          if (LIGHT_BLOCK[id]) h = y + 1;
        }
        pad[col + (HEIGHT + 1) * PXZ] = 0;
        hm[col] = h;
        // lumière du ciel (dégradé sous le plus haut bloc opaque)
        for (let py = 0; py < PH; py++) {
          const y = py - 1;
          sky[col + py * PXZ] = y >= h ? 255 : Math.max(0, 255 - (h - y) * 36);
        }
      }
    }
    // Lumière des torches
    let anyLight = false;
    for (const c of C) if (c.nLights > 0) { anyLight = true; break; }
    let blight = null;
    if (anyLight) {
      this.propagate(C);
      const L = this.llight;
      bl.fill(0);
      for (let pz = 0; pz < PX; pz++) for (let px = 0; px < PX; px++) {
        const rx = px - 1 + 16, rz = pz - 1 + 16;
        for (let y = 0; y < HEIGHT; y++) bl[px + pz * PX + (y + 1) * PXZ] = L[rx + rz * LR + y * LRA] * 17;
      }
      blight = new Uint8Array(CHUNK * CHUNK * HEIGHT);
      for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        blight[x + (z << 4) + (y << 8)] = L[(x + 16) + (z + 16) * LR + y * LRA];
      }
    } else bl.fill(0);

    const opq = this.opq, wat = this.wat, FL = this.faceLayer;
    opq.reset(); wat.reset();
    const torches = [];
    const ao = [0, 0, 0, 0], sk = [0, 0, 0, 0], bk = [0, 0, 0, 0];

    for (let y = 0; y < HEIGHT; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const p = (x + 1) + (z + 1) * PX + (y + 1) * PXZ;
          const id = pad[p];
          if (!id) continue;
          const r = RENDER[id];
          if (r === R_CROSS) { this.cross(opq, x, y, z, id, p); continue; }
          if (r === R_TORCH) { this.torch(opq, x, y, z, id); torches.push(x, y, z); continue; }
          const emissive = EMIT[id] > 0;
          if (emissive) torches.push(x, y, z);
          const out = r === R_WATER ? wat : opq;
          for (let f = 0; f < 6; f++) {
            const fr = p + NOFF[f], nb = pad[fr];
            if (OPAQUE[nb]) continue;
            if (r === R_WATER) { if (nb === id) continue; }
            else if (r === R_GLASS) { if (nb === id) continue; }
            // AO et lumière par coin
            const s1 = S1[f], s2 = S2[f], sc = SC[f];
            const s0 = sky[fr], b0 = bl[fr];
            for (let k = 0; k < 4; k++) {
              const a = fr + s1[k], b = fr + s2[k], c = fr + sc[k];
              const oa = OPAQUE[pad[a]], ob = OPAQUE[pad[b]], oc = (oa && ob) ? 1 : OPAQUE[pad[c]];
              ao[k] = (oa && ob) ? 0 : 3 - oa - ob - oc;
              let ss = s0, bb = b0, n = 1;
              if (!oa) { ss += sky[a]; bb += bl[a]; n++; }
              if (!ob) { ss += sky[b]; bb += bl[b]; n++; }
              if (!oc) { ss += sky[c]; bb += bl[c]; n++; }
              sk[k] = ss / n; bk[k] = emissive ? 255 : bb / n;
            }
            const fc = FACES[f], layer = FL[id * 6 + f];
            const flags = r === R_WATER ? 3 : r === R_LEAVES ? 1 : 0;
            let top = 16;
            if (r === R_WATER && pad[p + PXZ] !== id) top = 14;
            const shade = fc.shade;
            const flip = ao[0] + ao[2] < ao[1] + ao[3];
            const order = flip ? ORDER_FLIP : ORDER;
            for (let oi = 0; oi < 4; oi++) {
              const k = order[oi], cc = fc.c[k];
              const vy = cc[1] ? top : 0;
              out.v((x + cc[0]) * 16, y * 16 + vy, (z + cc[2]) * 16, UVC[k][0], (f >= 2 && cc[1] && top !== 16) ? 2 : UVC[k][1],
                layer, flags, Math.round(AO_CURVE[ao[k]] * shade * 255), sk[k], bk[k]);
            }
          }
        }
      }
    }
    const hm16 = new Uint8Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) hm16[x + z * 16] = hm[(x + 1) + (z + 1) * PX];
    return { opaque: opq.take(), nOpaque: opq.n / 4, water: wat.take(), nWater: wat.n / 4, torches, hm: hm16, blight };
  }

  cross(out, x, y, z, id, p) {
    const layer = this.faceLayer[id * 6 + 2], s = this.sky[p], b = this.bl[p];
    const sw = SWAY[id] ? 2 : 0, sh = 230;
    const a0 = 2, a1 = 14, X = x * 16, Y = y * 16, Z = z * 16;
    // deux quads diagonaux, double face
    const quads = [
      [[a0, a0], [a1, a1]], [[a1, a1], [a0, a0]], [[a0, a1], [a1, a0]], [[a1, a0], [a0, a1]],
    ];
    for (const [[x0, z0], [x1, z1]] of quads) {
      // TL, BL, BR, TR
      out.v(X + x0, Y + 16, Z + z0, 0, 0, layer, sw, sh, s, b);
      out.v(X + x0, Y, Z + z0, 0, 16, layer, 0, sh, s, b);
      out.v(X + x1, Y, Z + z1, 16, 16, layer, 0, sh, s, b);
      out.v(X + x1, Y + 16, Z + z1, 16, 0, layer, sw, sh, s, b);
    }
  }

  torch(out, x, y, z, id) {
    const layer = this.faceLayer[id * 6 + 2], p = (x + 1) + (z + 1) * PX + (y + 1) * PXZ, s = this.sky[p];
    const X = x * 16, Y = y * 16, Z = z * 16;
    const x0 = 7, x1 = 9, y1 = 10;
    for (let f = 0; f < 6; f++) {
      if (f === 1) continue;
      const fc = FACES[f];
      for (const k of ORDER) {
        const c = fc.c[k];
        const vx = X + (c[0] ? x1 : x0), vy = Y + (c[1] ? y1 : 0), vz = Z + (c[2] ? x1 : x0);
        let u, v;
        if (f === 0) { u = k === 0 || k === 3 ? 7 : 9; v = k < 2 ? 6 : 8; }
        else { u = k === 0 || k === 3 ? 7 : 9; v = c[1] ? 6 : 16; }
        out.v(vx, vy, vz, u, v, layer, 0, Math.round(fc.shade * 255), s, 255);
      }
    }
  }

  // BFS de la lumière des blocs émissifs sur la région 48×48 (3×3 tronçons)
  propagate(C) {
    const N = LRA * HEIGHT;
    if (!this.lblk) { this.lblk = new Uint8Array(N); this.llight = new Uint8Array(N); this.lq = new Int32Array(N); }
    const blk = this.lblk, L = this.llight, q = this.lq;
    L.fill(0);
    let qh = 0, qt = 0;
    for (let ci = 0; ci < 9; ci++) {
      const d = C[ci].data, ox = (ci % 3) * 16, oz = Math.floor(ci / 3) * 16, has = C[ci].nLights > 0;
      for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < 16; z++) {
        const row = (ox) + (oz + z) * LR + y * LRA, src = (z << 4) + (y << 8);
        for (let x = 0; x < 16; x++) {
          const id = d[src + x];
          blk[row + x] = id;
          if (has && EMIT[id]) { L[row + x] = EMIT[id]; q[qt++] = row + x; }
        }
      }
    }
    while (qh < qt) {
      const i = q[qh++], l = L[i];
      if (l <= 1) continue;
      const x = i % LR, z = ((i / LR) | 0) % LR, y = (i / LRA) | 0, nl = l - 1;
      if (x > 0) { const j = i - 1; if (L[j] < nl && !OPAQUE[blk[j]]) { L[j] = nl; q[qt++] = j; } }
      if (x < LR - 1) { const j = i + 1; if (L[j] < nl && !OPAQUE[blk[j]]) { L[j] = nl; q[qt++] = j; } }
      if (z > 0) { const j = i - LR; if (L[j] < nl && !OPAQUE[blk[j]]) { L[j] = nl; q[qt++] = j; } }
      if (z < LR - 1) { const j = i + LR; if (L[j] < nl && !OPAQUE[blk[j]]) { L[j] = nl; q[qt++] = j; } }
      if (y > 0) { const j = i - LRA; if (L[j] < nl && !OPAQUE[blk[j]]) { L[j] = nl; q[qt++] = j; } }
      if (y < HEIGHT - 1) { const j = i + LRA; if (L[j] < nl && !OPAQUE[blk[j]]) { L[j] = nl; q[qt++] = j; } }
    }
  }
}
const ORDER = [0, 3, 2, 1], ORDER_FLIP = [3, 2, 1, 0];
