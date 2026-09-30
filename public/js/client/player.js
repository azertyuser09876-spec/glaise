// Joueur local : déplacements, eau, chutes, santé, faim, souffle.
import { moveEntity, boxHitsSolid } from '../shared/physics.js';
import { B, BLOCKS, I } from '../shared/blocks.js';
import { ARMOR } from '../shared/guns.js';
import { EQ_HELMET, EQ_VEST } from './inventory.js';
import { clamp } from './math.js';

export const EYE = 1.62;
const GRAV = 28, JUMP = 8.5, WALK = 4.3, SPRINT = 5.6, SWIM = 2.2;

export class LocalPlayer {
  constructor(game) {
    this.g = game;
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.w = 0.6; this.h = 1.8;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.inWater = false; this.headUnder = false;
    this.hp = 20; this.hunger = 20; this.exh = 0; this.air = 10;
    this.regenT = 0; this.starveT = 0; this.drownT = 0; this.voidT = 0;
    this.invuln = 0; this.alive = true;
    this.fallStart = null; this.sprinting = false; this.stepDist = 0;
    this.walkPhase = 0; this.walkAmt = 0; this.bob = 0;
    this.lastForward = -1; this.doubleTap = false;
    this.hurtTilt = 0; this.kbT = 0;
    this.lastCause = null; this.lastKiller = 0;
    this.eyeH = EYE; this.crouch = false;
    this.bleed = false; this.bleedT = 0; this.stimT = 0; this.stimRegen = 0; this.stimRegenT = 0;
  }
  resetStatus() { this.bleed = false; this.bleedT = 0; this.stimT = 0; this.stimRegen = 0; this.air = 10; this.exh = 0; this.invuln = 0; this.fallStart = null; }

  place(x, y, z) { this.x = x; this.y = y; this.z = z; this.vx = this.vy = this.vz = 0; this.fallStart = null; }

  blockAt(dy) { return this.g.world.get(Math.floor(this.x), Math.floor(this.y + dy), Math.floor(this.z)); }

  update(dt, inp) {
    const w = this.g.world;
    if (!w.loaded(this.x, this.z)) return;
    const feet = this.blockAt(0.1), body = this.blockAt(0.9), head = this.blockAt(EYE);
    const wasWater = this.inWater;
    this.inWater = feet === B.WATER || body === B.WATER;
    this.headUnder = head === B.WATER;
    if (this.inWater && !wasWater && this.vy < -6) this.g.audio.splash([this.x, this.y, this.z]);

    // Direction voulue
    let f = 0, s = 0;
    if (this.alive && inp.active) {
      if (inp.keys.KeyW) f += 1;
      if (inp.keys.KeyS) f -= 1;
      if (inp.keys.KeyD) s += 1;
      if (inp.keys.KeyA) s -= 1;
      if (inp.move) { f += inp.move.f; s += inp.move.s; }   // joystick tactile (analogique)
    }
    const amt = Math.min(1, Math.hypot(f, s));
    if (inp.forwardTap) { this.doubleTap = true; inp.forwardTap = false; }
    this.crouch = this.alive && inp.active && !!inp.keys.KeyC && !this.inWater;
    const gunMul = this.g.weapons ? this.g.weapons.speedMul() : 1;
    const wantSprint = (inp.keys.ShiftLeft || inp.keys.ShiftRight || this.doubleTap || inp.sprint) && f > 0 && this.hunger > 6 && !this.inWater && !this.crouch && gunMul >= 1;
    this.sprinting = wantSprint;
    if (f <= 0) this.doubleTap = false;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx *= amt / wl; wz *= amt / wl; }
    let speed = this.inWater ? SWIM : this.sprinting ? SPRINT * (this.stimT > 0 ? 1.18 : 1) : WALK * Math.min(1, gunMul);
    if (this.crouch) speed *= 0.45;
    this.eyeH += ((this.crouch ? EYE - 0.35 : EYE) - this.eyeH) * Math.min(1, dt * 12);
    const k = Math.min(1, (this.onGround ? 14 : this.inWater ? 5 : 3) * dt);
    if (this.kbT > 0) this.kbT -= dt;
    else { this.vx += (wx * speed - this.vx) * k; this.vz += (wz * speed - this.vz) * k; }

