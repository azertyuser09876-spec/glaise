// Modèles articulés (cubes texturés façon « skin 64×64 ») et leurs animations.
// Unités : pixels (1/16 de bloc). Chaque pièce : pivot (relatif au parent), boîte relative au pivot,
// coordonnées UV du patron, parent éventuel. Rotation d'une pièce : Rz · Ry · Rx.
import { mat4 } from './math.js';

const P = (name, pivot, box, uv, o = {}) => Object.assign({ name, pivot, box, uv, parent: -1 }, o);

function humanoid() {
  return [
    P('body', [0, 24, 0], [-4, -12, -2, 8, 12, 4], [16, 16]),
    P('head', [0, 24, 0], [-4, 0, -4, 8, 8, 8], [0, 0]),
    P('rarm', [-5, 22, 0], [-3, -10, -2, 4, 12, 4], [40, 16]),
    P('larm', [5, 22, 0], [-1, -10, -2, 4, 12, 4], [32, 48]),
    P('rleg', [-2, 12, 0], [-2, -12, -2, 4, 12, 4], [0, 16]),
    P('lleg', [2, 12, 0], [-2, -12, -2, 4, 12, 4], [16, 48]),
  ];
}

export const MODELS = {
  pig: {
    scale: 1, parts: [
      P('body', [0, 10, 0], [-5, -4, -8, 10, 8, 16], [0, 0]),
      P('head', [0, 12, 7], [-4, -4, 0, 8, 8, 8], [0, 24]),
      P('snout', [0, -1, 8], [-2, -2, 0, 4, 3, 1], [32, 24], { parent: 1 }),
      P('leg0', [-3, 6, 5], [-2, -6, -2, 4, 6, 4], [0, 40]),
      P('leg1', [3, 6, 5], [-2, -6, -2, 4, 6, 4], [0, 40]),
      P('leg2', [-3, 6, -5], [-2, -6, -2, 4, 6, 4], [0, 40]),
      P('leg3', [3, 6, -5], [-2, -6, -2, 4, 6, 4], [0, 40]),
    ],
  },
  sheep: {
    scale: 1, parts: [
      P('body', [0, 13, 0], [-5, -5, -8, 10, 10, 16], [0, 0]),
      P('head', [0, 15, 7], [-3, -2, 0, 6, 6, 7], [0, 26]),
      P('leg0', [-3, 8, 5], [-2, -8, -2, 4, 8, 4], [0, 40]),
      P('leg1', [3, 8, 5], [-2, -8, -2, 4, 8, 4], [0, 40]),
      P('leg2', [-3, 8, -5], [-2, -8, -2, 4, 8, 4], [0, 40]),
      P('leg3', [3, 8, -5], [-2, -8, -2, 4, 8, 4], [0, 40]),
    ],
  },
  chicken: {
    scale: 1, parts: [
      P('body', [0, 8, 0], [-3, -3, -4, 6, 6, 8], [0, 0]),
      P('head', [0, 10, 3], [-2, 0, 0, 4, 6, 3], [0, 14]),
      P('beak', [0, 3, 3], [-2, 0, 0, 4, 2, 2], [14, 14], { parent: 1 }),
      P('wattle', [0, 1, 3], [-1, 0, 0, 2, 2, 1], [26, 14], { parent: 1 }),
      P('rwing', [-3, 11, 0], [-1, -4, -3, 1, 4, 6], [0, 24]),
      P('lwing', [3, 11, 0], [0, -4, -3, 1, 4, 6], [0, 24]),
      P('rleg', [-1.5, 5, 0], [-0.5, -5, -0.5, 1, 5, 1], [16, 24]),
      P('lleg', [1.5, 5, 0], [-0.5, -5, -0.5, 1, 5, 1], [16, 24]),
    ],
  },
  zombie: { scale: 0.9375, parts: humanoid() },
  player: { scale: 0.9375, parts: humanoid() },
  bandit: { scale: 0.9375, parts: humanoid() },
  spider: {
    scale: 0.8, parts: [
      P('thorax', [0, 9, 0], [-3, -3, -3, 6, 6, 6], [32, 0]),
      P('head', [0, 9, 3], [-4, -4, 0, 8, 8, 8], [0, 0]),
      P('eyes', [0, 0, 8], [-3, 0, 0, 6, 2, 1], [36, 36], { parent: 1, glow: true }),
      P('abdomen', [0, 10, -3], [-5, -4, -12, 10, 8, 12], [0, 16]),
      ...[0, 1, 2, 3].flatMap((i) => [
        P('rleg' + i, [-3, 9, 1.5 - i * 1.5], [-1, -1, 0, 2, 2, 15], [0, 36]),
        P('lleg' + i, [3, 9, 1.5 - i * 1.5], [-1, -1, 0, 2, 2, 15], [0, 36]),
      ]),
    ],
  },
  slime: {
    scale: 1, parts: [
      P('core', [0, 0, 0], [-3, 1, -3, 6, 6, 6], [0, 16]),
      P('reye', [0, 0, 0], [-3.3, 4, 2.4, 2, 2, 1], [32, 0]),
      P('leye', [0, 0, 0], [1.3, 4, 2.4, 2, 2, 1], [32, 0]),
      P('mouth', [0, 0, 0], [-0.5, 2.2, 2.4, 1, 1, 1], [32, 4]),
      P('shell', [0, 0, 0], [-4, 0, -4, 8, 8, 8], [0, 0], { trans: true }),
    ],
  },
};
for (const m of Object.values(MODELS)) {
  m.index = {};
  m.parts.forEach((p, i) => { m.index[p.name] = i; });
}

