// Interface DOM : barre d'action, barres de vie, sac, planque, marchand, armurerie, conteneurs,
// HUD tactique (boussole, chrono, munitions), carte, discussion, étiquettes, logo.
import { ITEMS, BLOCKS, B } from '../shared/blocks.js';
import { BIOME } from '../shared/worldgen.js';
import {
  GUNS, AMMO, MODS, ARMOR, SLOT_NAMES, MODE_NAMES, CAL_NAME, gunStats, itemValue, sellPrice, buyPrice, TRADER, AMMO_LOT,
} from '../shared/guns.js';
import { recipesFor, SLOTS, EQ_HELMET, EQ_VEST } from './inventory.js';
import { projectParts } from './textures.js';
import { gunGeometry } from './gunmodels.js';
import { project } from './math.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
const money = (n) => Math.round(n).toLocaleString('fr-FR');
const CAT_NAMES = { pistol: 'pistolets', smg: 'pistolets-mitrailleurs', rifle: 'fusils', shotgun: 'fusils à pompe', sniper: 'fusils de précision' };
const FX_NAMES = { rv: 'recul vertical', rh: 'recul horizontal', hip: 'dispersion à la hanche', adsSpread: 'dispersion en visée', ads: 'temps de visée', noise: 'bruit', dmg: 'dégâts', reload: 'temps de rechargement' };
const LOTC = { tower: [150, 146, 140], block: [140, 134, 126], shops: [156, 124, 100], houses: [150, 104, 84], station: [120, 112, 126], parking: [86, 86, 88], ruin: [124, 112, 96], park: [102, 104, 70] };
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a <= -Math.PI) a += Math.PI * 2; return a; };