    const jump = this.alive && inp.active && inp.keys.Space;
    if (this.inWater) {
      this.vy -= 12 * dt;
      this.vy *= Math.pow(0.35, dt);
      if (jump) this.vy = Math.min(this.vy + 30 * dt, 3.4);
      this.vy = Math.max(this.vy, -4);
      if (jump && (this.blockAt(0.1) !== B.WATER || this.onGround) && this.hitWallAhead()) this.vy = 6;
    } else {
      this.vy -= GRAV * dt;
      if (jump && this.onGround) {
        this.vy = JUMP;
        if (this.sprinting) { this.vx += wx * 1.2; this.vz += wz * 1.2; this.exh += 0.2; }
        else this.exh += 0.05;
      }
    }
    this.vy = Math.max(this.vy, -55);

    const ox = this.x, oz = this.z;
    const r = moveEntity(w, this, dt);
    const land = r.ground && !this.onGround;
    this.onGround = r.ground;
    if (r.hx || r.hz) this.sprinting = this.sprinting && false;

    // Chutes
    if (!this.onGround && !this.inWater) {
      if (this.fallStart === null || this.y > this.fallStart) this.fallStart = this.y;
    }
    if (this.inWater) this.fallStart = null;
    if (land) {
      const below = this.g.world.get(Math.floor(this.x), Math.floor(this.y - 0.05), Math.floor(this.z));
      const dist = this.fallStart !== null ? this.fallStart - this.y : 0;
      if (below === B.SLIME_BLOCK && r.fall > 4) {
        this.vy = r.fall * 0.82; this.onGround = false; this.fallStart = this.y;
        this.g.audio.step('slime', null, 0.6);
      } else {
        if (dist > 3.2 && this.alive) {
          const dmg = Math.floor(dist - 3);
          if (this.g.inv.count(I.CHARM) > 0) this.g.ui.toast('Le talisman amortit la chute');
          else if (dmg > 0) this.damage(dmg, 'est tombé de trop haut.');
        }
        if (dist > 1) this.stepSound(0.5);
      }
      if (below !== B.SLIME_BLOCK || r.fall <= 4) this.fallStart = null;
    }

    // Pas et balancement
    const moved = Math.hypot(this.x - ox, this.z - oz);
    if (this.onGround && moved > 0.001) {
      this.stepDist += moved;
      this.exh += moved * (this.sprinting ? 0.03 : 0.01);
      if (this.stepDist > (this.sprinting ? 2.2 : 1.8)) { this.stepDist = 0; this.stepSound(0.3); }
    } else if (this.inWater) this.exh += moved * 0.015;
    const hs = Math.hypot(this.vx, this.vz);
    this.walkAmt += ((this.onGround && hs > 0.5 ? Math.min(1, hs / WALK) : 0) - this.walkAmt) * Math.min(1, dt * 10);
    this.walkPhase += hs * dt * 2.1;

