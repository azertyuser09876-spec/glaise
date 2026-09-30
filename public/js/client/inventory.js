// Inventaires : grilles génériques (sac de raid, planque, conteneurs), pile au curseur, fabrication.
import { ITEMS, RECIPES, maxStack } from '../shared/blocks.js';
import { cleanItem, plain, ARMOR } from '../shared/guns.js';

export const SLOTS = 36, EQ_HELMET = 36, EQ_VEST = 37, INV_LEN = 38, STASH_LEN = 81;
export const cloneItem = (s) => (s ? JSON.parse(JSON.stringify(s)) : null);
const canMerge = (a, b) => a && b && a.id === b.id && plain(a) && plain(b) && maxStack(a.id) > 1;

export class Grid {
  constructor(n, main = n) { this.slots = new Array(n).fill(null); this.main = main; this.version = 0; }
  changed() { this.version++; }
  load(arr) {
    this.slots = new Array(this.slots.length).fill(null);
    if (Array.isArray(arr)) arr.slice(0, this.slots.length).forEach((s, i) => { this.slots[i] = cleanItem(s); });
    this.changed();
  }
  toJSON() { return this.slots.map((s) => cloneItem(s)); }
  accepts() { return true; }

  // Ajoute une pile ; renvoie la quantité non placée
  add(item) {
    item = cleanItem(item); if (!item) return 0;
    let n = item.n;
    const ms = maxStack(item.id);
    if (plain(item) && ms > 1) for (let i = 0; i < this.main && n; i++) {
      const s = this.slots[i];
      if (s && s.id === item.id && plain(s) && s.n < ms) { const k = Math.min(n, ms - s.n); s.n += k; n -= k; }
    }
    for (let i = 0; i < this.main && n; i++) {
      if (!this.slots[i]) { const k = Math.min(n, ms); this.slots[i] = { ...cloneItem(item), n: k }; n -= k; }
    }
    if (n !== item.n) this.changed();
    return n;
  }
  canAdd(item) {
    const ms = maxStack(item.id);
    for (let i = 0; i < this.main; i++) { const s = this.slots[i]; if (!s) return true; if (s.id === item.id && s.n < ms && plain(s) && plain(item)) return true; }
    return false;
  }
  freeSlots() { let n = 0; for (let i = 0; i < this.main; i++) if (!this.slots[i]) n++; return n; }
  count(id) { let c = 0; for (let i = 0; i < this.main; i++) { const s = this.slots[i]; if (s && s.id === id) c += s.n; } return c; }
  remove(id, n) {
    if (this.count(id) < n) return false;
    for (let i = this.main - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (!s.n) this.slots[i] = null; }
    }
    this.changed();
    return true;
  }
  clear() { this.slots.fill(null); this.changed(); }
  items() { return this.slots.filter(Boolean); }
}

export class Inventory extends Grid {
  constructor() { super(INV_LEN, SLOTS); this.sel = 0; this.cursor = null; }
  accepts(i, item) {
    if (i === EQ_HELMET) return !item || (ARMOR[item.id] && ARMOR[item.id].slot === 'helmet');
    if (i === EQ_VEST) return !item || (ARMOR[item.id] && ARMOR[item.id].slot === 'vest');
    return true;
  }
  held() { return this.slots[this.sel]; }
  heldId() { const h = this.slots[this.sel]; return h ? h.id : 0; }
  consumeHeld(n = 1) {
    const h = this.held(); if (!h) return;
    h.n -= n; if (h.n <= 0) this.slots[this.sel] = null;
    this.changed();
  }
  // Usure d'un outil ; renvoie true s'il casse
  wearHeld() {
    const h = this.held(); if (!h) return false;
    const t = ITEMS[h.id] && ITEMS[h.id].tool; if (!t) return false;
    h.d = (h.d || 0) + 1;
    this.changed();
    if (h.d >= t.dur) { this.slots[this.sel] = null; return true; }
    return false;
  }
  maxCraft(r) {
    let m = Infinity;
    for (const [id, n] of r.in) m = Math.min(m, Math.floor(this.count(id) / n));
    return m;
  }
  craft(r, times = 1) {
    let done = 0;
    for (let t = 0; t < times; t++) {
      if (this.maxCraft(r) < 1) break;
      const out = { id: r.out[0], n: r.out[1] };
      if (!this.canAdd(out) && this.cursor && !canMerge(this.cursor, out)) break;
      for (const [id, n] of r.in) this.remove(id, n);
      const left = this.add(out);
      if (left) {
        if (!this.cursor) this.cursor = { ...cleanItem(out), n: left };
        else this.cursor.n += left;
      }
      done++;
    }
    if (done) this.changed();
    return done;
  }
  // Remet la pile du curseur dans le sac ; renvoie ce qui reste (à jeter)
  stowCursor() {
    if (!this.cursor) return null;
    const c = this.cursor; this.cursor = null;
    const left = this.add(c);
    this.changed();
    return left ? { ...c, n: left } : null;
  }
  clear() { this.slots.fill(null); this.cursor = null; this.changed(); }
  allItems() { const a = this.items(); if (this.cursor) a.push(this.cursor); return a; }
}

