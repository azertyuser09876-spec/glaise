// Géométrie des armes à feu et de leurs accessoires (boîtes en pixels, canon vers -Z, Y vers le haut).
// Sert au rendu 3D (vue subjective, joueurs, pillards, objets au sol), aux icônes et à l'aperçu de l'armurerie.
import { G, GUNS, MODS } from '../shared/guns.js';

export const GUN_MATS = {
  dark: [46, 48, 52], steel: [112, 116, 122], poly: [32, 32, 34], wood: [138, 86, 48], tan: [172, 150, 106],
  olive: [92, 102, 62], lens: [80, 150, 205], red: [235, 40, 30], lamp: [255, 250, 225], brass: [200, 162, 70],
};

const b = (x0, y0, z0, x1, y1, z1, mat, tag) => [x0, y0, z0, x1, y1, z1, mat, tag];

export const GUN_MODELS = {
  [G.PISTOL]: {
    parts: [
      b(-0.8, 1.3, -6.5, 0.8, 2.9, 1.0, 'steel'), b(-0.7, 0.3, -6.0, 0.7, 1.3, 0.8, 'poly'), b(-0.75, -3.6, -0.6, 0.75, 0.3, 1.4, 'poly'),
      b(-0.25, -0.6, -2.6, 0.25, 0.3, -2.2, 'poly'), b(-0.25, -0.6, -2.6, 0.25, -0.3, -0.6, 'poly'),
      b(-0.2, 2.9, -6.1, 0.2, 3.3, -5.7, 'dark'), b(-0.5, 2.9, 0.4, 0.5, 3.3, 0.9, 'dark'),
    ],
    pts: { sight: [0, 2.9, -1.8], muzzle: [0, 2.1, -6.5], mag: [0, -3.6, 0.4], rail: [0, 0.3, -4.5] }, railDown: true,
    iron: 3.3, hold: [0, -1.4, 0.4], hand2: [0, -2.4, 0.9],
  },
  [G.SMG]: {
    parts: [
      b(-0.9, 0, -7, 0.9, 2.8, 3, 'dark'), b(-0.65, 0.9, -11, 0.65, 2.2, -7, 'steel'), b(-0.3, 1.25, -11.6, 0.3, 1.85, -11, 'dark'),
      b(-0.7, -3, 0.8, 0.7, 0, 2.8, 'poly'), b(-0.25, -0.8, -1.5, 0.25, 0, 0.8, 'poly'),
      b(-0.25, 2.8, -6.6, 0.25, 3.6, -6, 'dark'), b(-0.5, 2.8, 1.8, 0.5, 3.4, 2.6, 'dark'),
      b(-0.3, 0.6, 3, 0.3, 1.2, 9.5, 'steel', 'stock'), b(-0.9, -1.6, 9, 0.9, 1.2, 9.6, 'poly', 'stock'),
      b(-0.6, -5.5, -4.6, 0.6, 0, -3.0, 'steel', 'mag'),
    ],
    pts: { sight: [0, 2.8, -2], muzzle: [0, 1.55, -11.6], mag: [0, 0, -3.8], stock: [0, 1.2, 3], grip: [0, 0.9, -9], rail: [0.65, 1.55, -9] },
    iron: 3.5, hold: [0, -1.3, 1.8], hand2: [0, -0.6, -5.5],
  },
  [G.AK]: {
    parts: [
      b(-1, 0, -6, 1, 3, 4, 'dark'), b(-0.9, 3, -5, 0.9, 3.5, 3.5, 'steel'), b(-0.45, 1.6, -19, 0.45, 2.5, -12, 'dark'),
      b(-1.1, 0.4, -12, 1.1, 2.6, -6, 'wood'), b(-0.75, 2.6, -12, 0.75, 3.3, -6.5, 'wood'),
      b(-0.5, 1.6, -18, 0.5, 2.7, -17, 'dark'), b(-0.3, 2.7, -17.8, 0.3, 4.2, -17.2, 'dark'), b(-0.5, 3.5, -3, 0.5, 4.0, -2.3, 'dark'),
      b(-0.8, -3.2, 3, 0.8, 0, 5, 'wood'), b(-0.25, -0.8, 0.5, 0.25, 0, 3, 'dark'),
      b(-0.9, -1.2, 4, 0.9, 2.6, 13, 'wood', 'stock'),
      b(-0.8, -6, -4.3, 0.8, 0, -1.7, 'steel', 'mag'), b(-0.8, -7.5, -5.3, 0.8, -6, -2.8, 'steel', 'mag'),
    ],
    pts: { sight: [0, 3.5, -1], muzzle: [0, 2.05, -19], mag: [0, 0, -3], stock: [0, 1.2, 4], grip: [0, 0.4, -9], rail: [1.1, 1.5, -9] },
    iron: 4.2, hold: [0, -1.4, 4], hand2: [0, -0.2, -9],
  },
  [G.CARBINE]: {
    parts: [
      b(-1, -0.2, -4, 1, 2.2, 4, 'poly'), b(-1, 2.2, -5, 1, 3.8, 4, 'dark'), b(-0.6, 3.8, -5, 0.6, 4.2, 3.5, 'dark'),
      b(-1.2, 0.8, -13, 1.2, 3.8, -5, 'poly'), b(-0.4, 2, -20, 0.4, 2.8, -13, 'dark'), b(-0.3, 2.8, -15, 0.3, 4.8, -14.3, 'dark'),
      b(-0.8, -3.3, 2.2, 0.8, 0, 4.2, 'poly'), b(-0.25, -0.9, -0.5, 0.25, -0.2, 2.2, 'poly'),
      b(-0.5, 1.8, 4, 0.5, 2.8, 7, 'dark', 'stock'), b(-0.8, 0.3, 6, 0.8, 3.2, 11, 'poly', 'stock'),
      b(-0.8, -5.5, -3.6, 0.8, -0.2, -1, 'steel', 'mag'),
    ],
    pts: { sight: [0, 4.2, -0.5], muzzle: [0, 2.4, -20], mag: [0, -0.2, -2.3], stock: [0, 2.3, 4], grip: [0, 0.8, -9.5], rail: [1.2, 2.3, -10] },
    iron: 4.8, hold: [0, -1.4, 3.2], hand2: [0, 0.3, -9.5],
  },
  [G.SHOTGUN]: {
    parts: [
      b(-1, 0, -3, 1, 2.8, 4, 'dark'), b(-0.5, 1.8, -20, 0.5, 2.8, -3, 'dark'), b(-0.5, 0.6, -17, 0.5, 1.6, -3, 'steel'),
      b(-1, 0.2, -13, 1, 2.0, -8, 'wood'), b(-0.8, -2.5, 3.5, 0.8, 0, 5.5, 'wood'), b(-0.25, -0.7, 0.5, 0.25, 0, 3.2, 'dark'),
      b(-0.2, 2.8, -19.5, 0.2, 3.2, -19, 'steel'),
      b(-0.9, -1.8, 5, 0.9, 2.4, 14, 'wood', 'stock'),
    ],
    pts: { sight: [0, 2.8, 0], muzzle: [0, 2.3, -20], stock: [0, 1.2, 5], grip: [0, 0.2, -10.5], rail: [1, 1.1, -10] },
    iron: 3.2, hold: [0, -1.2, 4.5], hand2: [0, 0.2, -10.5],
  },
  [G.SNIPER]: {
    parts: [
      b(-1, 0, -4, 1, 2.6, 5, 'dark'), b(-0.5, 1.5, -24, 0.5, 2.4, -4, 'dark'), b(-1.2, -0.2, -14, 1.2, 1.8, -4, 'olive'),
      b(-0.8, -3, 4, 0.8, 0, 6, 'olive'), b(1, 1.6, 2.5, 2.4, 2.2, 3.2, 'steel'), b(-0.7, -1.6, -2.5, 0.7, 0, 0.5, 'dark'),
      b(-0.25, -0.8, 1.5, 0.25, 0, 4, 'dark'),
      b(-1, -2.2, 6, 1, 2.2, 15, 'olive', 'stock'),
    ],
    pts: { sight: [0, 2.6, 0], muzzle: [0, 1.95, -24], stock: [0, 1, 6], rail: [1.2, 0.8, -10] },
    iron: 2.9, hold: [0, -1.4, 5], hand2: [0, -0.2, -10],
  },
};

