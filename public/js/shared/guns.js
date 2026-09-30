// Contenu « extraction » : armes à feu modulables, munitions, accessoires, armures, soins,
// objets de valeur, tables de butin et marchand. Partagé client / serveur.
// Ce module complète ITEMS et RECIPES de blocks.js : il doit être importé par chaque point d'entrée.
import { B, I, ITEMS, BLOCKS, RECIPES, toolId } from './blocks.js';

export const G = {
  PISTOL: 140, SMG: 141, AK: 142, CARBINE: 143, SHOTGUN: 144, SNIPER: 145,
  A9: 150, A556: 151, A762: 152, A12: 153, A556AP: 154, A762AP: 155,
  RED: 160, HOLO: 161, SCOPE4: 162, SCOPE8: 163, SUP9: 164, SUPR: 165, COMP: 166, BRAKE: 167,
  MAG9: 168, MAGR: 169, DRUM: 170, STOCKT: 171, STOCKP: 172, GRIPV: 173, GRIPA: 174, LIGHT: 175, LASER: 176,
  HELM1: 180, HELM2: 181, VEST1: 182, VEST2: 183, VEST3: 184,
  BANDAGE: 186, MEDKIT: 187, STIM: 188,
  WATCH: 190, GPU: 191, USB: 192, BATTERY: 193, CIGS: 194, SCREWS: 195, RADIO: 196, DOCS: 197,
  STEW: 198, BAR: 199,
};

// ------------------------------------------------------------------ Munitions
export const AMMO = {
  [G.A9]: { name: 'Cartouches 9 mm', cal: '9', dmg: 1, pen: 1, icon: 'ammo9' },
  [G.A556]: { name: 'Cartouches 5,56 mm', cal: '556', dmg: 1, pen: 3, icon: 'ammo556' },
  [G.A762]: { name: 'Cartouches 7,62 mm', cal: '762', dmg: 1, pen: 3, icon: 'ammo762' },
  [G.A12]: { name: 'Cartouches calibre 12', cal: '12', dmg: 1, pen: 1, icon: 'ammo12' },
  [G.A556AP]: { name: '5,56 mm perforantes', cal: '556', dmg: 0.92, pen: 5, icon: 'ammo556ap' },
  [G.A762AP]: { name: '7,62 mm perforantes', cal: '762', dmg: 0.95, pen: 5, icon: 'ammo762ap' },
};
export const CAL_NAME = { 9: '9 mm', 556: '5,56 mm', 762: '7,62 mm', 12: 'calibre 12' };