// Clic sur la case i d'une grille. hand : l'inventaire qui porte le curseur.
// shiftTo : grille cible du transfert rapide (ou null : barre d'action <-> sac).
export function clickSlot(grid, i, button, shift, hand, shiftTo) {
  const s = grid.slots[i];
  if (shift) {
    if (!s) return;
    if (grid === hand && ARMOR[s.id] && i < SLOTS && !shiftTo) {
      const eq = ARMOR[s.id].slot === 'helmet' ? EQ_HELMET : EQ_VEST;
      const cur = hand.slots[eq];
      hand.slots[eq] = s; hand.slots[i] = cur; hand.changed(); return;
    }
    if (shiftTo) {
      const left = shiftTo.add(s);
      if (left === s.n) return;
      if (left) s.n = left; else grid.slots[i] = null;
      grid.changed(); shiftTo.changed();
      return;
    }
    // barre d'action <-> sac
    const range = i < 9 ? [9, SLOTS] : [0, 9];
    const ms = maxStack(s.id);
    for (let k = range[0]; k < range[1] && s.n > 0; k++) {
      const t = grid.slots[k];
      if (canMerge(t, s) && t.n < ms) { const m = Math.min(s.n, ms - t.n); t.n += m; s.n -= m; }
    }
    for (let k = range[0]; k < range[1] && s.n > 0; k++) if (!grid.slots[k]) { grid.slots[k] = cloneItem(s); s.n = 0; }
    if (s.n <= 0) grid.slots[i] = null;
    grid.changed();
    return;
  }
  const c = hand.cursor;
  if (c && !grid.accepts(i, c)) return;
  if (button === 0) {
    if (canMerge(c, s)) {
      const ms = maxStack(s.id), m = Math.min(c.n, ms - s.n);
      s.n += m; c.n -= m; if (!c.n) hand.cursor = null;
    } else { grid.slots[i] = c; hand.cursor = s; }
  } else if (button === 2) {
    if (!c && s) { const h = Math.ceil(s.n / 2); hand.cursor = { ...cloneItem(s), n: h }; s.n -= h; if (!s.n) grid.slots[i] = null; }
    else if (c && !s) { grid.slots[i] = { ...cloneItem(c), n: 1 }; c.n--; if (!c.n) hand.cursor = null; }
    else if (canMerge(c, s) && s.n < maxStack(s.id)) { s.n++; c.n--; if (!c.n) hand.cursor = null; }
    else { grid.slots[i] = c; hand.cursor = s; }
  }
  grid.changed(); hand.changed();
}

export function recipesFor(inv, stations) {
  return RECIPES.map((r) => {
    const max = inv.maxCraft(r);
    const station = !r.st || stations.has(r.st);
    return { r, max, station, ok: max > 0 && station };
  }).sort((a, b) => (b.ok - a.ok) || ((b.max > 0) - (a.max > 0)) || (a.r.idx - b.r.idx));
}