const scope = (len, bell, eye) => ({
  eye, parts: [
    b(-0.5, 0, -1.8, 0.5, 0.7, -1, 'dark'), b(-0.5, 0, 1, 0.5, 0.7, 1.8, 'dark'),
    b(-0.8, 0.7, -len, 0.8, 2.3, len, 'dark'), b(-bell, 1.5 - bell, -len - 2, bell, 1.5 + bell, -len, 'dark'),
    b(-1.05, 0.45, len, 1.05, 2.55, len + 1.7, 'dark'), b(-0.4, 2.3, -0.6, 0.4, 2.9, 0.6, 'steel'),
    b(-bell + 0.2, 1.7 - bell, -len - 2.05, bell - 0.2, 1.3 + bell, -len - 2, 'lens'),
  ],
});
export const MOD_MODELS = {
  // viseurs ouverts : on voit la cible à travers le cadre
  [G.RED]: {
    eye: 1.3, parts: [b(-0.7, 0, -1.2, 0.7, 0.5, 1.2, 'dark'), b(-0.72, 0.5, -0.5, -0.5, 2.1, 0.5, 'dark'), b(0.5, 0.5, -0.5, 0.72, 2.1, 0.5, 'dark'),
      b(-0.72, 2.0, -0.5, 0.72, 2.35, 0.5, 'dark'), b(-0.5, 0.5, -0.52, 0.5, 0.62, -0.48, 'lens')],
  },
  [G.HOLO]: {
    eye: 1.3, parts: [b(-0.9, 0, -1.6, 0.9, 0.5, 1.6, 'dark'), b(-0.95, 0.5, -1.6, -0.72, 2.3, 1.6, 'dark'), b(0.72, 0.5, -1.6, 0.95, 2.3, 1.6, 'dark'),
      b(-0.95, 2.1, -1.6, 0.95, 2.4, 1.6, 'dark'), b(-0.72, 0.5, 1.2, 0.72, 0.7, 1.6, 'steel')],
  },
  [G.SCOPE4]: scope(4.5, 1.15, 1.5),
  [G.SCOPE8]: scope(5.5, 1.4, 1.5),
  [G.SUP9]: { parts: [b(-0.7, -0.7, -6, 0.7, 0.7, 0, 'dark')] },
  [G.SUPR]: { parts: [b(-0.95, -0.95, -9, 0.95, 0.95, 0, 'dark')] },
  [G.COMP]: { parts: [b(-0.6, -0.6, -2.4, 0.6, 0.6, 0, 'steel'), b(-0.7, 0.1, -2, 0.7, 0.6, -0.5, 'dark')] },
  [G.BRAKE]: { parts: [b(-0.9, -0.55, -2.8, 0.9, 0.55, 0, 'steel'), b(-0.5, -0.5, -3.1, 0.5, 0.5, -2.8, 'dark')] },
  [G.MAG9]: { byCat: { pistol: [b(-0.65, -1.8, -0.9, 0.65, 0, 0.9, 'poly')], smg: [b(-0.6, -8.5, -0.8, 0.6, 0, 0.8, 'steel')] } },
  [G.MAGR]: { parts: [b(-0.8, -8.5, -1.3, 0.8, 0, 1.3, 'steel'), b(-0.8, -10, -2.3, 0.8, -8.5, 0.3, 'steel')] },
  [G.DRUM]: { parts: [b(-0.8, -2.5, -1.3, 0.8, 0, 1.3, 'steel'), b(-1.9, -7.5, -2.6, 1.9, -2.5, 2.4, 'dark')] },
  [G.STOCKT]: { parts: [b(-0.5, -0.5, 0, 0.5, 0.6, 4, 'dark'), b(-0.8, -1.8, 3, 0.8, 1.8, 9, 'poly')] },
  [G.STOCKP]: { parts: [b(-0.9, -2.6, 0, 0.9, 1.4, 10, 'tan'), b(-0.7, 1.4, 3, 0.7, 2.2, 8, 'tan'), b(-0.95, -2.8, 9.5, 0.95, 1.6, 10.3, 'poly')] },
  [G.GRIPV]: { parts: [b(-0.5, -3.6, -0.5, 0.5, 0, 0.5, 'poly')] },
  [G.GRIPA]: { parts: [b(-0.5, -1.4, -2, 0.5, 0, 1, 'poly'), b(-0.45, -2, 0.4, 0.45, -1.2, 1.1, 'poly')] },
  [G.LIGHT]: { parts: [b(-0.6, -0.6, -2.6, 0.6, 0.6, 1, 'dark'), b(-0.5, -0.5, -2.65, 0.5, 0.5, -2.6, 'lamp')] },
  [G.LASER]: { parts: [b(-0.5, -0.5, -2, 0.5, 0.5, 1, 'tan'), b(-0.2, -0.2, -2.05, 0.2, 0.2, -2, 'red')] },
};

