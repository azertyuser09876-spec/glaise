// Définitions du contenu du jeu : blocs, objets, outils, recettes.
// Partagé client / serveur.

export const CHUNK = 16, HEIGHT = 96, SEA = 38;
export const CHUNK_VOL = CHUNK * CHUNK * HEIGHT;

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, GRAVEL: 6, WATER: 7, LOG: 8, LEAVES: 9, PLANKS: 10,
  BEDROCK: 11, COAL_ORE: 12, IRON_ORE: 13, GOLD_ORE: 14, DIAMOND_ORE: 15, GLASS: 16, SNOW: 17, SNOW_GRASS: 18,
  CACTUS: 19, TABLE: 20, FURNACE: 21, TORCH: 22, STONE_BRICKS: 23, WOOL: 24, TALL_GRASS: 25, POPPY: 26,
  DANDELION: 27, SPRUCE_LOG: 28, SPRUCE_LEAVES: 29, SANDSTONE: 30, LANTERN: 31, SLIME_BLOCK: 32,
  IRON_BLOCK: 33, GOLD_BLOCK: 34, DIAMOND_BLOCK: 35, DEAD_BUSH: 36,
  CRATE: 37, MIL_CRATE: 38, MED_CABINET: 39, SAFE: 40, CONCRETE: 41, SANDBAG: 42, METAL_PLATE: 43,
  PAD: 44, FLARE: 45, BRICKS: 46, CANVAS: 47, STORAGE: 48,
  ASPHALT: 49, ROAD_LX: 50, ROAD_LZ: 51, SIDEWALK: 52, RUBBLE: 53, RUST: 54, PLASTER: 55, PLASTER2: 56,
  TILE_FLOOR: 57, ROOF_TILE: 58, TIRE: 59, PUMP: 60, FIRE_BARREL: 61,
};

export const I = {
  STICK: 100, COAL: 101, IRON_INGOT: 102, GOLD_INGOT: 103, DIAMOND: 104, STRING: 105, FEATHER: 106,
  SLIMEBALL: 107, ROTTEN_FLESH: 108, APPLE: 109, GOLDEN_APPLE: 110, RAW_PORK: 111, COOKED_PORK: 112,
  RAW_MUTTON: 113, COOKED_MUTTON: 114, RAW_CHICKEN: 115, COOKED_CHICKEN: 116, CHARM: 117,
};

// ---------------------------------------------------------------- Blocs
export const BLOCKS = [];
function blk(id, name, o = {}) {
  const b = Object.assign({
    id, name, solid: true, opaque: true, render: 'cube', hardness: 1, tool: null, tier: 0,
    drop: id, light: 0, sound: 'stone', tex: null, replaceable: false, emissive: false, needsSupport: false,
  }, o);
  if (typeof b.tex === 'string') b.tex = { top: b.tex, bottom: b.tex, side: b.tex };
  if (b.tex && !b.tex.front) b.tex.front = b.tex.side;
  BLOCKS[id] = b;
}
const plant = (tex, o = {}) => Object.assign({ tex, solid: false, opaque: false, render: 'cross', hardness: 0, sound: 'grass', needsSupport: true }, o);

