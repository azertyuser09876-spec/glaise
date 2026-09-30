// Statistiques des 6 créatures (partagé client / serveur).
import { B, I } from './blocks.js';

export const MOB_TYPES = ['pig', 'sheep', 'chicken', 'zombie', 'spider', 'slime', 'bandit'];

export const MOBS = {
  pig: { name: 'Cochon', hp: 10, w: 0.85, h: 0.9, speed: 1.5, drops: [[I.RAW_PORK, 1, 3]] },
  sheep: { name: 'Mouton', hp: 8, w: 0.85, h: 1.2, speed: 1.4, drops: [[B.WOOL, 1, 2], [I.RAW_MUTTON, 1, 2]] },
  chicken: { name: 'Poule', hp: 4, w: 0.45, h: 0.7, speed: 1.3, drops: [[I.RAW_CHICKEN, 1, 1], [I.FEATHER, 0, 2]] },
  zombie: { name: 'Zombie', hp: 20, w: 0.6, h: 1.85, speed: 2.3, hostile: true, dmg: 3, range: 1.5, drops: [[I.ROTTEN_FLESH, 0, 2], [I.IRON_INGOT, 0, 1, 0.07]] },
  spider: { name: 'Araignée', hp: 16, w: 1.2, h: 0.85, speed: 3.1, hostile: true, dmg: 2, range: 1.8, drops: [[I.STRING, 0, 2]] },
  slime: { name: 'Slime', hp: 4, w: 0.5, h: 0.5, speed: 2.6, hostile: true, dmg: 1, range: 0.6, drops: [[I.SLIMEBALL, 0, 2]] },
  bandit: { name: 'Pillard', hp: 20, w: 0.6, h: 1.8, speed: 2.6, hostile: true, npc: true, dmg: 0, range: 0, drops: [] },
};

// Taille (slime) : multiplie dimensions, points de vie et dégâts
export function mobDims(type, size = 1) {
  const m = MOBS[type];
  if (type !== 'slime') return { w: m.w, h: m.h, hp: m.hp, dmg: m.dmg || 0 };
  return { w: m.w * size, h: m.h * size, hp: m.hp * size * size, dmg: m.dmg * size };
}

export function rollDrops(type, rnd, size = 1) {
  if (type === 'slime' && size > 1) return [];
  const out = [];
  for (const [id, a, b, chance] of MOBS[type].drops) {
    if (chance !== undefined && rnd() > chance) continue;
    const n = a + Math.floor(rnd() * (b - a + 1));
    if (n > 0) out.push([id, n]);
  }
  return out;
}