// ------------------------------------------------------------------ Animations
// s : { t, walk (phase), amt (0..1), eat, attack, air, vy, pitch, swing, held, squash, hurt }
const FAN = [0.7, 0.25, -0.25, -0.7];

export function computePose(type, s, pose) {
  const M = MODELS[type];
  for (let i = 0; i < M.parts.length; i++) { const p = pose[i] || (pose[i] = [0, 0, 0]); p[0] = p[1] = p[2] = 0; }
  const I = M.index, sw = Math.sin(s.walk) * s.amt;
  switch (type) {
    case 'pig': case 'sheep': {
      pose[I.leg0][0] = sw * 0.9; pose[I.leg3][0] = sw * 0.9;
      pose[I.leg1][0] = -sw * 0.9; pose[I.leg2][0] = -sw * 0.9;
      pose[I.head][0] = -s.pitch * 0.5 + Math.sin(s.t * 0.7) * 0.04;
      if (type === 'sheep' && s.eat > 0) {
        const e = Math.min(1, s.eat * 3);
        pose[I.head][0] = 0.95 * e + Math.sin(s.t * 18) * 0.12 * e;
      }
      break;
    }
    case 'chicken': {
      pose[I.rleg][0] = sw * 1.2; pose[I.lleg][0] = -sw * 1.2;
      const flap = s.air ? 0.4 + Math.sin(s.t * 34) * 0.6 : Math.sin(s.t * 2) * 0.03;
      pose[I.rwing][2] = -flap; pose[I.lwing][2] = flap;
      pose[I.head][0] = Math.sin(s.walk * 2) * 0.18 * s.amt + (s.peck > 0 ? Math.sin(s.peck * Math.PI) * 0.9 : 0);
      break;
    }
    case 'zombie': case 'player': case 'bandit': {
      pose[I.rleg][0] = sw * 0.9; pose[I.lleg][0] = -sw * 0.9;
      pose[I.head][0] = -s.pitch; pose[I.head][1] = s.headYaw || 0;
      if (type === 'zombie') {
        const a = -Math.PI / 2 + Math.sin(s.t * 1.3) * 0.06 - s.attack * 0.6;
        pose[I.rarm][0] = a; pose[I.larm][0] = a + Math.sin(s.t * 1.7) * 0.05;
        pose[I.rarm][2] = 0.05 + Math.sin(s.t * 1.1) * 0.04; pose[I.larm][2] = -0.05 - Math.sin(s.t * 1.1) * 0.04;
      } else if (s.gun) {
        // arme à deux mains : en joue (suit le regard) ou baissée
        const aim = s.low ? -0.75 + sw * 0.15 : -Math.PI / 2 - s.pitch;
        pose[I.rarm][0] = aim; pose[I.rarm][1] = -0.12;
        pose[I.larm][0] = aim + (s.low ? 0.1 : 0.05); pose[I.larm][1] = s.pistol ? 0.35 : 0.6;
        if (s.kick > 0) { pose[I.rarm][0] -= s.kick * 0.25; pose[I.larm][0] -= s.kick * 0.25; }
        if (s.reload > 0) { pose[I.larm][0] = aim + 0.9 * Math.sin(s.reload * Math.PI); pose[I.larm][1] = 0.2; }
      } else {
        pose[I.rarm][0] = -sw * 0.8 - (s.held ? 0.3 : 0);
        pose[I.larm][0] = sw * 0.8;
        pose[I.rarm][2] = 0.04 + Math.sin(s.t * 1.2) * 0.03; pose[I.larm][2] = -0.04 - Math.sin(s.t * 1.2) * 0.03;
        if (s.swing > 0) {
          const k = Math.sin(Math.sqrt(s.swing) * Math.PI);
          pose[I.rarm][0] -= k * 1.3; pose[I.rarm][1] = -k * 0.4;
          pose[I.body][1] = Math.sin(Math.sqrt(s.swing) * Math.PI * 2) * 0.12;
        }
      }
      break;
    }
    case 'spider': {
      pose[I.head][0] = -s.pitch * 0.5;
      for (let i = 0; i < 4; i++) {
        const ph = s.walk * 1.4 + (i % 2) * Math.PI;
        const r = I['rleg' + i], l = I['lleg' + i];
        pose[r][1] = -Math.PI / 2 + FAN[i] + Math.sin(ph) * 0.4 * s.amt;
        pose[l][1] = Math.PI / 2 - FAN[i] + Math.sin(ph + Math.PI) * 0.4 * s.amt;
        pose[r][0] = 0.55 - Math.max(0, Math.cos(ph)) * 0.35 * s.amt - (s.attack * (i < 2 ? 0.6 : 0));
        pose[l][0] = 0.55 - Math.max(0, Math.cos(ph + Math.PI)) * 0.35 * s.amt - (s.attack * (i < 2 ? 0.6 : 0));
      }
      break;
    }
    case 'slime': break;
  }
  return pose;
}

