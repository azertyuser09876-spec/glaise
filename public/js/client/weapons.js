// Armes à feu côté client : visée, tir (balistique instantanée), dispersion, recul, rechargement,
// modes de tir, lampe, laser, et rendu de l'arme en vue subjective.
import { B, BLOCKS, SOLID } from '../shared/blocks.js';
import { GUNS, AMMO, gunStats, MODE_NAMES, CAL_NAME } from '../shared/guns.js';
import { gunGeometry, drawGun } from './gunmodels.js';
import { mat4, clamp, lerp } from './math.js';
import { rayBox } from './world.js';
import { MODELS } from './models.js';

const K = 0.026;          // échelle de l'arme en vue subjective (unités caméra par pixel)
const HIP = [0.2, -0.2, -0.36];
const smooth = (t) => t * t * (3 - 2 * t);
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export class Weapons {
  constructor(g) {
    this.g = g;
    this.ads = 0; this.fireCd = 0; this.reloadT = 0; this.reloadDur = 0; this.reloadType = 0; this.magIn = false;
    this.recoil = 0; this.kick = 0; this.bloom = 0; this.flash = 0; this.cycleT = 0; this.cycleSnd = 0;
    this.key = ''; this.cache = null; this.lightOn = true; this.hitT = 0; this.hitHead = false; this.firing = false;
    this.laserEnd = null;
  }

  gun() { const h = this.g.inv.held(); return h && GUNS[h.id] ? h : null; }
  info(s = this.gun()) {
    if (!s) return null;
    const k = s.id + JSON.stringify(s.m || {});
    if (k !== this.key) { this.key = k; this.cache = { st: gunStats(s), geom: gunGeometry(s) }; }
    return this.cache;
  }
  speedMul() {
    if (!this.gun()) return 1;
    if (this.ads > 0.3) return 0.55;
    if (this.firing || this.reloadT > 0) return 0.9;
    return 1;
  }
  onSwitch() { this.reloadT = 0; this.ads = 0; this.cycleT = 0; this.fireCd = Math.max(this.fireCd, 0.25); }

  // Dispersion actuelle (radians)
  spread(st) {
    const P = this.g.player;
    let s = lerp(st.hip, st.adsSpread, smooth(this.ads));
    const mv = Math.min(1, Math.hypot(P.vx, P.vz) / 4.3);
    s += st.hip * 0.7 * mv * (1 - this.ads * 0.7);
    if (!P.onGround && !P.inWater) s += st.hip * 0.9;
    if (P.crouch) s *= 0.75;
    return s + this.bloom;
  }

  // ------------------------------------------------------------ boucle
  update(dt, active) {
    const g = this.g, P = g.player;
    this.flash = Math.max(0, this.flash - dt);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    this.hitT = Math.max(0, this.hitT - dt);
    this.cycleT = Math.max(0, this.cycleT - dt * 1.6);
    if (this.cycleSnd > 0) { this.cycleSnd -= dt; if (this.cycleSnd <= 0) g.audio.gunFx(this.cycleKind); }
    // récupération partielle du recul
    const rec = this.recoil * Math.min(1, dt * (this.firing ? 1.5 : 7));
    P.pitch = clamp(P.pitch - rec, -1.55, 1.55); this.recoil -= rec;

    const s = this.gun();
    if (!s) { this.ads = 0; this.reloadT = 0; this.firing = false; this.laserEnd = null; return; }
    const { st } = this.info(s);
    const want = active && g.mouse.right && !P.sprinting && this.reloadT <= 0 && P.alive;
    this.ads = clamp(this.ads + (want ? dt / st.ads : -dt / (st.ads * 0.7)), 0, 1);

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (!this.magIn && this.reloadT < this.reloadDur * 0.4) { this.magIn = true; g.audio.gunFx(st.cat === 'shotgun' ? 'magin' : 'magin'); }
      if (this.reloadT <= 0) this.finishReload(s, st);
    }
    this.fireCd -= dt;
    const mode = st.modes[s.fm || 0];
    const trig = mode === 'auto' ? g.mouse.left : g.mouse.leftPressed;
    this.firing = active && g.mouse.left && P.alive;
    if (active && P.alive && trig && this.fireCd <= 0 && this.reloadT <= 0 && !P.sprinting) {
      if ((s.a | 0) <= 0) {
        if (g.mouse.leftPressed) { g.audio.gunFx('dry'); this.fireCd = 0.2; g.ui.toast('Chargeur vide — R pour recharger', 1200); }
      } else this.fire(s, st);
    }
    // laser : point rouge sur la cible
    this.laserEnd = null;
    if (st.laser && this.ads < 0.9) {
      const eye = this.eye(), d = this.dir();
      const r = this.traceBlocks(eye, d, 60);
      const t = r.hit ? r.hit.dist : 60;
      this.laserEnd = [eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t];
    }
  }

  eye() { const P = this.g.player; return [P.x, P.y + P.eyeH, P.z]; }
  dir(yaw = this.g.player.yaw, pitch = this.g.player.pitch) { const cp = Math.cos(pitch); return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]; }

  // ------------------------------------------------------------ tir
  fire(s, st) {
    const g = this.g, P = g.player;
    s.a = (s.a | 0) - 1; g.inv.changed();
    this.fireCd = 60 / st.rpm;
    const ammo = AMMO[s.at] || { dmg: 1, pen: 1 };
    const eye = this.eye(), yaw = P.yaw, pitch = P.pitch;
    const f = this.dir(yaw, pitch), r = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const u = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
    const spread = this.spread(st);
    const hits = new Map(), ends = [];
    const muzzle = [eye[0] + f[0] * 0.8 + r[0] * 0.16 * (1 - this.ads) - u[0] * 0.1, eye[1] + f[1] * 0.8 - u[1] * 0.1, eye[2] + f[2] * 0.8 + r[2] * 0.16 * (1 - this.ads) - u[2] * 0.1];
    let impactSnd = false;
    for (let k = 0; k < st.pellets; k++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * spread;
      const ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
      const d = norm([f[0] + r[0] * ca + u[0] * sa, f[1] + r[1] * ca + u[1] * sa, f[2] + r[2] * ca + u[2] * sa]);
      const res = this.trace(eye, d, 320);
      const end = [eye[0] + d[0] * res.t, eye[1] + d[1] * res.t, eye[2] + d[2] * res.t];
      if (ends.length < 4) ends.push(end.map((v) => Math.round(v * 100) / 100));
      if (k < 3) g.addTracer(muzzle, end);
      for (const gl of res.glass) g.breakGlass(gl);
      if (res.ent) {
        const fall = res.t > st.range ? Math.max(0.35, st.range / res.t) : 1;
        const pm = res.part === 'head' ? 2.2 : res.part === 'legs' ? 0.7 : 1;
        const key = res.kind + res.ent.id;
        const h = hits.get(key) || { k: res.kind === 'mob' ? 'm' : 'p', id: res.ent.id, dmg: 0, part: res.part, pen: ammo.pen };
        h.dmg += st.dmg * ammo.dmg * fall * pm;
        if (res.part === 'head') h.part = 'head';
        hits.set(key, h);
        g.blood(end[0], end[1], end[2], d);
      } else if (res.block) {
        g.impact(res.block, end);
        if (!impactSnd) { impactSnd = true; g.audio.impact(end, BLOCKS[res.block.id].sound); }
      }
    }
    const hl = [...hits.values()].map((h) => ({ ...h, dmg: Math.round(h.dmg * 100) / 100 }));
    if (hl.length) { this.hitT = 0.22; this.hitHead = hl.some((h) => h.part === 'head'); g.audio.hitmark(this.hitHead); }
    g.send({ t: 'shot', g: s.id, o: eye.map((v) => Math.round(v * 100) / 100), e: ends, sil: st.sil, h: hl });
    // effets
    if (!st.sil) this.flash = 0.05;
    this.kick = 1;
    this.bloom = Math.min(st.hip * 0.8, this.bloom + st.rv * 0.12);
    const rv = st.rv * (this.ads > 0.5 ? 0.8 : 1) * (P.crouch ? 0.8 : 1) * (0.85 + Math.random() * 0.3);
    P.pitch = clamp(P.pitch + rv, -1.55, 1.55); this.recoil += rv * 0.6;
    P.yaw += (Math.random() - 0.5) * 2 * st.rh;
    g.audio.gunshot(st.cat, null, st.sil);
    g.muzzleLight = st.sil ? 0 : 0.06;
    const mode = st.modes[s.fm || 0];
    if ((mode === 'pump' || mode === 'bolt') && s.a > 0) { this.cycleT = 1; this.cycleSnd = 0.22; this.cycleKind = mode === 'pump' ? 'pump' : 'bolt'; }
    if (s.a === 0) g.ui.toast('Chargeur vide', 900);
    P.exh += 0.01;
  }

  // Parcours voxel : le verre se brise, le feuillage, les plantes et l'eau laissent passer
  traceBlocks(o, d, maxD) {
    const w = this.g.world, glass = [];
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const [dx, dy, dz] = d;
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity, tdz = dz ? Math.abs(1 / dz) : Infinity;
    let tx = dx ? (sx > 0 ? x + 1 - o[0] : o[0] - x) * tdx : Infinity;
    let ty = dy ? (sy > 0 ? y + 1 - o[1] : o[1] - y) * tdy : Infinity;
    let tz = dz ? (sz > 0 ? z + 1 - o[2] : o[2] - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    const steps = Math.ceil(maxD * 3) + 4;
    for (let i = 0; i < steps; i++) {
      const id = w.get(x, y, z);
      if (id > 0) {
        if (id === B.GLASS) glass.push({ x, y, z, dist: t });
        else if (SOLID[id] && BLOCKS[id].render !== 'leaves') return { hit: { x, y, z, id, nx, ny, nz, dist: t }, glass };
      }
      if (tx < ty && tx < tz) { t = tx; if (t > maxD) break; x += sx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { t = ty; if (t > maxD) break; y += sy; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { t = tz; if (t > maxD) break; z += sz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return { hit: null, glass };
  }

  trace(eye, d, maxD) {
    const g = this.g;
    const tb = this.traceBlocks(eye, d, maxD);
    let best = tb.hit ? tb.hit.dist : maxD, ent = null, kind = null;
    for (const m of g.mobs.values()) {
      if (m.dead) continue;
      const hw = m.w / 2 + 0.04;
      const t = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], m.x - hw, m.y, m.z - hw, m.x + hw, m.y + m.h, m.z + hw);
      if (t !== null && t < best) { best = t; ent = m; kind = 'mob'; }
    }
    for (const q of g.remote.values()) {
      if (!q.alive) continue;
      const t = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], q.x - 0.32, q.y, q.z - 0.32, q.x + 0.32, q.y + 1.85, q.z + 0.32);
      if (t !== null && t < best) { best = t; ent = q; kind = 'player'; }
    }
    let part = 'body';
    if (ent) {
      const H = ent.h || 1.85, yh = eye[1] + d[1] * best - ent.y;
      const human = kind === 'player' || ent.type === 'zombie' || ent.type === 'bandit';
      part = human ? (yh > H * 0.76 ? 'head' : yh < H * 0.4 ? 'legs' : 'body') : (yh > H * 0.72 ? 'head' : 'body');
    }
    return { t: best, block: ent ? null : tb.hit, ent, kind, part, glass: tb.glass.filter((gl) => gl.dist < best) };
  }

  // ------------------------------------------------------------ rechargement, mode, lampe
  reload() {
    const g = this.g, s = this.gun();
    if (!s || this.reloadT > 0) return;
    const { st } = this.info(s), inv = g.inv;
    if ((s.a | 0) >= st.mag) return;
    let type = s.at && inv.count(s.at) > 0 ? s.at : 0;
    if (!type) type = Object.keys(AMMO).map(Number).filter((k) => AMMO[k].cal === st.cal && inv.count(k) > 0).sort((a, b) => inv.count(b) - inv.count(a))[0] || 0;
    if (!type) { g.ui.toast(`Plus de munitions (${CAL_NAME[st.cal]})`); g.audio.gunFx('dry'); return; }
    this.reloadType = type; this.reloadT = this.reloadDur = st.reload; this.magIn = false; this.ads = 0;
    g.audio.gunFx(st.cat === 'shotgun' ? 'pump' : 'magout');
    g.send({ t: 'act', a: 'reload' });
  }
  finishReload(s, st) {
    const g = this.g, inv = g.inv, type = this.reloadType;
    if (s !== this.gun()) return;
    if (s.at && s.at !== type && s.a > 0) { const left = inv.add({ id: s.at, n: s.a }); if (left) g.dropItem({ id: s.at, n: left }, false); s.a = 0; }
    const need = st.mag - (s.a | 0), n = Math.min(need, inv.count(type));
    if (n > 0) { inv.remove(type, n); s.a = (s.a | 0) + n; s.at = type; }
    inv.changed();
    g.audio.gunFx(st.modes[0] === 'bolt' || st.modes[0] === 'pump' ? 'bolt' : 'bolt');
  }
  toggleMode() {
    const s = this.gun(); if (!s) return;
    const { st } = this.info(s);
    if (st.modes.length < 2) return;
    s.fm = ((s.fm | 0) + 1) % st.modes.length;
    this.g.inv.changed();
    this.g.audio.gunFx('mode');
    this.g.ui.toast(MODE_NAMES[st.modes[s.fm]], 1000);
  }
  toggleLight() {
    const s = this.gun(); if (!s || !this.info(s).st.light) return;
    this.lightOn = !this.lightOn; this.g.audio.gunFx('light');
  }
  flashlight() { const s = this.gun(); return !!(s && this.lightOn && this.info(s).st.light); }
  scoped() { const s = this.gun(); return !!(s && this.info(s).st.scope && this.ads > 0.85); }
  zoom() { const s = this.gun(); if (!s) return 1; return lerp(1, this.info(s).st.zoom, smooth(this.ads)); }

  // ------------------------------------------------------------ vue subjective
  drawFP(L, bob) {
    const g = this.g, s = this.gun(); if (!s) return false;
    const { st, geom } = this.info(s);
    if (this.scoped()) return true;
    const bt = g.r.batch, P = g.player;
    const a = smooth(this.ads);
    const hold = geom.hold;
    const adsPos = [K * hold[0], -K * (geom.eye - hold[1]), -(geom.scoped ? 0.2 : 0.26) - K * (geom.sightZ - hold[2])];
    const pos = [lerp(HIP[0], adsPos[0], a), lerp(HIP[1], adsPos[1], a), lerp(HIP[2], adsPos[2], a)];
    const bk = 1 - a * 0.85;
    pos[0] += bob[0] * bk; pos[1] += bob[1] * bk;
    const kick = this.kick * this.kick;
    pos[2] += kick * 0.06 * (1 - a * 0.4);
    const rl = this.reloadT > 0 ? Math.sin((1 - this.reloadT / this.reloadDur) * Math.PI) : 0;
    const eq = (1 - g.equip);
    pos[1] -= rl * 0.08 + eq * 0.4;
    const sprint = P.sprinting ? 1 : 0;
    this.sprintK = lerp(this.sprintK || 0, sprint, 0.15);
    pos[1] -= this.sprintK * 0.08; pos[0] -= this.sprintK * 0.04;
    const m = mat4.create();
    mat4.translate(m, pos[0], pos[1], pos[2]);
    mat4.rotY(m, 0.04 * (1 - a) + this.sprintK * 0.7);
    mat4.rotX(m, kick * 0.09 * (1 - a * 0.5) + rl * 0.35 - this.sprintK * 0.35 + this.cycleT * 0.12);
    mat4.rotZ(m, rl * 0.6 + this.sprintK * 0.3);
    mat4.scale(m, K, K, K);
    mat4.translate(m, -hold[0], -hold[1], -hold[2]);
    // la pièce « chargeur » descend pendant le rechargement
    drawGun(bt, m, s, L, true, g.A.tile, geom);
    this.drawArms(m, geom, L, rl, st.cat === 'pistol');
    // éclair de bouche
    if (this.flash > 0) {
      const mz = geom.muzzle, p = [m[0] * mz[0] + m[4] * mz[1] + m[8] * (mz[2] - 1.5) + m[12], m[1] * mz[0] + m[5] * mz[1] + m[9] * (mz[2] - 1.5) + m[13], m[2] * mz[0] + m[6] * mz[1] + m[10] * (mz[2] - 1.5) + m[14]];
      const sz = st.cat === 'pistol' ? 0.07 : 0.11, t = g.A.tile.fx_flash, rot = Math.random() * 6.28;
      const cx = Math.cos(rot) * sz, cy = Math.sin(rot) * sz;
      const q = [p[0] - cx + cy, p[1] - cy - cx, p[2], p[0] + cx + cy, p[1] + cy - cx, p[2], p[0] + cx - cy, p[1] + cy + cx, p[2], p[0] - cx - cy, p[1] - cy + cx, p[2]];
      bt.quad(g.r.atlas, q, [t[0], t[1], t[0] + 16, t[1], t[0] + 16, t[1] + 16, t[0], t[1] + 16], 256, 256, { sky: 1, blk: 1, flash: 0 }, true, true, 1);
    }
    return true;
  }

  drawArms(gm, geom, L, rl, pistol) {
    const g = this.g, bt = g.r.batch;
    const tex = g.myTex, part = MODELS.player.parts[MODELS.player.index.rarm];
    if (!tex) return;
    const arm = (at, rz, rx) => {
      const m = mat4.copy(mat4.create(), gm);
      mat4.translate(m, at[0], at[1], at[2]);
      mat4.rotZ(m, rz); mat4.rotX(m, rx);
      mat4.translate(m, 1, 10, 0);
      const b = part.box;
      bt.box(m, b[0], b[1], b[2], b[3], b[4], b[5], part.uv[0], part.uv[1], 64, 64, L, false, tex, true);
    };
    arm(geom.hold, -0.35, 2.1);
    const h2 = geom.hand2;
    arm([h2[0], h2[1] - rl * 4, h2[2] + rl * 6], pistol ? 0.3 : 0.55, pistol ? 2.2 : 1.85);
  }
}

export { MODE_NAMES, CAL_NAME };