// ------------------------------------------------------------------ Armes
// dmg en points de vie (20 = vie pleine), spread en radians, recoil en radians par tir, ads en secondes,
// range : distance où les dégâts commencent à baisser, noise : distance à laquelle le tir s'entend.
export const SLOT_NAMES = { sight: 'Viseur', muzzle: 'Bouche', mag: 'Chargeur', stock: 'Crosse', grip: 'Poignée', rail: 'Rail' };
export const GUNS = {
  [G.PISTOL]: {
    name: 'Pistolet PM-9', cat: 'pistol', cal: '9', modes: ['semi'], rpm: 420, dmg: 4, mag: 12, reload: 1.5,
    hip: 0.028, adsSpread: 0.007, rv: 0.022, rh: 0.009, ads: 0.16, range: 35, noise: 70, zoom: 1.15, slots: ['sight', 'muzzle', 'mag', 'rail'], value: 900,
  },
  [G.SMG]: {
    name: 'Pistolet-mitrailleur Vespa', cat: 'smg', cal: '9', modes: ['auto', 'semi'], rpm: 850, dmg: 3.2, mag: 30, reload: 2.0,
    hip: 0.036, adsSpread: 0.011, rv: 0.012, rh: 0.011, ads: 0.2, range: 40, noise: 75, zoom: 1.2, slots: ['sight', 'muzzle', 'mag', 'stock', 'grip', 'rail'], value: 3200,
  },
  [G.AK]: {
    name: "Fusil d'assaut AKG", cat: 'rifle', cal: '762', modes: ['auto', 'semi'], rpm: 600, dmg: 6, mag: 30, reload: 2.6,
    hip: 0.048, adsSpread: 0.008, rv: 0.028, rh: 0.016, ads: 0.28, range: 80, noise: 110, zoom: 1.25, slots: ['sight', 'muzzle', 'mag', 'stock', 'grip', 'rail'], value: 7500,
  },
  [G.CARBINE]: {
    name: 'Carabine M-G4', cat: 'rifle', cal: '556', modes: ['auto', 'semi'], rpm: 780, dmg: 5, mag: 30, reload: 2.3,
    hip: 0.044, adsSpread: 0.006, rv: 0.019, rh: 0.01, ads: 0.26, range: 90, noise: 105, zoom: 1.25, slots: ['sight', 'muzzle', 'mag', 'stock', 'grip', 'rail'], value: 9500,
  },
  [G.SHOTGUN]: {
    name: 'Fusil à pompe Tonnerre', cat: 'shotgun', cal: '12', modes: ['pump'], rpm: 70, dmg: 2.3, pellets: 8, mag: 6, reload: 3.0,
    hip: 0.075, adsSpread: 0.055, rv: 0.075, rh: 0.02, ads: 0.26, range: 14, noise: 110, zoom: 1.15, slots: ['sight', 'stock', 'grip', 'rail'], value: 4200,
  },
  [G.SNIPER]: {
    name: 'Fusil de précision Faucon', cat: 'sniper', cal: '762', modes: ['bolt'], rpm: 48, dmg: 15, mag: 5, reload: 3.0,
    hip: 0.09, adsSpread: 0.0008, rv: 0.09, rh: 0.012, ads: 0.4, range: 220, noise: 140, zoom: 1.3, slots: ['sight', 'muzzle', 'stock', 'rail'], value: 14000,
  },
};
export const MODE_NAMES = { auto: 'Automatique', semi: 'Coup par coup', pump: 'À pompe', bolt: 'À verrou' };