// ------------------------------------------------------------------ Dessin
const tmp = [];
for (let i = 0; i < 24; i++) tmp.push(mat4.create());

// batch : objet avec box(m, x0,y0,z0, w,h,d, u,v, tw,th, light, trans)
// Renvoie le tableau des matrices des pièces (pour attacher un objet tenu).
export function drawModel(batch, type, skin, s, x, y, z, yaw, light, scaleMul = 1) {
  const M = MODELS[type];
  const pose = s.pose || (s.pose = []);
  computePose(type, s, pose);
  const root = tmp[23];
  mat4.identity(root);
  mat4.translate(root, x, y, z);
  mat4.rotY(root, yaw);
  let sc = (M.scale * scaleMul) / 16;
  if (type === 'slime') {
    const q = s.squash || 0;
    const sy = 1 + q, sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    mat4.scale(root, sc * sxz, sc * sy, sc * sxz);
  } else mat4.scale(root, sc, sc, sc);
  if (s.dead > 0) {
    if (type === 'slime') { const k = Math.max(0.05, 1 - s.dead * 1.6); mat4.scale(root, k, k, k); }
    else mat4.rotZ(root, Math.min(1, s.dead * 2.2) * Math.PI / 2);
  }
  const mats = s.mats || (s.mats = []);
  for (let i = 0; i < M.parts.length; i++) {
    const p = M.parts[i];
    const m = mats[i] || (mats[i] = mat4.create());
    mat4.copy(m, p.parent >= 0 ? mats[p.parent] : root);
    mat4.translate(m, p.pivot[0], p.pivot[1], p.pivot[2]);
    const r = pose[i];
    if (r[2]) mat4.rotZ(m, r[2]);
    if (r[1]) mat4.rotY(m, r[1]);
    if (r[0]) mat4.rotX(m, r[0]);
    const b = p.box;
    batch.box(m, b[0], b[1], b[2], b[3], b[4], b[5], p.uv[0], p.uv[1], 64, 64, p.glow ? light.glow : light, !!p.trans, skin);
  }
  return mats;
}

// Maille « extrudée » d'une icône 16×16 : liste de quads en pixels (z de -0.5 à 0.5).
// Chaque quad : [x0,y0,z0, x1,y1,z1, x2,y2,z2, x3,y3,z3, u0,v0,u1,v1, nx,ny,nz]
export function extrudeIcon(alphaAt) {
  const q = [];
  const solid = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && alphaAt(x, y) > 127;
  // faces avant et arrière (la texture entière, test alpha)
  q.push([0, 16, 0.5, 16, 16, 0.5, 16, 0, 0.5, 0, 0, 0.5, 0, 0, 16, 16, 0, 0, 1]);
  q.push([16, 16, -0.5, 0, 16, -0.5, 0, 0, -0.5, 16, 0, -0.5, 16, 0, 0, 16, 0, 0, -1]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!solid(x, y)) continue;
    const X = x, Y = 16 - y; // Y = haut du pixel
    const u0 = x + 0.25, u1 = x + 0.75, v0 = y + 0.25, v1 = y + 0.75;
    if (!solid(x, y - 1)) q.push([X, Y, -0.5, X + 1, Y, -0.5, X + 1, Y, 0.5, X, Y, 0.5, u0, v0, u1, v1, 0, 1, 0]);
    if (!solid(x, y + 1)) q.push([X, Y - 1, 0.5, X + 1, Y - 1, 0.5, X + 1, Y - 1, -0.5, X, Y - 1, -0.5, u0, v0, u1, v1, 0, -1, 0]);
    if (!solid(x - 1, y)) q.push([X, Y, -0.5, X, Y, 0.5, X, Y - 1, 0.5, X, Y - 1, -0.5, u0, v0, u1, v1, -1, 0, 0]);
    if (!solid(x + 1, y)) q.push([X + 1, Y, 0.5, X + 1, Y, -0.5, X + 1, Y - 1, -0.5, X + 1, Y - 1, 0.5, u0, v0, u1, v1, 1, 0, 0]);
  }
  return q;
}