export class UI {
  constructor(assets, h) {
    this.A = assets; this.h = h;
    const iconURL = assets.icons.toCanvas().toDataURL();
    document.documentElement.style.setProperty('--icons', `url(${iconURL})`);
    this.hot = [];
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div'); d.className = 'slot';
      d.addEventListener('pointerdown', (e) => { if (h.touch) { e.preventDefault(); e.stopPropagation(); h.hotbar(i); } });
      $('hotbar').appendChild(d); this.hot.push(d);
    }
    this.views = [];
    this.mountGrid('inv', $('inv-hot'), range(0, 9));
    this.mountGrid('inv', $('inv-main'), range(9, SLOTS));
    this.mountGrid('inv', $('inv-eq-h'), [EQ_HELMET], 'Casque');
    this.mountGrid('inv', $('inv-eq-v'), [EQ_VEST], 'Gilet');
    this.mountGrid('inv', $('h-hot'), range(0, 9));
    this.mountGrid('inv', $('h-main'), range(9, SLOTS));
    this.mountGrid('inv', $('h-eq-h'), [EQ_HELMET], 'Casque');
    this.mountGrid('inv', $('h-eq-v'), [EQ_VEST], 'Gilet');
    this.mountGrid('stash', $('h-stash'), range(0, 81));
    for (const id of ['inventory', 'hideout']) {
      $(id).addEventListener('mousedown', (e) => { if (e.target === $(id) || e.target.classList.contains('ho')) this.h.dropCursor(e.button === 2); });
      $(id).addEventListener('contextmenu', (e) => e.preventDefault());
    }
    for (const where of ['inv', 'ho']) this.bindBody(where);
    $('ho-deploy').onclick = () => this.h.deploy();
    $('ho-kit').onclick = () => this.h.kit();
    document.addEventListener('pointermove', (e) => {
      this.mx = e.clientX; this.my = e.clientY;
      $('cursor-stack').style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 22}px)`;
      const t = $('tooltip');
      if (!t.classList.contains('hidden')) this.placeTip();
    });
    this.labels = new Map();
    this.chatLines = [];
    this.lastHot = ''; this.lastBars = ''; this.lastCompass = '';
    this.mapCache = null;
  }

  // ------------------------------------------------------------ grilles
  mountGrid(grid, parent, idx, ghost) {
    const els = idx.map((i) => {
      const d = document.createElement('div'); d.className = 'slot';
      // souris : clic direct ; tactile : appui = clic, appui long = transfert rapide (Maj+clic)
      d.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.mx = e.clientX; this.my = e.clientY;
        if (e.pointerType !== 'touch') { this.h.gridClick(grid, i, e.button, e.shiftKey, e.ctrlKey); return; }
        clearTimeout(this.lpT);
        this.lp = { grid, i, done: false };
        this.lpT = setTimeout(() => { if (this.lp && !this.lp.done) { this.lp.done = true; d.classList.add('flash'); setTimeout(() => d.classList.remove('flash'), 250); this.h.gridClick(grid, i, 0, true, false); } }, 420);
      });
      d.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'touch' || !this.lp || this.lp.grid !== grid || this.lp.i !== i) return;
        clearTimeout(this.lpT);
        if (!this.lp.done) { this.lp.done = true; this.h.gridClick(grid, i, 0, false, false); const it = this.h.item(grid, i) || this.h.cursor(); if (it) { this.tipItem(it); clearTimeout(this.tipT); this.tipT = setTimeout(() => this.hideTip(), 2200); } }
      });
      d.addEventListener('pointercancel', () => clearTimeout(this.lpT));
      d.addEventListener('mouseenter', () => { this.hover = [grid, i]; this.tipItem(this.h.item(grid, i)); });
      d.addEventListener('mouseleave', () => { this.hover = null; this.hideTip(); });
      d.addEventListener('contextmenu', (e) => e.preventDefault());
      parent.appendChild(d);
      return d;
    });
    const v = { grid, idx, els, ghost, parent };
    this.views.push(v);
    return v;
  }
  unmountGrid(grid) {
    this.views = this.views.filter((v) => { if (v.grid !== grid) return true; v.els.forEach((e) => e.remove()); return false; });
  }
  renderGrids(which) {
    for (const v of this.views) {
      if (which && !which.includes(v.grid)) continue;
      if (!v.parent.offsetParent && v.parent.id) continue; // non affichée
      v.idx.forEach((i, k) => { v.els[k].innerHTML = this.slotInner(this.h.item(v.grid, i), v.ghost); });
    }
    const c = this.h.cursor();
    $('cursor-stack').innerHTML = c ? `<div class="slot">${this.slotInner(c)}</div>` : '';
    if (this.hover) this.tipItem(this.h.item(this.hover[0], this.hover[1]));
  }

  icon(id) {
    const i = this.A.iconIndex[id] ?? 0, c = this.A.iconCols;
    return `<div class="ic" style="background-position:-${(i % c) * 32}px -${Math.floor(i / c) * 32}px;background-size:${c * 32}px auto"></div>`;
  }
  slotInner(s, ghost) {
    if (!s) return ghost ? `<div class="ghost">${ghost}</div>` : '';
    const it = ITEMS[s.id];
    if (!it) return '';
    let h = this.icon(s.id);
    if (it.gun) {
      h += `<span class="ammo-n">${s.a | 0}</span>`;
      const nm = s.m ? Object.values(s.m).filter(Boolean).length : 0;
      if (nm) h += `<span class="mods">+${nm}</span>`;
    } else if (s.n > 1) h += `<span class="n">${s.n}</span>`;
    const dur = it.tool ? it.tool.dur : it.armor ? it.armor.dur : 0;
    if (dur && s.d > 0) {
      const f = Math.max(0, 1 - s.d / dur);
      h += `<div class="dur"><i style="width:${f * 100}%;background:hsl(${f * 110},80%,50%)"></i></div>`;
    }
    return h;
  }

  renderHotbar(inv) {
    const key = inv.version + ':' + inv.sel;
    if (key === this.lastHot) return;
    const selChanged = this.lastSel !== inv.sel || this.lastHeldId !== inv.heldId();
    this.lastHot = key;
    for (let i = 0; i < 9; i++) {
      this.hot[i].innerHTML = this.slotInner(inv.slots[i]);
      this.hot[i].classList.toggle('sel', i === inv.sel);
    }
    if (selChanged) {
      this.lastSel = inv.sel; this.lastHeldId = inv.heldId();
      const h = inv.held();
      const el = $('held-name');
      el.textContent = h ? ITEMS[h.id].name : '';
      el.style.opacity = h ? 1 : 0;
      clearTimeout(this.heldT);
      this.heldT = setTimeout(() => { el.style.opacity = 0; }, 1800);
    }
  }

  renderBars(hp, hunger) {
    const key = Math.ceil(hp * 5) + ':' + Math.ceil(hunger);
    if (key === this.lastBars) return;
    this.lastBars = key;
    $('hp-fill').style.width = Math.max(0, hp / 20 * 100) + '%';
    $('hp-txt').textContent = `${Math.ceil(hp * 5)} PV`;
    $('food-fill').style.width = Math.max(0, hunger / 20 * 100) + '%';
    $('food-txt').textContent = `Faim ${Math.ceil(hunger * 5)} %`;
    const bar = $('hp-fill').parentNode;
    if (bar && bar.classList) bar.classList.toggle('low', hp <= 6);
  }

  // ------------------------------------------------------------ panneaux à onglets
  bindBody(where) {
    const body = $(where === 'inv' ? 'inv-body' : 'ho-body'), tabs = $(where === 'inv' ? 'inv-tabs' : 'ho-tabs');
    tabs.addEventListener('mousedown', (e) => { const b = e.target.closest('button'); if (b) { e.preventDefault(); this.h.tab(where, b.dataset.tab); } });
    body.addEventListener('mousedown', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      const a = el.dataset.act, v = el.dataset.v;
      if (a === 'craft') this.h.craft(this.recipes[+v], e.shiftKey);
      else if (a === 'gs-pick') this.h.gsSelect(v);
      else if (a === 'gs-add') this.h.gsInstall(el.dataset.slot, +v);
      else if (a === 'gs-rm') this.h.gsRemove(el.dataset.slot);
      else if (a === 'tr-cat') this.h.traderCat(+v);
      else if (a === 'buy') this.h.buy(+v, e.shiftKey);
      else if (a === 'sell') this.h.sellCursor();
      else if (a === 'takeall') this.h.takeAll();
    });
    body.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip]');
      if (!el) return;
      const [k, v] = el.dataset.tip.split(':');
      if (k === 'rec') this.tipRecipe(this.recipeEntries[+v], this.h.invRef());
      else if (k === 'id') this.tipItem({ id: +v, n: 1, d: 0, m: {} }, { buy: true });
      else if (k === 'sell') { const c = this.h.cursor(); this.showTip(c ? `<div class="t">Vendre ${esc(ITEMS[c.id].name)}${c.n > 1 ? ' ×' + c.n : ''}</div><div class="ok">${money(sellPrice(c))} écus</div>` : '<div class="d">Prenez un objet puis cliquez ici pour le vendre.</div>'); }
    });
    body.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]')) this.hideTip(); });
  }

  // ctx : { tab, tabs:[[id,label]], inv, stations, cont, gs, trader, money, hideout }
  renderPanel(where, ctx) {
    const tabs = $(where === 'inv' ? 'inv-tabs' : 'ho-tabs'), body = $(where === 'inv' ? 'inv-body' : 'ho-body');
    tabs.innerHTML = ctx.tabs.map(([id, label]) => `<button data-tab="${id}" class="${id === ctx.tab ? 'on' : ''}">${esc(label)}</button>`).join('');
    const scroll = body.querySelector('.scroll')?.scrollTop || 0;
    this.unmountGrid('cont');
    if (ctx.tab === 'craft') body.innerHTML = this.craftHTML(ctx);
    else if (ctx.tab === 'gunsmith') { body.innerHTML = this.gunsmithHTML(ctx); this.drawGunPreview(body, ctx); }
    else if (ctx.tab === 'trader') body.innerHTML = this.traderHTML(ctx);
    else if (ctx.tab === 'cont') {
      const c = ctx.cont;
      body.innerHTML = `<div class="cont-head"><span><b>${esc(c ? c.title : '')}</b></span><button class="small" data-act="takeall">Tout prendre</button></div><div class="grid cont" id="cont-grid"></div><p class="hint">Maj+clic : transférer vers le sac (ou vers le conteneur depuis le sac).</p>`;
      if (c) this.mountGrid('cont', $('cont-grid'), range(0, c.cap));
    }
    const sc = body.querySelector('.scroll'); if (sc) sc.scrollTop = scroll;
    this.renderGrids(['cont']);
  }

  craftHTML(ctx) {
    const { inv, stations } = ctx;
    const st = ctx.hideout ? '<span class="st on">Atelier de la planque</span>' :
      `<span class="st on">Sac</span><span class="st ${stations.has(B.TABLE) ? 'on' : ''}">Établi</span><span class="st ${stations.has(B.FURNACE) ? 'on' : ''}">Four</span>`;
    const list = recipesFor(inv, stations);
    this.recipes = list.map((e) => e.r); this.recipeEntries = list;
    const rows = list.map((e, k) => {
      const r = e.r, it = ITEMS[r.out[0]];
      const ing = r.in.map(([id, n]) => `<div class="mini">${this.icon(id)}<span class="${inv.count(id) < n ? 'lack' : ''}">${n}</span></div>`).join('');
      return `<div class="rec ${e.ok ? 'ok' : 'no'}" ${e.ok ? `data-act="craft" data-v="${k}"` : ''} data-tip="rec:${k}"><div class="slot">${this.slotInner({ id: r.out[0], n: r.out[1] })}</div><div class="name">${esc(it.name)}</div><div class="ing">${ing}</div></div>`;
    }).join('');
    return `<div id="stations">${st}</div><div id="recipes" class="scroll">${rows}</div><p class="hint">Clic : fabriquer 1 · Maj+clic : le maximum</p>`;
  }

  // ------------------------------------------------------------ armurerie
  gunsmithHTML(ctx) {
    const gs = ctx.gs;
    const cards = gs.guns.map((g) => `<div class="gs-card ${g.ref === gs.sel ? 'on' : ''}" data-act="gs-pick" data-v="${g.ref}">${this.icon(g.s.id)}<span>${esc(GUNS[g.s.id].name)}</span></div>`).join('');
    if (!gs.guns.length) return `<div class="empty-note">Aucune arme dans ${ctx.hideout ? 'le sac ni la planque' : 'le sac'}.</div>`;
    const cur = gs.guns.find((g) => g.ref === gs.sel);
    if (!cur) return `<div class="gs-list">${cards}</div><div class="empty-note">Choisissez une arme à modifier.</div>`;
    const s = cur.s, g = GUNS[s.id], st = gunStats(s), base = gunStats({ id: s.id, m: {} });
    const bars = [
      ['Dégâts', st.dmg * st.pellets / 36, base.dmg * base.pellets / 36, `${fmt(st.dmg)}${st.pellets > 1 ? '×' + st.pellets : ''}`, st.dmg - base.dmg],
      ['Cadence', st.rpm / 900, base.rpm / 900, `${Math.round(st.rpm)}/min`, 0],
      ['Contrôle du recul', 1 - st.rv / 0.1, 1 - base.rv / 0.1, `${Math.round((1 - st.rv / 0.1) * 100)}`, base.rv - st.rv],
      ['Précision', 1 - Math.sqrt(st.adsSpread / 0.06), 1 - Math.sqrt(base.adsSpread / 0.06), `${Math.round((1 - Math.sqrt(st.adsSpread / 0.06)) * 100)}`, base.adsSpread - st.adsSpread],
      ['Tir à la hanche', 1 - st.hip / 0.1, 1 - base.hip / 0.1, `${Math.round((1 - st.hip / 0.1) * 100)}`, base.hip - st.hip],
      ['Maniabilité', 1 - st.ads / 0.7, 1 - base.ads / 0.7, `${(st.ads).toFixed(2)} s`, base.ads - st.ads],
      ['Discrétion', 1 - st.noise / 170, 1 - base.noise / 170, `${Math.round(st.noise)} m`, base.noise - st.noise],
      ['Chargeur', st.mag / 75, base.mag / 75, `${st.mag}`, st.mag - base.mag],
    ];
    const statHTML = bars.map(([n, v, b, txt, delta]) => {
      const cls = delta > 1e-6 ? 'up' : delta < -1e-6 ? 'dn' : '';
      return `<span>${n}</span><div class="sb"><i style="width:${Math.max(2, Math.min(100, v * 100))}%"></i><u style="left:${Math.max(0, Math.min(99, b * 100))}%"></u></div><span class="${cls}">${txt}</span>`;
    }).join('');
    const slots = g.slots.map((slot) => {
      const curId = s.m && s.m[slot];
      const avail = gs.mods.filter((m) => MODS[m.id].slot === slot && MODS[m.id].fits.includes(g.cat));
      const opts = [];
      if (curId) opts.push(`<div class="gs-opt cur" data-act="gs-rm" data-slot="${slot}" data-tip="id:${curId}" title="Retirer">${this.icon(curId)}</div>`);
      for (const m of avail) opts.push(`<div class="gs-opt" data-act="gs-add" data-slot="${slot}" data-v="${m.id}" data-tip="id:${m.id}">${this.icon(m.id)}<span class="n">${m.n}</span></div>`);
      return `<div class="gs-slot"><span class="lbl">${SLOT_NAMES[slot]}</span><div class="gs-opts">${opts.join('') || '<span class="gs-none">aucun accessoire compatible</span>'}</div></div>`;
    }).join('');
    return `<div class="gs-list">${cards}</div>
      <div class="gs-view">
        <div class="gs-name">${esc(g.name)} <small>· ${CAL_NAME[g.cal]} · ${g.modes.map((m) => MODE_NAMES[m]).join(' / ')}</small></div>
        <canvas class="gs-prev" width="330" height="120"></canvas>
        <div class="gs-stats">${statHTML}</div>
        <div class="gs-slots scroll">${slots}</div>
        <p class="hint">Cliquez un accessoire pour le monter, l'accessoire encadré (en place) pour le retirer.</p>
      </div>`;
  }
  drawGunPreview(body, ctx) {
    const cv = body.querySelector('.gs-prev'); if (!cv) return;
    const cur = ctx.gs.guns.find((g) => g.ref === ctx.gs.sel); if (!cur) return;
    const img = projectParts(gunGeometry(cur.s).parts, 110, 40, 2);
    const small = document.createElement('canvas'); small.width = 110; small.height = 40;
    small.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), 110, 40), 0, 0);
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(small, 0, 0, 330, 120);
  }

  // ------------------------------------------------------------ marchand
  traderHTML(ctx) {
    const cat = ctx.trader || 0;
    const cats = TRADER.map(([n], i) => `<button data-act="tr-cat" data-v="${i}" class="${i === cat ? 'on' : ''}">${esc(n)}</button>`).join('');
    const rows = TRADER[cat][1].map((id) => {
      const it = ITEMS[id], p = buyPrice(id), lot = it.ammo ? AMMO_LOT : 1;
      return `<div class="tr-row ${ctx.money < p ? 'poor' : ''}" data-act="buy" data-v="${id}" data-tip="id:${id}"><div class="slot">${this.slotInner({ id, n: lot })}</div><div class="name">${esc(it.name)}${lot > 1 ? ` <small>×${lot}</small>` : ''}</div><div class="price">${money(p)} é.</div></div>`;
    }).join('');
    return `<div class="tr-cats">${cats}</div><div class="tr-list scroll">${rows}</div>
      <div class="tr-sell" data-act="sell" data-tip="sell:1">Vendre : cliquez ici avec un objet au curseur<br><small>(ou Ctrl+clic sur un objet)</small></div>
      <p class="hint">Les achats arrivent dans la planque. Maj+clic : acheter 5.</p>`;
  }

  // ------------------------------------------------------------ planque
  renderHideout(ctx) {
    $('ho-money').textContent = money(ctx.money);
    const s = ctx.stats;
    $('ho-stats').innerHTML = `Raids ${s.raids} · Extractions <b>${s.extracts}</b> · Morts ${s.deaths} · Pillards abattus ${s.bandits} · Joueurs ${s.kills}`;
    const left = Math.max(0, Math.ceil(ctx.kitLeft));
    const kb = $('ho-kit');
    kb.disabled = left > 0;
    kb.textContent = left > 0 ? `Kit de survie (${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')})` : 'Kit de survie gratuit';
    $('h-stash-count').textContent = `(${ctx.stashUsed}/81) · valeur ${money(ctx.stashValue)} é. · sac ${money(ctx.invValue)} é.`;
  }
  armorInfo(inv) {
    const line = (s, name) => {
      if (!s) return `${name} : aucun`;
      const a = ARMOR[s.id];
      return `${esc(a.name)} · classe ${a.cls} · ${Math.max(0, Math.round(a.dur - (s.d || 0)))}/${a.dur}`;
    };
    const html = `${line(inv.slots[EQ_HELMET], 'Casque')}<br>${line(inv.slots[EQ_VEST], 'Gilet')}`;
    for (const id of ['inv-eq-info', 'h-eq-info']) $(id).innerHTML = html;
  }

  // ------------------------------------------------------------ infobulles
  tipItem(s, o = {}) {
    if (!s || !ITEMS[s.id]) { this.hideTip(); return; }
    const it = ITEMS[s.id];
    let h = `<div class="t">${esc(it.name)}</div>`;
    if (it.gun) {
      const st = gunStats(s);
      h += `<div class="d">${CAL_NAME[st.cal]} · ${st.modes.map((m) => MODE_NAMES[m]).join(' / ')}</div>`;
      h += `<div class="d">Dégâts ${fmt(st.dmg)}${st.pellets > 1 ? ' ×' + st.pellets : ''} · ${Math.round(st.rpm)} coups/min · portée ${Math.round(st.range)} m</div>`;
      if (!o.buy) h += `<div class="d">Chargeur ${s.a | 0}/${st.mag}${s.at && ITEMS[s.at] ? ' — ' + esc(ITEMS[s.at].name) : ''}</div>`;
      const mods = Object.values(s.m || {}).filter(Boolean).map((id) => esc(ITEMS[id].name));
      if (mods.length) h += `<div class="ok">${mods.join(', ')}</div>`;
    }
    if (it.ammo) h += `<div class="d">${CAL_NAME[it.ammo.cal]} · pénétration ${it.ammo.pen}/6${it.ammo.dmg !== 1 ? ` · dégâts ×${it.ammo.dmg}` : ''}</div>`;
    if (it.mod) {
      const md = it.mod;
      h += `<div class="d">${SLOT_NAMES[md.slot]} — pour ${md.fits.map((c) => CAT_NAMES[c]).join(', ')}</div>`;
      const fx = [];
      if (md.zoom) fx.push(`grossissement ×${md.zoom}`);
      if (md.mag) fx.push(`capacité ${Object.values(md.mag).join(' / ')}`);
      if (md.sil) fx.push('tir silencieux');
      if (md.light) fx.push('éclaire devant soi (touche L)');
      if (md.laser) fx.push('point laser');
      for (const k in md.fx) { const p = Math.round((md.fx[k] - 1) * 100); if (p) fx.push(`${p > 0 ? '+' : '−'}${Math.abs(p)} % ${FX_NAMES[k]}`); }
      h += `<div class="ok">${fx.join(' · ')}</div>`;
    }
    if (it.armor) h += `<div class="d">Classe ${it.armor.cls} · solidité ${Math.max(0, Math.round(it.armor.dur - (s.d || 0)))}/${it.armor.dur}</div><div class="d">Maj+clic pour l'équiper</div>`;
    if (it.med) h += `<div class="d">Maintenir clic droit (${it.med.time} s)</div>`;
    if (it.tool) h += `<div class="d">Dégâts ${it.tool.dmg} · Solidité ${it.tool.dur - (s.d || 0)} / ${it.tool.dur}</div>`;
    if (it.food) h += `<div class="d">Nourrit de ${it.food.hunger * 5} %${it.food.heal ? ' · soigne' : ''}</div>`;
    if (it.desc) h += `<div class="d">${esc(it.desc)}</div>`;
    if (it.block && BLOCKS[s.id].light) h += `<div class="d">Éclaire les alentours</div>`;
    if (o.buy) { const lot = it.ammo ? AMMO_LOT : 1; h += `<div class="ok">Prix : ${money(buyPrice(s.id))} écus${lot > 1 ? ` le lot de ${lot}` : ''}</div>`; }
    else if (this.h.selling()) h += `<div class="ok">Revente : ${money(sellPrice(s))} écus (Ctrl+clic)</div>`;
    else h += `<div class="d">Valeur ${money(itemValue(s))} écus</div>`;
    this.showTip(h);
  }
  tipRecipe(e, inv) {
    if (!e) return;
    const r = e.r;
    let h = `<div class="t">${esc(ITEMS[r.out[0]].name)}${r.out[1] > 1 ? ' ×' + r.out[1] : ''}</div>`;
    for (const [id, n] of r.in) { const have = inv.count(id); h += `<div class="${have >= n ? 'ok' : 'ko'}">${n} × ${esc(ITEMS[id].name)} (${have})</div>`; }
    if (r.st) h += `<div class="${e.station ? 'ok' : 'ko'}">Nécessite : ${r.st === B.TABLE ? 'un établi' : 'un four'} à proximité</div>`;
    if (e.ok && e.max > 1) h += `<div class="d">Maj+clic : ${e.max} fois</div>`;
    this.showTip(h);
  }
  showTip(h) { const t = $('tooltip'); t.innerHTML = h; t.classList.remove('hidden'); this.placeTip(); }
  placeTip() { const t = $('tooltip'); const x = Math.min((this.mx || 0) + 16, innerWidth - t.offsetWidth - 6), y = Math.min((this.my || 0) + 16, innerHeight - t.offsetHeight - 6); t.style.left = x + 'px'; t.style.top = y + 'px'; }
  hideTip() { $('tooltip').classList.add('hidden'); }

  // ------------------------------------------------------------ HUD tactique
  crosshair(mode, gap) {
    const el = $('crosshair');
    el.style.display = mode === 'hidden' ? 'none' : '';
    el.classList.toggle('tool', mode === 'tool');
    if (mode === 'gun') el.style.setProperty('--g', Math.round(Math.min(90, Math.max(3, gap))) + 'px');
  }
  hitmarker(t, head) { const el = $('hitmarker'); el.style.opacity = Math.min(1, t * 6); el.classList.toggle('head', !!head); }
  scope(on) { $('scope').classList.toggle('hidden', !on); }
  dot(on) { $('dot').classList.toggle('hidden', !on); }
  prompt(html) { const el = $('prompt'); if (html) { if (el.innerHTML !== html) el.innerHTML = html; el.style.display = 'block'; } else el.style.display = 'none'; }
  dmgDir(angle) {
    const d = document.createElement('div'); d.className = 'dmg-dir';
    d.style.transform = `rotate(${angle}rad)`;
    $('dmg-dirs').appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = 0; });
    setTimeout(() => d.remove(), 1300);
  }
  ammo(show, count, mag, info, empty) {
    const el = $('ammo');
    el.classList.toggle('hidden', !show);
    if (!show) return;
    const key = count + '/' + mag + info + empty;
    if (key === this.lastAmmo) return;
    this.lastAmmo = key;
    $('ammo-count').innerHTML = `${count}<small> / ${mag}</small>`;
    $('ammo-count').classList.toggle('empty', !!empty);
    $('ammo-info').textContent = info;
  }
  timer(t, show) {
    const el = $('raid-timer');
    el.style.display = show ? '' : 'none';
    if (!show) return;
    const s = Math.max(0, Math.ceil(t)), txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    if (txt !== this.lastTimer) { this.lastTimer = txt; el.innerHTML = `<small>Temps avant disparition</small>${txt}`; }
    el.classList.toggle('warn', s < 300);
  }
  status(list) {
    const key = list.map((s) => s.text + s.cls).join('|');
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    $('status').innerHTML = list.map((s) => `<div class="stt ${s.cls || ''}">${esc(s.text)}</div>`).join('');
  }
  extract(info) {
    const box = $('extract-box');
    box.classList.toggle('hidden', !info);
    if (!info) return;
    $('extract-text').textContent = info.text;
    $('extract-bar').style.width = Math.round(info.p * 100) + '%';
  }
  // Boussole : yaw du joueur, repères [{ x, z, label }], position du joueur
  compass(yaw, px, pz, marks) {
    const head = wrapA(-yaw);
    const key = head.toFixed(3) + marks.map((m) => m.label).join();
    if (key === this.lastCompass) return;
    this.lastCompass = key;
    const W = 480, ppr = W / Math.PI;
    const parts = [];
    const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    for (let a = 0; a < 360; a += 15) {
      const d = wrapA(a * Math.PI / 180 - head);
      if (Math.abs(d) > Math.PI / 2) continue;
      const x = W / 2 + d * ppr;
      if (CARD[a]) parts.push(`<div class="ct card" style="left:${x}px;top:12px">${CARD[a]}</div>`);
      else parts.push(`<div class="ct tick" style="left:${x}px"></div>`);
    }
    for (const m of marks) {
      const d = wrapA(Math.atan2(m.x - px, -(m.z - pz)) - head);
      const x = W / 2 + Math.max(-1, Math.min(1, d / (Math.PI / 2))) * (W / 2 - 20);
      parts.push(`<div class="cm ${m.near ? 'near' : ''}" style="left:${x}px">${esc(m.label)}</div>`);
    }
    $('compass-in').innerHTML = parts.join('');
  }

  // ------------------------------------------------------------ carte
  renderMap(canvas, gen, P, structs) {
    const cx = Math.round(P.x / 48) * 48, cz = Math.round(P.z / 48) * 48, N = 256, S = 3;
    if (!this.mapCache || this.mapCache.cx !== cx || this.mapCache.cz !== cz) {
      const img = new ImageData(N, N);
      const COL = { [BIOME.OCEAN]: [47, 95, 158], [BIOME.BEACH]: [217, 207, 148], [BIOME.PLAINS]: [111, 160, 74], [BIOME.FOREST]: [63, 122, 52], [BIOME.DESERT]: [216, 196, 131], [BIOME.TUNDRA]: [223, 231, 236], [BIOME.MOUNTAIN]: [138, 138, 136] };
      const hs = new Int16Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const c = gen.column(cx + (i - N / 2) * S, cz + (j - N / 2) * S);
        hs[j * N + i] = c & 255;
        const h = c & 255, b = c >> 8;
        let col = COL[b] || [100, 100, 100];
        let f = 1;
        if (h < 38) f = 0.75 + (h - 20) / 72;
        else f = 0.85 + (h - 38) * 0.008;
        if (i > 0 && j > 0) f += (h - hs[(j - 1) * N + i - 1]) * 0.05;
        const X = cx + (i - N / 2) * S, Z = cz + (j - N / 2) * S;
        const ti = gen.townInfo(X, Z);
        if (ti && ti.d < ti.t.R) {
          const mx = ((X % 32) + 32) % 32, mz = ((Z % 32) + 32) % 32;
          const lot = gen.lotAt(Math.floor(X / 32), Math.floor(Z / 32));
          if (mx < 5 || mz < 5) { col = [64, 64, 66]; f = 1; }
          else if (lot) { col = LOTC[lot.type] || [120, 116, 110]; f = mx === 5 || mz === 5 || mx === 31 || mz === 31 ? 1.15 : 1; }
        }
        const k = (j * N + i) * 4;
        img.data[k] = col[0] * f; img.data[k + 1] = col[1] * f; img.data[k + 2] = col[2] * f; img.data[k + 3] = 255;
      }
      const c2 = document.createElement('canvas'); c2.width = N; c2.height = N;
      c2.getContext('2d').putImageData(img, 0, 0);
      this.mapCache = { cx, cz, canvas: c2 };
    }
    const ctx = canvas.getContext('2d'), W = canvas.width, sc = W / (N * S);
    this.mapTowns = gen.townsNear(P.x, P.z, 500);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapCache.canvas, 0, 0, W, W);
    const toPx = (x, z) => [(x - cx) * sc + W / 2, (z - cz) * sc + W / 2];
    ctx.font = 'bold 12px Trebuchet MS, sans-serif';
    for (const s of structs) {
      const [x, y] = toPx(s.cx, s.cz);
      if (x < -20 || y < -20 || x > W + 20 || y > W + 20) continue;
      if (s.type === 'extract') {
        ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#1a1f1a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const d = Math.round(Math.hypot(s.cx - P.x, s.cz - P.z));
        ctx.strokeText(`${d} m`, x + 10, y + 4); ctx.fillText(`${d} m`, x + 10, y + 4);
      } else {
        ctx.fillStyle = s.type === 'house' ? '#b07a45' : s.type === 'camp' ? '#6d7446' : '#9a9a96';
        ctx.strokeStyle = '#1a1f1a'; ctx.lineWidth = 2;
        const r = s.type === 'house' ? 4 : 6;
        ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.font = 'bold 14px Bahnschrift, "Arial Narrow", sans-serif';
    for (const t of this.mapTowns) {
      const [x, y] = toPx(t.cx, t.cz);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.fillStyle = '#f0e6cf';
      ctx.strokeText(t.name.toUpperCase(), x - ctx.measureText(t.name.toUpperCase()).width / 2, y);
      ctx.fillText(t.name.toUpperCase(), x - ctx.measureText(t.name.toUpperCase()).width / 2, y);
    }
    // joueur
    const [px, py] = toPx(P.x, P.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-P.yaw + Math.PI);
    ctx.fillStyle = '#ff4a3a'; ctx.strokeStyle = '#1a1f1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(7, -7); ctx.lineTo(0, -3); ctx.lineTo(-7, -7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(232,226,208,0.9)'; ctx.fillText('N ↑', 10, 18);
  }

  // ------------------------------------------------------------ discussion
  chat(text, from, sys) {
    const d = document.createElement('div');
    d.className = 'msg' + (sys ? ' sys' : '');
    d.innerHTML = from ? `<b>${esc(from)}</b> ${esc(text)}` : esc(text);
    $('chat-log').appendChild(d);
    this.chatLines.push(d);
    setTimeout(() => d.classList.add('old'), 9000);
    while (this.chatLines.length > 60) this.chatLines.shift().remove();
  }
  openChat(prefill = '') {
    $('chat').classList.add('open');
    const i = $('chat-input'); i.value = prefill; i.focus();
  }
  closeChat() { $('chat').classList.remove('open'); $('chat-input').blur(); }

  toast(text, ms = 2200) {
    const t = $('toast'); t.textContent = text; t.style.opacity = 1;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { t.style.opacity = 0; }, ms);
  }

  flashHurt(k = 0.85) { const v = $('vignette'); v.style.transition = 'none'; v.style.opacity = k; void v.offsetWidth; v.style.transition = 'opacity 0.6s'; v.style.opacity = 0; }

  // ------------------------------------------------------------ étiquettes 3D
  // items : [{ key, text, x, y, z, hp, max }]
  labelsUpdate(vp, items) {
    const W = innerWidth, H = innerHeight, seen = new Set();
    for (const it of items) {
      const p = project(vp, it.x, it.y, it.z, W, H);
      if (!p || p.d > (it.far || 40)) continue;
      seen.add(it.key);
      let el = this.labels.get(it.key);
      if (!el) {
        el = document.createElement('div');
        el.className = it.hp !== undefined ? 'hpbar' : 'label';
        if (it.hp !== undefined) el.innerHTML = '<i></i>';
        $('labels').appendChild(el); this.labels.set(it.key, el);
      }
      if (it.hp !== undefined) { el.firstChild.style.width = Math.max(0, it.hp / it.max) * 100 + '%'; }
      else if (el.textContent !== it.text) el.textContent = it.text;
      const s = Math.max(0.5, Math.min(1.2, 8 / p.d));
      el.style.transform = `translate(${p.x - el.offsetWidth / 2}px, ${p.y - el.offsetHeight}px) scale(${s})`;
    }
    for (const [k, el] of this.labels) if (!seen.has(k)) { el.remove(); this.labels.delete(k); }
  }
  clearLabels() { for (const el of this.labels.values()) el.remove(); this.labels.clear(); }

  playerList(names) {
    $('players').innerHTML = `<h3>Joueurs connectés (${names.length})</h3>` + names.map((n) => `<div>${esc(n)}</div>`).join('');
  }
}