// ------------------------------------------------------------------ Accessoires
// fx : multiplicateurs (rv, rh, hip, adsSpread, ads, noise, dmg, reload) ; zoom, scope, mag (capacité par catégorie)
export const MODS = {
  [G.RED]: { name: 'Viseur point rouge', slot: 'sight', fits: ['pistol', 'smg', 'rifle', 'shotgun'], zoom: 1.35, dot: true, fx: { ads: 0.92 }, value: 1400 },
  [G.HOLO]: { name: 'Viseur holographique', slot: 'sight', fits: ['smg', 'rifle', 'shotgun'], zoom: 1.5, dot: true, fx: { ads: 1, adsSpread: 0.9 }, value: 2600 },
  [G.SCOPE4]: { name: 'Lunette ×4', slot: 'sight', fits: ['rifle', 'sniper'], zoom: 4, scope: true, fx: { ads: 1.3, adsSpread: 0.75 }, value: 4800 },
  [G.SCOPE8]: { name: 'Lunette ×8', slot: 'sight', fits: ['rifle', 'sniper'], zoom: 8, scope: true, fx: { ads: 1.5, adsSpread: 0.6 }, value: 8000 },
  [G.SUP9]: { name: 'Silencieux 9 mm', slot: 'muzzle', fits: ['pistol', 'smg'], sil: true, fx: { noise: 0.18, dmg: 0.95, rv: 0.92 }, value: 2200 },
  [G.SUPR]: { name: 'Silencieux de fusil', slot: 'muzzle', fits: ['rifle', 'sniper'], sil: true, fx: { noise: 0.2, dmg: 0.95, rv: 0.9, ads: 1.05 }, value: 4500 },
  [G.COMP]: { name: 'Compensateur', slot: 'muzzle', fits: ['pistol', 'smg', 'rifle'], fx: { rh: 0.65, rv: 0.88 }, value: 1100 },
  [G.BRAKE]: { name: 'Frein de bouche', slot: 'muzzle', fits: ['rifle', 'sniper'], fx: { rv: 0.7, rh: 0.9, noise: 1.2 }, value: 1600 },
  [G.MAG9]: { name: 'Chargeur 9 mm étendu', slot: 'mag', fits: ['pistol', 'smg'], mag: { pistol: 21, smg: 45 }, fx: { reload: 1.1, ads: 1.04 }, value: 900 },
  [G.MAGR]: { name: 'Chargeur de fusil 45 coups', slot: 'mag', fits: ['rifle'], mag: { rifle: 45 }, fx: { reload: 1.12, ads: 1.05 }, value: 1500 },
  [G.DRUM]: { name: 'Chargeur tambour 75 coups', slot: 'mag', fits: ['rifle'], mag: { rifle: 75 }, fx: { reload: 1.45, ads: 1.18 }, value: 3800 },
  [G.STOCKT]: { name: 'Crosse tactique', slot: 'stock', fits: ['smg', 'rifle', 'shotgun'], fx: { rv: 0.8, rh: 0.85, ads: 0.95 }, value: 1300 },
  [G.STOCKP]: { name: 'Crosse de précision', slot: 'stock', fits: ['rifle', 'sniper', 'shotgun'], fx: { rv: 0.86, adsSpread: 0.7, ads: 1.1 }, value: 2400 },
  [G.GRIPV]: { name: 'Poignée verticale', slot: 'grip', fits: ['smg', 'rifle', 'shotgun'], fx: { rv: 0.84, hip: 0.85 }, value: 700 },
  [G.GRIPA]: { name: "Poignée d'angle", slot: 'grip', fits: ['smg', 'rifle', 'shotgun'], fx: { ads: 0.8, rh: 0.85 }, value: 900 },
  [G.LIGHT]: { name: 'Lampe tactique', slot: 'rail', fits: ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'], light: true, fx: {}, value: 800 },
  [G.LASER]: { name: 'Module laser', slot: 'rail', fits: ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'], laser: true, fx: { hip: 0.6 }, value: 1800 },
};

// ------------------------------------------------------------------ Armures, soins, valeurs
export const ARMOR = {
  [G.HELM1]: { name: 'Casque léger en kevlar', slot: 'helmet', cls: 2, dur: 40, value: 2500, icon: 'helm1' },
  [G.HELM2]: { name: 'Casque balistique', slot: 'helmet', cls: 4, dur: 60, value: 7000, icon: 'helm2' },
  [G.VEST1]: { name: 'Gilet pare-balles léger', slot: 'vest', cls: 2, dur: 50, value: 3000, icon: 'vest1' },
  [G.VEST2]: { name: 'Gilet tactique', slot: 'vest', cls: 3, dur: 80, value: 6500, icon: 'vest2' },
  [G.VEST3]: { name: 'Plaque balistique lourde', slot: 'vest', cls: 5, dur: 120, value: 14000, icon: 'vest3' },
};
export const MEDS = {
  [G.BANDAGE]: { name: 'Bandage', time: 2, heal: 1, bleed: true, value: 250, icon: 'bandage', desc: "Arrête l'hémorragie" },
  [G.MEDKIT]: { name: 'Trousse de secours', time: 4, heal: 9, bleed: true, value: 1800, icon: 'medkit', desc: 'Soigne et arrête les saignements' },
  [G.STIM]: { name: 'Stimulant', time: 1.5, heal: 3, regen: 12, speed: 30, value: 2600, icon: 'stim', desc: 'Régénération et course plus rapide' },
};
const VALUABLES = [
  [G.WATCH, 'Montre en or', 'watch', 3200], [G.GPU, 'Carte graphique', 'gpu', 16000], [G.USB, 'Clé USB chiffrée', 'usb', 6500],
  [G.BATTERY, 'Batterie militaire', 'battery', 5200], [G.CIGS, 'Paquet de cigarettes', 'cigs', 450], [G.SCREWS, 'Bocal de vis', 'screws', 350],
  [G.RADIO, 'Radio portative', 'radio', 2200], [G.DOCS, 'Dossier confidentiel', 'docs', 9000],
];

// ------------------------------------------------------------------ Enregistrement dans ITEMS
function reg(id, name, icon, o = {}) { ITEMS[id] = Object.assign({ id, name, icon, stack: 1, block: false }, o); }
for (const id in GUNS) reg(+id, GUNS[id].name, 'gun', { gun: GUNS[id], value: GUNS[id].value });
for (const id in AMMO) reg(+id, AMMO[id].name, AMMO[id].icon, { ammo: AMMO[id], stack: 90, value: { 9: 8, 556: 16, 762: 18, 12: 12 }[AMMO[id].cal] * (AMMO[id].pen >= 5 ? 2.5 : 1) });
for (const id in MODS) reg(+id, MODS[id].name, 'mod', { mod: MODS[id], value: MODS[id].value });
for (const id in ARMOR) reg(+id, ARMOR[id].name, ARMOR[id].icon, { armor: ARMOR[id], value: ARMOR[id].value });
for (const id in MEDS) reg(+id, MEDS[id].name, MEDS[id].icon, { med: MEDS[id], stack: 5, value: MEDS[id].value, desc: MEDS[id].desc });
for (const [id, name, icon, v] of VALUABLES) reg(id, name, icon, { stack: 5, value: v, valuable: true, desc: 'Objet de valeur : à revendre au marchand' });
reg(G.STEW, 'Conserve de ragoût', 'stew', { stack: 8, food: { hunger: 10 }, value: 300 });
reg(G.BAR, 'Barre énergétique', 'bar', { stack: 8, food: { hunger: 5 }, value: 180 });

// Valeur marchande de base des objets existants
const BASE_VALUE = {
  [I.IRON_INGOT]: 60, [I.GOLD_INGOT]: 220, [I.DIAMOND]: 900, [I.COAL]: 10, [I.STRING]: 12, [I.FEATHER]: 6, [I.SLIMEBALL]: 20,
  [I.GOLDEN_APPLE]: 1200, [I.CHARM]: 1500, [I.COOKED_PORK]: 60, [I.COOKED_MUTTON]: 45, [I.COOKED_CHICKEN]: 45, [I.APPLE]: 25,
  [B.IRON_BLOCK]: 540, [B.GOLD_BLOCK]: 1980, [B.DIAMOND_BLOCK]: 8100, [B.LANTERN]: 90, [B.TORCH]: 4,
};
for (const it of ITEMS) {
  if (!it || it.value !== undefined) continue;
  if (BASE_VALUE[it.id] !== undefined) it.value = BASE_VALUE[it.id];
  else if (it.tool) it.value = [30, 60, 250, 1500][it.tool.tier - 1] || 30;
  else it.value = it.block ? 2 : 5;
}

// Recettes « de fortune »
RECIPES.push(
  { out: [G.BANDAGE, 2], in: [[B.WOOL, 1]], st: B.TABLE },
  { out: [G.A9, 20], in: [[I.IRON_INGOT, 1], [I.COAL, 2]], st: B.TABLE },
  { out: [G.A12, 8], in: [[I.IRON_INGOT, 1], [I.COAL, 2], [B.GRAVEL, 1]], st: B.TABLE },
  { out: [G.A762, 15], in: [[I.IRON_INGOT, 2], [I.COAL, 3]], st: B.TABLE },
  { out: [G.A556, 15], in: [[I.IRON_INGOT, 2], [I.COAL, 3], [I.GOLD_INGOT, 1]], st: B.TABLE },
  { out: [G.STEW, 1], in: [[I.COOKED_PORK, 1], [I.IRON_INGOT, 1]], st: B.FURNACE },
);
RECIPES.forEach((r, i) => { r.idx = i; });

// ------------------------------------------------------------------ Objets spéciaux
export const isGun = (id) => !!GUNS[id];
export const itemValue = (s) => {
  if (!s || !ITEMS[s.id]) return 0;
  const it = ITEMS[s.id];
  let v = it.value || 0;
  if (it.tool && s.d) v *= Math.max(0.1, 1 - s.d / it.tool.dur);
  if (it.armor && s.d) v *= Math.max(0.15, 1 - s.d / it.armor.dur);
  if (it.gun && s.m) for (const k in s.m) if (s.m[k] && ITEMS[s.m[k]]) v += ITEMS[s.m[k]].value;
  return Math.round(v * s.n);
};
// Une pile peut-elle se fusionner avec une autre ?
export const plain = (s) => !s.d && !s.m && !s.a;

// Copie sûre d'un objet (garde les champs propres aux armes)
export function cleanItem(s) {
  if (!s || !ITEMS[s.id] || !(s.n > 0)) return null;
  const it = ITEMS[s.id];
  const o = { id: s.id | 0, n: Math.min(s.n | 0, it.stack), d: +s.d || 0 };
  if (it.gun) {
    const g = it.gun;
    o.m = {};
    if (s.m && typeof s.m === 'object') for (const slot of g.slots) {
      const mid = s.m[slot] | 0;
      if (MODS[mid] && MODS[mid].slot === slot && MODS[mid].fits.includes(g.cat)) o.m[slot] = mid;
    }
    o.at = AMMO[s.at] && AMMO[s.at].cal === g.cal ? s.at | 0 : 0;
    o.a = o.at ? Math.max(0, Math.min(s.a | 0, 100)) : 0;
    o.fm = Math.max(0, Math.min((s.fm | 0), g.modes.length - 1));
  }
  return o;
}

// ------------------------------------------------------------------ Statistiques calculées d'une arme
export function gunStats(s) {
  const g = GUNS[s.id];
  const st = {
    id: s.id, cat: g.cat, cal: g.cal, name: g.name, modes: g.modes, rpm: g.rpm, dmg: g.dmg, pellets: g.pellets || 1, mag: g.mag,
    reload: g.reload, hip: g.hip, adsSpread: g.adsSpread, rv: g.rv, rh: g.rh, ads: g.ads, range: g.range, noise: g.noise,
    zoom: g.zoom, scope: false, dot: false, sil: false, light: false, laser: false,
  };
  const m = s.m || {};
  for (const slot of g.slots) {
    const d = MODS[m[slot]];
    if (!d) continue;
    for (const k in d.fx) st[k] *= d.fx[k];
    if (d.zoom) st.zoom = d.zoom;
    if (d.scope) st.scope = true;
    if (d.dot) st.dot = true;
    if (d.sil) st.sil = true;
    if (d.light) st.light = true;
    if (d.laser) st.laser = true;
    if (d.mag && d.mag[g.cat]) st.mag = d.mag[g.cat];
  }
  return st;
}

// ------------------------------------------------------------------ Tables de butin
// [id, poids, min, max] ; les armes reçoivent des accessoires aléatoires
export const LOOT = {
  crate: {
    rolls: [2, 5], table: [
      [G.A9, 10, 10, 30], [G.A12, 6, 6, 16], [G.BANDAGE, 8, 1, 2], [G.STEW, 7, 1, 1], [G.BAR, 7, 1, 2], [I.APPLE, 4, 1, 3],
      [G.CIGS, 6, 1, 1], [G.SCREWS, 7, 1, 2], [G.RADIO, 3, 1, 1], [G.WATCH, 1.5, 1, 1], [B.TORCH, 4, 2, 6], [I.COAL, 3, 2, 5],
      [I.IRON_INGOT, 3, 1, 3], [toolId(1, 0), 2, 1, 1], [toolId(1, 1), 1.5, 1, 1], [G.PISTOL, 2.5, 1, 1], [G.SHOTGUN, 1.2, 1, 1],
      [G.RED, 1.2, 1, 1], [G.COMP, 1, 1, 1], [G.GRIPV, 1, 1, 1], [G.LIGHT, 1.2, 1, 1], [G.MAG9, 1, 1, 1], [G.HELM1, 0.8, 1, 1],
    ],
  },
  mil: {
    rolls: [2, 4], table: [
      [G.A556, 9, 20, 45], [G.A762, 9, 20, 45], [G.A9, 5, 20, 40], [G.A556AP, 2.5, 15, 30], [G.A762AP, 2.5, 15, 30], [G.A12, 4, 8, 16],
      [G.AK, 3, 1, 1], [G.CARBINE, 2.5, 1, 1], [G.SMG, 3, 1, 1], [G.SNIPER, 1, 1, 1], [G.SHOTGUN, 1.5, 1, 1],
      [G.HOLO, 2, 1, 1], [G.SCOPE4, 1.5, 1, 1], [G.SCOPE8, 0.6, 1, 1], [G.SUP9, 1.5, 1, 1], [G.SUPR, 1.2, 1, 1], [G.BRAKE, 1.5, 1, 1],
      [G.MAGR, 2, 1, 1], [G.DRUM, 0.7, 1, 1], [G.STOCKT, 1.6, 1, 1], [G.STOCKP, 1, 1, 1], [G.GRIPA, 1.5, 1, 1], [G.LASER, 1.2, 1, 1],
      [G.HELM1, 2, 1, 1], [G.HELM2, 1, 1, 1], [G.VEST1, 2, 1, 1], [G.VEST2, 1.4, 1, 1], [G.VEST3, 0.5, 1, 1],
      [G.BATTERY, 2, 1, 1], [G.DOCS, 0.8, 1, 1], [G.MEDKIT, 1.5, 1, 1],
    ],
  },
  med: {
    rolls: [1, 3], table: [[G.BANDAGE, 10, 1, 3], [G.MEDKIT, 4, 1, 1], [G.STIM, 2, 1, 1], [G.BAR, 3, 1, 2], [I.GOLDEN_APPLE, 0.5, 1, 1]],
  },
  safe: {
    rolls: [2, 3], table: [[G.WATCH, 6, 1, 2], [G.GPU, 2, 1, 1], [G.USB, 4, 1, 1], [G.DOCS, 3, 1, 1], [I.DIAMOND, 3, 1, 3], [I.GOLD_INGOT, 5, 2, 6], [G.BATTERY, 2, 1, 1]],
  },
  bandit: {
    rolls: [1, 3], table: [
      [G.BANDAGE, 8, 1, 2], [G.STEW, 5, 1, 1], [G.BAR, 5, 1, 1], [G.CIGS, 6, 1, 1], [G.SCREWS, 4, 1, 1], [G.WATCH, 1.5, 1, 1],
      [G.RADIO, 2, 1, 1], [G.MEDKIT, 1.2, 1, 1], [G.HELM1, 1, 1, 1], [G.VEST1, 1, 1, 1], [G.USB, 0.8, 1, 1], [G.RED, 0.8, 1, 1],
    ],
  },
};

const pickW = (table, rnd) => {
  let tot = 0; for (const e of table) tot += e[1];
  let r = rnd() * tot;
  for (const e of table) { r -= e[1]; if (r <= 0) return e; }
  return table[table.length - 1];
};

// Arme générée avec accessoires aléatoires et quelques balles
export function makeGun(id, rnd, modChance = 0.35, loaded = 0.6) {
  const g = GUNS[id], s = { id, n: 1, d: 0, m: {}, a: 0, at: 0, fm: 0 };
  for (const slot of g.slots) {
    if (rnd() > modChance) continue;
    const opts = Object.keys(MODS).map(Number).filter((k) => MODS[k].slot === slot && MODS[k].fits.includes(g.cat));
    if (opts.length) s.m[slot] = opts[Math.floor(rnd() * opts.length)];
  }
  if (rnd() < loaded) {
    const ammo = Object.keys(AMMO).map(Number).filter((k) => AMMO[k].cal === g.cal && AMMO[k].pen < 5);
    s.at = ammo[0]; s.a = Math.ceil(gunStats(s).mag * (0.3 + rnd() * 0.7));
  }
  return s;
}

export function rollLoot(kind, rnd) {
  const L = LOOT[kind]; if (!L) return [];
  const out = [];
  const n = L.rolls[0] + Math.floor(rnd() * (L.rolls[1] - L.rolls[0] + 1));
  for (let i = 0; i < n; i++) {
    const [id, , a, b] = pickW(L.table, rnd);
    if (GUNS[id]) out.push(makeGun(id, rnd));
    else out.push({ id, n: a + Math.floor(rnd() * (b - a + 1)), d: 0 });
  }
  return out;
}

// Armes des pillards (poids)
export const BANDIT_GUNS = [[G.PISTOL, 4], [G.SMG, 3], [G.SHOTGUN, 2], [G.AK, 2.5], [G.CARBINE, 1.2], [G.SNIPER, 0.5]];
export const pickBanditGun = (rnd) => pickW(BANDIT_GUNS, rnd)[0];

// ------------------------------------------------------------------ Marchand (prix d'achat)
export const TRADER = [
  ['Armes', [G.PISTOL, G.SMG, G.SHOTGUN, G.AK, G.CARBINE, G.SNIPER]],
  ['Munitions', [G.A9, G.A12, G.A556, G.A762, G.A556AP, G.A762AP]],
  ['Accessoires', [G.RED, G.HOLO, G.SCOPE4, G.SCOPE8, G.SUP9, G.SUPR, G.COMP, G.BRAKE, G.MAG9, G.MAGR, G.DRUM, G.STOCKT, G.STOCKP, G.GRIPV, G.GRIPA, G.LIGHT, G.LASER]],
  ['Protection', [G.HELM1, G.HELM2, G.VEST1, G.VEST2, G.VEST3]],
  ['Soins et vivres', [G.BANDAGE, G.MEDKIT, G.STIM, G.STEW, G.BAR]],
  ['Outils', [toolId(1, 0), toolId(2, 0), toolId(2, 1), toolId(2, 2), B.TORCH, B.STORAGE]],
];
export const AMMO_LOT = 30;
export const buyPrice = (id) => {
  const it = ITEMS[id];
  const base = (it.value || 5) * (it.ammo ? AMMO_LOT : 1);
  return Math.ceil(base * 1.6 / 10) * 10;
};
export const sellPrice = (s) => Math.floor(itemValue(s) * 0.55);

export const RAID_TIME = 30 * 60;
export const START_MONEY = 2500;
export function starterStash() {
  return [
    { id: G.PISTOL, n: 1, d: 0, m: {}, a: 12, at: G.A9, fm: 0 },
    { id: G.A9, n: 60, d: 0 },
    { id: G.BANDAGE, n: 3, d: 0 },
    { id: G.STEW, n: 2, d: 0 },
    { id: toolId(1, 0), n: 1, d: 0 },
    { id: B.TORCH, n: 8, d: 0 },
  ];
}
// Kit de secours gratuit
export function freeKit(rnd) {
  const gun = [G.PISTOL, G.PISTOL, G.SHOTGUN, G.SMG][Math.floor(rnd() * 4)];
  const s = makeGun(gun, rnd, 0.15, 1);
  const ammo = { 9: G.A9, 12: G.A12 }[GUNS[gun].cal];
  return [s, { id: ammo, n: 30 + Math.floor(rnd() * 30), d: 0 }, { id: G.BANDAGE, n: 2, d: 0 }, { id: G.BAR, n: 1, d: 0 }];
}

export { B, I, BLOCKS };