export function modParts(modId, cat) {
  const mm = MOD_MODELS[modId]; if (!mm) return [];
  if (mm.byCat) return mm.byCat[cat] || mm.byCat[Object.keys(mm.byCat)[0]];
  return mm.parts;
}

// Offset d'un accessoire monté selon son emplacement
function slotOffset(model, slot) {
  const p = model.pts[slot];
  if (!p) return null;
  if (slot === 'rail') return model.railDown ? [p[0], p[1] - 0.6, p[2]] : [p[0] + 0.65, p[1], p[2]];
  return p;
}

// Liste complète des boîtes de l'arme équipée, et points utiles (bouche, ligne de visée)
export function gunGeometry(s) {
  const model = GUN_MODELS[s.id], g = GUNS[s.id];
  const m = s.m || {};
  const parts = [];
  for (const p of model.parts) { if (p[7] && m[p[7]]) continue; parts.push(p); }
  let muzzle = model.pts.muzzle.slice(), eye = model.iron, dot = false, scoped = false;
  for (const slot of g.slots) {
    const id = m[slot]; if (!id || !MODS[id]) continue;
    const off = slotOffset(model, slot); if (!off) continue;
    const mp = modParts(id, g.cat);
    let minZ = 0;
    for (const q of mp) { parts.push([q[0] + off[0], q[1] + off[1], q[2] + off[2], q[3] + off[0], q[4] + off[1], q[5] + off[2], q[6], 'mod']); minZ = Math.min(minZ, q[2]); }
    if (slot === 'muzzle') muzzle = [off[0], off[1], off[2] + minZ];
    if (slot === 'sight') { eye = off[1] + (MOD_MODELS[id].eye || 1.4); dot = !!MODS[id].dot; scoped = !!MODS[id].scope; }
  }
  return { parts, muzzle, eye, dot, scoped, hold: model.hold, hand2: model.hand2, sightZ: (model.pts.sight || [0, 0, 0])[2] };
}

// Dessin avec le lot d'entités : m = matrice (unités : pixels de l'arme)
export function drawGun(batch, m, s, L, full, tiles, geom) {
  const gg = geom || gunGeometry(s);
  for (const p of gg.parts) {
    const t = tiles['gm_' + p[6]] || tiles.gm_dark;
    const glow = p[6] === 'lamp' || p[6] === 'red' || p[6] === 'lens';
    batch.tileBox(m, p[0], p[1], p[2], p[3], p[4], p[5], t, glow && p[6] !== 'lens' ? L.glow || L : L, full);
  }
  return gg;
}