    this.survival(dt);
    this.hurtTilt = Math.max(0, this.hurtTilt - dt * 3);
    if (this.invuln > 0) this.invuln -= dt;
  }

  hitWallAhead() {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    return this.g.world.solid(Math.floor(this.x - sy * 0.6), Math.floor(this.y + 0.2), Math.floor(this.z - cy * 0.6));
  }

  stepSound(vol) {
    const id = this.g.world.get(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
    if (id > 0 && BLOCKS[id]) this.g.audio.step(BLOCKS[id].sound, null, vol);
  }

  survival(dt) {
    if (!this.alive) return;
    this.exh += 0.02 * dt;
    while (this.exh >= 1) { this.exh -= 1; this.hunger = Math.max(0, this.hunger - 1); }
    // régénération
    if (this.hunger >= 18 && this.hp < 20) {
      this.regenT += dt;
      if (this.regenT > 3) { this.regenT = 0; this.hp = Math.min(20, this.hp + 1); this.exh += 0.6; }
    } else this.regenT = 0;
    // famine
    if (this.hunger <= 0) {
      this.starveT += dt;
      if (this.starveT > 4) { this.starveT = 0; if (this.hp > 1) this.damage(1, 'est mort de faim.'); }
    } else this.starveT = 0;
    // souffle
    if (this.headUnder) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) { this.drownT += dt; if (this.drownT > 1) { this.drownT = 0; this.damage(2, "s'est noyé."); } }
    } else this.air = Math.min(10, this.air + dt * 4);
    // hémorragie, stimulant
    if (this.bleed) { this.bleedT += dt; if (this.bleedT > 5) { this.bleedT = 0; this.damage(1, 'a succombé à une hémorragie.'); } }
    if (this.stimT > 0) this.stimT -= dt;
    if (this.stimRegen > 0) { this.stimRegenT += dt; if (this.stimRegenT > 1) { this.stimRegenT = 0; this.stimRegen--; this.hp = Math.min(20, this.hp + 1); } }
    // vide
    if (this.y < -12) { this.voidT += dt; if (this.voidT > 0.5) { this.voidT = 0; this.damage(4, 'est tombé dans le vide.'); } }
  }

  damage(n, cause, fromX, fromZ, o = {}) {
    if (!this.alive || n <= 0) return;
    if (!o.bullet && this.invuln > 0 && fromX !== undefined) return;
    if (o.bullet) {
      // armure : casque pour la tête, gilet pour le torse
      const inv = this.g.inv, slot = o.part === 'head' ? EQ_HELMET : o.part === 'body' ? EQ_VEST : -1;
      const a = slot >= 0 ? inv.slots[slot] : null, def = a && ARMOR[a.id];
      if (def && (a.d || 0) < def.dur) {
        const block = clamp(0.32 + 0.13 * def.cls - 0.11 * (o.pen || 1), 0.05, 0.88);
        a.d = Math.min(def.dur, (a.d || 0) + n * (1 + (o.pen || 1) * 0.25));
        n *= 1 - block;
        inv.changed();
        this.g.armorHit(def, a.d >= def.dur);
      }
      if (n >= 1.5 && Math.random() < (o.part === 'legs' ? 0.4 : 0.28)) { if (!this.bleed) this.g.ui.toast('Hémorragie ! Utilisez un bandage.'); this.bleed = true; }
    }
    this.hp = Math.max(0, this.hp - n);
    this.invuln = o.bullet ? 0 : 0.5;
    this.hurtTilt = Math.min(1.5, this.hurtTilt + (o.bullet ? 0.6 : 1));
    this.exh += 0.1;
    this.lastCause = cause;
    if (o.srcId) this.lastKiller = o.srcId;
    this.g.onHurt(fromX, fromZ, n);
    if (fromX !== undefined && !o.bullet) {
      const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
      this.vx = (dx / d) * 7; this.vz = (dz / d) * 7; this.vy = Math.max(this.vy, 5); this.kbT = 0.25;
    }
    if (this.hp <= 0) this.g.onDeath(cause);
  }

  useMed(med) {
    if (med.heal) this.hp = Math.min(20, this.hp + med.heal);
    if (med.bleed) this.bleed = false;
    if (med.regen) this.stimRegen = med.regen;
    if (med.speed) this.stimT = med.speed;
  }

  eat(food) {
    this.hunger = clamp(this.hunger + food.hunger, 0, 20);
    if (food.heal) this.hp = Math.min(20, this.hp + food.heal);
  }

  intersectsBlock(x, y, z) {
    const hw = this.w / 2;
    return this.x + hw > x && this.x - hw < x + 1 && this.y + this.h > y && this.y < y + 1 && this.z + hw > z && this.z - hw < z + 1;
  }
}

export { boxHitsSolid };