blk(B.AIR, 'Air', { solid: false, opaque: false, render: 'none', drop: null, hardness: 0, replaceable: true });
blk(B.GRASS, "Bloc d'herbe", { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'grass' });
blk(B.DIRT, 'Terre', { tex: 'dirt', hardness: 0.5, tool: 'shovel', sound: 'dirt' });
blk(B.STONE, 'Pierre', { tex: 'stone', hardness: 1.5, tool: 'pickaxe', tier: 1, drop: B.COBBLE });
blk(B.COBBLE, 'Pierre taillée', { tex: 'cobble', hardness: 2, tool: 'pickaxe', tier: 1 });
blk(B.SAND, 'Sable', { tex: 'sand', hardness: 0.5, tool: 'shovel', sound: 'sand' });
blk(B.GRAVEL, 'Gravier', { tex: 'gravel', hardness: 0.6, tool: 'shovel', sound: 'dirt' });
blk(B.WATER, 'Eau', { tex: 'water', solid: false, opaque: false, render: 'water', hardness: Infinity, drop: null, replaceable: true, sound: 'water' });
blk(B.LOG, 'Bûche de chêne', { tex: { top: 'log_top', bottom: 'log_top', side: 'log_side' }, hardness: 2, tool: 'axe', sound: 'wood' });
blk(B.LEAVES, 'Feuilles de chêne', { tex: 'leaves', opaque: false, render: 'leaves', hardness: 0.2, drop: 'leaves', sound: 'grass' });
blk(B.PLANKS, 'Planches', { tex: 'planks', hardness: 2, tool: 'axe', sound: 'wood' });
blk(B.BEDROCK, 'Socle', { tex: 'bedrock', hardness: Infinity, drop: null });
blk(B.COAL_ORE, 'Minerai de charbon', { tex: 'coal_ore', hardness: 3, tool: 'pickaxe', tier: 1, drop: I.COAL });
blk(B.IRON_ORE, 'Minerai de fer', { tex: 'iron_ore', hardness: 3, tool: 'pickaxe', tier: 2 });
blk(B.GOLD_ORE, "Minerai d'or", { tex: 'gold_ore', hardness: 3, tool: 'pickaxe', tier: 3 });
blk(B.DIAMOND_ORE, 'Minerai de diamant', { tex: 'diamond_ore', hardness: 3, tool: 'pickaxe', tier: 3, drop: I.DIAMOND });
blk(B.GLASS, 'Verre', { tex: 'glass', opaque: false, render: 'glass', hardness: 0.3, drop: null, sound: 'glass' });
blk(B.SNOW, 'Neige', { tex: 'snow', hardness: 0.3, tool: 'shovel', sound: 'snow' });
blk(B.SNOW_GRASS, 'Herbe enneigée', { tex: { top: 'snow', bottom: 'dirt', side: 'snow_side' }, hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'snow' });
blk(B.CACTUS, 'Cactus', { tex: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' }, hardness: 0.4, sound: 'cloth' });
blk(B.TABLE, 'Établi', { tex: { top: 'table_top', bottom: 'planks', side: 'table_side', front: 'table_front' }, hardness: 2.5, tool: 'axe', sound: 'wood' });
blk(B.FURNACE, 'Four', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, hardness: 3.5, tool: 'pickaxe', tier: 1 });
blk(B.TORCH, 'Torche', { tex: 'torch', solid: false, opaque: false, render: 'torch', hardness: 0, light: 13, sound: 'wood', needsSupport: true, emissive: true });
blk(B.STONE_BRICKS, 'Briques de pierre', { tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', tier: 1 });
blk(B.WOOL, 'Laine', { tex: 'wool', hardness: 0.8, sound: 'cloth' });
blk(B.TALL_GRASS, 'Hautes herbes', plant('tall_grass', { drop: null, replaceable: true }));
blk(B.POPPY, 'Coquelicot', plant('poppy'));
blk(B.DANDELION, 'Pissenlit', plant('dandelion'));
blk(B.SPRUCE_LOG, 'Bûche de sapin', { tex: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log_side' }, hardness: 2, tool: 'axe', sound: 'wood' });
blk(B.SPRUCE_LEAVES, 'Aiguilles de sapin', { tex: 'spruce_leaves', opaque: false, render: 'leaves', hardness: 0.2, drop: 'leaves', sound: 'grass' });
blk(B.SANDSTONE, 'Grès', { tex: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone_side' }, hardness: 0.8, tool: 'pickaxe', tier: 1 });
blk(B.LANTERN, 'Lanterne', { tex: 'lantern', hardness: 1, tool: 'pickaxe', light: 15, emissive: true, sound: 'glass' });
blk(B.SLIME_BLOCK, 'Bloc de slime', { tex: 'slime_block', hardness: 0.3, sound: 'slime', bouncy: true });
blk(B.IRON_BLOCK, 'Bloc de fer', { tex: 'iron_block', hardness: 5, tool: 'pickaxe', tier: 2 });
blk(B.GOLD_BLOCK, "Bloc d'or", { tex: 'gold_block', hardness: 5, tool: 'pickaxe', tier: 3 });
blk(B.DIAMOND_BLOCK, 'Bloc de diamant', { tex: 'diamond_block', hardness: 5, tool: 'pickaxe', tier: 3 });
blk(B.DEAD_BUSH, 'Buisson mort', plant('dead_bush', { drop: I.STICK, replaceable: true }));
// Monde « extraction » : conteneurs de butin et constructions
blk(B.CRATE, 'Caisse en bois', { tex: { top: 'crate_top', bottom: 'crate_top', side: 'crate_side' }, hardness: 2.5, tool: 'axe', sound: 'wood', container: 'crate', drop: null });
blk(B.MIL_CRATE, 'Caisse militaire', { tex: { top: 'milcrate_top', bottom: 'milcrate_top', side: 'milcrate_side', front: 'milcrate_front' }, hardness: 4, tool: 'axe', sound: 'wood', container: 'mil', drop: null });
blk(B.MED_CABINET, 'Armoire médicale', { tex: { top: 'metal_plate', bottom: 'metal_plate', side: 'metal_plate', front: 'medcab_front' }, hardness: 3, tool: 'pickaxe', sound: 'stone', container: 'med', drop: null });
blk(B.SAFE, 'Coffre-fort', { tex: { top: 'safe_top', bottom: 'safe_top', side: 'safe_top', front: 'safe_front' }, hardness: 12, tool: 'pickaxe', tier: 2, sound: 'stone', container: 'safe', drop: null });
blk(B.CONCRETE, 'Béton', { tex: 'concrete', hardness: 3, tool: 'pickaxe', tier: 1 });
blk(B.SANDBAG, 'Sacs de sable', { tex: { top: 'sandbag_top', bottom: 'sandbag_top', side: 'sandbag_side' }, hardness: 1.2, tool: 'shovel', sound: 'sand' });
blk(B.METAL_PLATE, 'Tôle d\'acier', { tex: 'metal_plate', hardness: 5, tool: 'pickaxe', tier: 2 });
blk(B.PAD, "Aire d'extraction", { tex: { top: 'pad_top', bottom: 'concrete', side: 'pad_side' }, hardness: Infinity, drop: null });
blk(B.FLARE, "Balise d'extraction", { tex: { top: 'flare_top', bottom: 'metal_plate', side: 'flare_side' }, hardness: Infinity, light: 14, emissive: true, drop: null, sound: 'glass' });
blk(B.BRICKS, 'Briques', { tex: 'bricks', hardness: 2, tool: 'pickaxe', tier: 1 });
blk(B.CANVAS, 'Toile de tente', { tex: 'canvas', hardness: 0.6, sound: 'cloth' });
// Ville en ruine
blk(B.ASPHALT, 'Asphalte', { tex: { top: 'asphalt', bottom: 'gravel', side: 'asphalt_side' }, hardness: 2.5, tool: 'pickaxe', drop: B.GRAVEL });
blk(B.ROAD_LX, 'Marquage routier', { tex: { top: 'road_lx', bottom: 'gravel', side: 'asphalt_side' }, hardness: 2.5, tool: 'pickaxe', drop: B.GRAVEL });
blk(B.ROAD_LZ, 'Marquage routier', { tex: { top: 'road_lz', bottom: 'gravel', side: 'asphalt_side' }, hardness: 2.5, tool: 'pickaxe', drop: B.GRAVEL });
blk(B.SIDEWALK, 'Trottoir', { tex: { top: 'sidewalk', bottom: 'concrete', side: 'concrete' }, hardness: 2, tool: 'pickaxe', tier: 1 });
blk(B.RUBBLE, 'Gravats', { tex: 'rubble', hardness: 1, tool: 'shovel', sound: 'gravel', drop: B.GRAVEL });
blk(B.RUST, 'Tôle rouillée', { tex: 'rust', hardness: 3, tool: 'pickaxe', drop: I.IRON_INGOT });
blk(B.PLASTER, 'Crépi', { tex: 'plaster', hardness: 1.8, tool: 'pickaxe' });
blk(B.PLASTER2, 'Crépi gris', { tex: 'plaster2', hardness: 1.8, tool: 'pickaxe' });
blk(B.TILE_FLOOR, 'Carrelage', { tex: { top: 'tile_floor', bottom: 'concrete', side: 'concrete' }, hardness: 1.5, tool: 'pickaxe' });
blk(B.ROOF_TILE, 'Tuiles', { tex: 'roof_tile', hardness: 1.2, tool: 'pickaxe' });
blk(B.TIRE, 'Pneu', { tex: { top: 'tire_top', bottom: 'tire_top', side: 'tire_side' }, hardness: 1, sound: 'cloth' });
blk(B.PUMP, 'Pompe à essence', { tex: { top: 'metal_plate', bottom: 'metal_plate', side: 'pump_side', front: 'pump_front' }, hardness: 4, tool: 'pickaxe', drop: I.IRON_INGOT });
blk(B.FIRE_BARREL, 'Brasero', { tex: { top: 'fire_top', bottom: 'rust', side: 'barrel_side' }, hardness: 2, light: 13, emissive: true, drop: B.RUST });
blk(B.STORAGE, 'Coffre de rangement', { tex: { top: 'storage_top', bottom: 'storage_top', side: 'storage_side', front: 'storage_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', container: 'storage' });

export const NUM_BLOCKS = BLOCKS.length;
export const CONTAINER = new Uint8Array(256);
for (const b of BLOCKS) if (b && b.container) CONTAINER[b.id] = 1;
// Tables de recherche rapides
export const SOLID = new Uint8Array(256), OPAQUE = new Uint8Array(256), LIGHT_BLOCK = new Uint8Array(256);
for (const b of BLOCKS) {
  if (!b) continue;
  SOLID[b.id] = b.solid ? 1 : 0;
  OPAQUE[b.id] = b.opaque ? 1 : 0;
  LIGHT_BLOCK[b.id] = (b.solid && b.render !== 'glass') ? 1 : 0;
}

// ---------------------------------------------------------------- Objets
export const TOOL_KINDS = ['pickaxe', 'axe', 'shovel', 'sword'];
const KIND_NAMES = ['Pioche', 'Hache', 'Pelle', 'Épée'];
export const TIERS = [
  { key: 'wood', name: 'en bois', speed: 2, dur: 60, mat: B.PLANKS },
  { key: 'stone', name: 'en pierre', speed: 4, dur: 132, mat: B.COBBLE },
  { key: 'iron', name: 'en fer', speed: 6, dur: 250, mat: I.IRON_INGOT },
  { key: 'diamond', name: 'en diamant', speed: 8, dur: 1561, mat: I.DIAMOND },
];
export const toolId = (tier, kind) => 120 + tier * 4 + kind;

export const ITEMS = [];
for (const b of BLOCKS) {
  if (!b || b.id === B.AIR || b.id === B.WATER) continue;
  ITEMS[b.id] = { id: b.id, name: b.name, stack: 64, block: true };
}
function itm(id, name, icon, o = {}) { ITEMS[id] = Object.assign({ id, name, icon, stack: 64, block: false }, o); }
itm(I.STICK, 'Bâton', 'stick');
itm(I.COAL, 'Charbon', 'coal');
itm(I.IRON_INGOT, 'Lingot de fer', 'ingot_iron');
itm(I.GOLD_INGOT, "Lingot d'or", 'ingot_gold');
itm(I.DIAMOND, 'Diamant', 'diamond');
itm(I.STRING, 'Ficelle', 'string');
itm(I.FEATHER, 'Plume', 'feather');
itm(I.SLIMEBALL, 'Boule de slime', 'slimeball');
itm(I.ROTTEN_FLESH, 'Chair putréfiée', 'flesh', { food: { hunger: 2 } });
itm(I.APPLE, 'Pomme', 'apple', { food: { hunger: 4 } });
itm(I.GOLDEN_APPLE, 'Pomme dorée', 'golden_apple', { food: { hunger: 4, heal: 10 }, always: true });
itm(I.RAW_PORK, 'Porc cru', 'pork_raw', { food: { hunger: 3 } });
itm(I.COOKED_PORK, 'Côtelette grillée', 'pork_cooked', { food: { hunger: 8 } });
itm(I.RAW_MUTTON, 'Mouton cru', 'mutton_raw', { food: { hunger: 2 } });
itm(I.COOKED_MUTTON, 'Mouton rôti', 'mutton_cooked', { food: { hunger: 6 } });
itm(I.RAW_CHICKEN, 'Poulet cru', 'chicken_raw', { food: { hunger: 2 } });
itm(I.COOKED_CHICKEN, 'Poulet rôti', 'chicken_cooked', { food: { hunger: 6 } });
itm(I.CHARM, 'Talisman de plume', 'charm', { stack: 1, desc: 'Annule les dégâts de chute' });

const DMG = [[2, 3, 4, 5], [3, 4, 5, 6], [1.5, 2.5, 3, 4], [4, 5, 6, 7]];
for (let t = 0; t < 4; t++) for (let k = 0; k < 4; k++) {
  const id = toolId(t, k);
  ITEMS[id] = {
    id, name: `${KIND_NAMES[k]} ${TIERS[t].name}`, icon: TOOL_KINDS[k], stack: 1, block: false, material: TIERS[t].key,
    tool: { kind: TOOL_KINDS[k], tier: t + 1, speed: TIERS[t].speed, dur: TIERS[t].dur, dmg: DMG[k][t] },
  };
}

export const maxStack = (id) => (ITEMS[id] ? ITEMS[id].stack : 64);

// ---------------------------------------------------------------- Minage
export function canHarvest(b, toolItemId) {
  if (!b.tier) return true;
  const t = ITEMS[toolItemId] && ITEMS[toolItemId].tool;
  return !!t && t.kind === b.tool && t.tier >= b.tier;
}

export function breakTime(blockId, toolItemId) {
  const b = BLOCKS[blockId];
  if (!b || !isFinite(b.hardness)) return Infinity;
  if (b.hardness === 0) return 0.05;
  const t = ITEMS[toolItemId] && ITEMS[toolItemId].tool;
  const right = t && t.kind === b.tool;
  let speed = right ? t.speed : 1;
  if (t && t.kind === 'sword' && b.render === 'leaves') speed = 3;
  return (b.hardness * (canHarvest(b, toolItemId) ? 1.5 : 5)) / speed;
}

export function blockDrops(blockId, toolItemId, rnd) {
  const b = BLOCKS[blockId];
  if (!b || b.drop === null || !canHarvest(b, toolItemId)) return [];
  if (b.drop === 'leaves') {
    const r = rnd();
    if (r < 0.05) return [[I.APPLE, 1]];
    if (r < 0.12) return [[I.STICK, 1]];
    return [];
  }
  return [[b.drop, 1]];
}

// ---------------------------------------------------------------- Recettes
// st : station requise à proximité (établi ou four)
export const RECIPES = [
  { out: [B.PLANKS, 4], in: [[B.LOG, 1]] },
  { out: [B.PLANKS, 4], in: [[B.SPRUCE_LOG, 1]] },
  { out: [I.STICK, 4], in: [[B.PLANKS, 2]] },
  { out: [B.TABLE, 1], in: [[B.PLANKS, 4]] },
  { out: [B.TORCH, 4], in: [[I.STICK, 1], [I.COAL, 1]] },
  { out: [B.SANDSTONE, 1], in: [[B.SAND, 4]] },
  { out: [B.WOOL, 1], in: [[I.STRING, 4]] },
  { out: [B.SLIME_BLOCK, 1], in: [[I.SLIMEBALL, 4]] },
];
const TOOL_MAT_N = [3, 3, 1, 2], TOOL_STICK_N = [2, 2, 2, 1];
for (let t = 0; t < 4; t++) for (let k = 0; k < 4; k++) {
  RECIPES.push({ out: [toolId(t, k), 1], in: [[TIERS[t].mat, TOOL_MAT_N[k]], [I.STICK, TOOL_STICK_N[k]]], st: B.TABLE });
}
RECIPES.push(
  { out: [B.FURNACE, 1], in: [[B.COBBLE, 8]], st: B.TABLE },
  { out: [B.STONE_BRICKS, 4], in: [[B.STONE, 4]], st: B.TABLE },
  { out: [B.LANTERN, 1], in: [[I.IRON_INGOT, 1], [B.TORCH, 1], [B.GLASS, 1]], st: B.TABLE },
  { out: [B.IRON_BLOCK, 1], in: [[I.IRON_INGOT, 9]], st: B.TABLE },
  { out: [I.IRON_INGOT, 9], in: [[B.IRON_BLOCK, 1]] },
  { out: [B.GOLD_BLOCK, 1], in: [[I.GOLD_INGOT, 9]], st: B.TABLE },
  { out: [I.GOLD_INGOT, 9], in: [[B.GOLD_BLOCK, 1]] },
  { out: [B.DIAMOND_BLOCK, 1], in: [[I.DIAMOND, 9]], st: B.TABLE },
  { out: [I.DIAMOND, 9], in: [[B.DIAMOND_BLOCK, 1]] },
  { out: [I.GOLDEN_APPLE, 1], in: [[I.APPLE, 1], [I.GOLD_INGOT, 4]], st: B.TABLE },
  { out: [I.CHARM, 1], in: [[I.FEATHER, 6], [I.STRING, 2], [I.GOLD_INGOT, 1]], st: B.TABLE },
  { out: [I.COAL, 1], in: [[B.LOG, 2]], st: B.FURNACE },
  { out: [I.IRON_INGOT, 1], in: [[B.IRON_ORE, 1], [I.COAL, 1]], st: B.FURNACE },
  { out: [I.GOLD_INGOT, 1], in: [[B.GOLD_ORE, 1], [I.COAL, 1]], st: B.FURNACE },
  { out: [B.GLASS, 1], in: [[B.SAND, 1]], st: B.FURNACE },
  { out: [B.STONE, 1], in: [[B.COBBLE, 1]], st: B.FURNACE },
  { out: [I.COOKED_PORK, 1], in: [[I.RAW_PORK, 1]], st: B.FURNACE },
  { out: [I.COOKED_MUTTON, 1], in: [[I.RAW_MUTTON, 1]], st: B.FURNACE },
  { out: [I.COOKED_CHICKEN, 1], in: [[I.RAW_CHICKEN, 1]], st: B.FURNACE },
  { out: [B.STORAGE, 1], in: [[B.PLANKS, 8]], st: B.TABLE },
  { out: [B.SANDBAG, 2], in: [[B.SAND, 3], [B.WOOL, 1]], st: B.TABLE },
  { out: [B.CONCRETE, 4], in: [[B.GRAVEL, 2], [B.SAND, 2]], st: B.FURNACE },
  { out: [B.BRICKS, 4], in: [[B.DIRT, 4], [I.COAL, 1]], st: B.FURNACE },
  { out: [B.METAL_PLATE, 2], in: [[I.IRON_INGOT, 3]], st: B.TABLE },
);
RECIPES.forEach((r, i) => { r.idx = i; });
