// Glaise — client : boucle de jeu, réseau, planque, raids, armes, entités, rendu.
import { B, BLOCKS, ITEMS, HEIGHT, SOLID, CONTAINER, breakTime } from '../shared/blocks.js';
import { MOB_TYPES, MOBS, mobDims } from '../shared/mobs.js';
import { GUNS, AMMO, MODS, gunStats, sellPrice, buyPrice, itemValue, AMMO_LOT, MODE_NAMES, CAL_NAME, RAID_TIME } from '../shared/guns.js';
import { moveEntity, boxHitsSolid } from '../shared/physics.js';
import { mat4, clamp, lerp, angleLerp } from './math.js';
import { buildAssets, playerSkin } from './textures.js';
import { Renderer } from './renderer.js';
import { Mesher } from './mesher.js';
import { ClientWorld, rayBox } from './world.js';
import { MODELS, drawModel, extrudeIcon } from './models.js';
import { Inventory, Grid, clickSlot, STASH_LEN, EQ_HELMET, EQ_VEST, cloneItem } from './inventory.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { LocalPlayer, EYE } from './player.js';
import { Weapons } from './weapons.js';
import { drawGun, gunGeometry } from './gunmodels.js';
import { TouchControls, IS_TOUCH } from './touch.js';

const $ = (id) => document.getElementById(id);
const REACH = 5, HIT_REACH = 3.6, EXTRACT_TIME = 8;
const DAY_LENGTH = 720;
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);

// ------------------------------------------------------------------ Paramètres
const DEFAULTS = IS_TOUCH
  ? { dist: 4, sens: 1, fov: 72, vol: 0.7, music: true, bob: false, lowres: false, name: '' }
  : { dist: 6, sens: 1, fov: 75, vol: 0.7, music: true, bob: true, lowres: false, name: '' };
function loadSettings() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('glaise.settings') || '{}')); } catch { return { ...DEFAULTS }; }
}
function saveSettings(s) { try { localStorage.setItem('glaise.settings', JSON.stringify(s)); } catch { /* navigation privée */ } }

class Game {
  constructor() {
    this.S = loadSettings();
    this.state = 'boot';
    this.t = 0; this.time = 0.1;
    this.keys = {}; this.inp = { keys: this.keys, active: false, forwardTap: false };
    this.mouse = { left: false, right: false, leftPressed: false, rightPressed: false };
    this.remote = new Map(); this.mobs = new Map(); this.items = new Map(); this.bags = new Map(); this.particles = []; this.tracers = [];
    this.view = 0; // 0 : 1re personne, 1 : dos, 2 : face
    this.mining = null; this.mineCd = 0; this.attackCd = 0; this.placeCd = 0;
    this.swing = 0; this.equip = 1; this.eating = 0; this.eatSound = 0;
    this.uiOpen = null; this.stations = new Set(); this.stationT = 0;
    this.lastSentPos = ''; this.posT = 0; this.invSentVersion = -1; this.invT = 0; this.statT = 0;
    this.fps = 0; this.frames = 0; this.fpsT = 0;
    this.spriteCache = new Map(); this.geomCache = new Map();
    this.fovMul = 1;
    this.target = null;
    // extraction
    this.stash = new Grid(STASH_LEN);
    this.money = 0; this.stats = { raids: 0, extracts: 0, deaths: 0, kills: 0, bandits: 0 };
    this.inRaid = false; this.raidT = 0; this.kitAt = 0; this.raidStart = 0;
    this.cont = null; this.contVer = 0; this.pendingOpen = 0;
    this.tab = { inv: 'craft', ho: 'trader' }; this.gsSel = null; this.traderCat = 0;
    this.panelKey = ''; this.gridKey = '';
    this.extractT = 0; this.extractSent = false; this.extractTick = 0; this.exList = []; this.exT = 0;
    this.hoSent = ''; this.hoT = 0; this.muzzleLight = 0; this.smokeT = 0;
  }

  // ------------------------------------------------------------ démarrage
  boot() {
    try {
      this.A = buildAssets();
      this.r = new Renderer($('gl'));
    } catch (e) {
      this.fatal("Impossible de démarrer le rendu 3D (WebGL2). Essayez un navigateur récent (Firefox, Chrome, Edge). Détail : " + e.message);
      return;
    }
    this.r.loadAssets(this.A);
    this.r.fov = this.S.fov;
    this.r.resScale = this.S.lowres ? 0.5 : 1;
    this.mesher = new Mesher(this.A.faceLayer);
    this.audio = new Audio();
    this.audio.volume = this.S.vol; this.audio.musicOn = this.S.music;
    this.inv = new Inventory();
    this.weapons = new Weapons(this);
    this.player = new LocalPlayer(this);
    const hideout = () => this.state === 'hideout';
    this.ui = new UI(this.A, {
      item: (grid, i) => (grid === 'inv' ? this.inv.slots[i] : grid === 'stash' ? this.stash.slots[i] : grid === 'cont' ? (this.cont ? this.cont.items[i] : null) : null),
      cursor: () => this.inv.cursor,
      invRef: () => this.inv,
      gridClick: (grid, i, b, shift, ctrl) => this.gridClick(grid, i, b, shift, ctrl),
      craft: (r, shift) => this.craft(r, shift),
      dropCursor: (one) => this.dropCursor(one),
      tab: (where, t) => { this.tab[where] = t; this.refreshPanels(true); },
      gsSelect: (ref) => { this.gsSel = ref; this.refreshPanels(true); },
      gsInstall: (slot, id) => this.gsInstall(slot, id),
      gsRemove: (slot) => this.gsRemove(slot),
      traderCat: (i) => { this.traderCat = i; this.refreshPanels(true); },
      buy: (id, many) => this.buy(id, many ? 5 : 1),
      sellCursor: () => this.sellCursor(),
      selling: () => hideout() && this.tab.ho === 'trader',
      deploy: () => this.deploy(),
      kit: () => this.send({ t: 'kit' }),
      takeAll: () => this.takeAll(),
      hotbar: (i) => { if (this.state === 'play' && !this.uiOpen) this.selectSlot(i); },
      touch: IS_TOUCH,
    });
    this.playerTex = new Map();
    if (IS_TOUCH) { this.touch = new TouchControls(this); this.r.maxDpr = 1.5; this.r.resize(); }
    $('inv-close').onclick = () => this.closeInventory();
    $('map-close').onclick = () => this.closeMap();
    for (const b of document.querySelectorAll('#ho-views button')) b.onclick = () => { $('hideout').dataset.view = b.dataset.v; for (const o of document.querySelectorAll('#ho-views button')) o.classList.toggle('on', o === b); };
    this.initMenu();
    this.initInput();
    this.initSettings();
    this.connect();
    window.addEventListener('resize', () => this.r.resize());
    this.r.resize();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  fatal(msg) {
    show('menu', false);
    show('error');
    $('error-text').textContent = msg;
  }

  initMenu() {
    const name = $('name');
    name.value = this.S.name || '';
    const here = `http://${location.host}`;
    $('addr').textContent = here;
    $('copy').onclick = () => this.copyText(here, $('copy'));
    // sur la machine qui héberge (fenêtre du jeu), afficher les vraies adresses à partager
    if (['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)) {
      fetch('/api/info').then((r) => r.json()).then((info) => this.showAddresses(info)).catch(() => {});
    }
    // rejoindre le serveur d'un ami dans la même fenêtre
    const join = () => {
      let u = $('join-url').value.trim();
      if (!u) { $('join-url').focus(); return; }
      if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
      try { const t = new URL(u); location.href = t.origin + '/'; } catch { $('join-url').style.borderColor = 'var(--danger)'; }
    };
    $('join-go').onclick = join;
    $('join-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); e.stopPropagation(); });
    $('join-url').addEventListener('keyup', (e) => e.stopPropagation());
    const go = () => {
      if ($('play').disabled) return;
      const n = name.value.trim();
      if (!n) { name.focus(); name.style.borderColor = 'var(--sang)'; return; }
      this.S.name = n; saveSettings(this.S);
      this.audio.init();
      this.send({ t: 'join', name: n });
      $('play').disabled = true;
      $('menu-status').textContent = 'Connexion…';
      this.lock();
    };
    $('play').onclick = go;
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); });
    name.addEventListener('keyup', (e) => e.stopPropagation());
    if (!name.value) setTimeout(() => name.focus(), 50);
  }

  copyText(text, btn) {
    const done = () => { if (btn) { btn.textContent = 'Copié !'; setTimeout(() => { btn.textContent = 'Copier'; }, 1500); } };
    const fallback = () => {
      const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch { /* */ }
      t.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  // Adresses de la machine hôte : Internet (IPv6) et réseau local (IPv4)
  showAddresses(info) {
    const rows = [];
    for (const a of info.addrs.v6) if (!a.local) rows.push(['Internet (IPv6)', `http://[${a.ip}]:${info.port}`]);
    for (const a of info.addrs.v4) rows.push(['Même réseau', `http://${a.ip}:${info.port}`]);
    if (!rows.length) return;
    const box = $('addr-rows');
    box.innerHTML = '';
    for (const [label, url] of rows.slice(0, 4)) {
      const row = document.createElement('div'); row.className = 'addr-row';
      const l = document.createElement('small'); l.textContent = label;
      const c = document.createElement('code'); c.textContent = url;
      const b = document.createElement('button'); b.className = 'small'; b.textContent = 'Copier';
      b.onclick = () => this.copyText(url, b);
      row.append(l, c, b); box.appendChild(row);
    }
    $('addr-note').textContent = info.addrs.v6.some((a) => !a.local)
      ? "Par Internet : donnez l'adresse IPv6 et ouvrez le port " + info.port + " en TCP (pare-feu et box). Même Wi-Fi : l'adresse IPv4 suffit."
      : "Pas d'IPv6 publique détectée : jouez sur le même réseau (adresse IPv4), ou activez l'IPv6 de votre box.";
  }

  initSettings() {
    const bind = (id, key, fmt, apply) => {
      const el = $(id), out = $('o-' + id.slice(2));
      if (el.type === 'checkbox') { el.checked = !!this.S[key]; el.onchange = () => { this.S[key] = el.checked; apply && apply(); saveSettings(this.S); }; return; }
      el.value = this.S[key];
      const upd = () => { this.S[key] = +el.value; if (out) out.textContent = fmt(+el.value); apply && apply(); saveSettings(this.S); };
      el.oninput = upd; if (out) out.textContent = fmt(+el.value);
    };
    bind('s-dist', 'dist', (v) => v + ' tronçons', () => { if (this.world) this.world.radius = this.S.dist; });
    bind('s-sens', 'sens', (v) => v.toFixed(1));
    bind('s-fov', 'fov', (v) => v + '°', () => { this.r.fov = this.S.fov; });
    bind('s-vol', 'vol', (v) => Math.round(v * 100) + ' %', () => this.audio.setVolume(this.S.vol));
    bind('s-music', 'music', null, () => this.audio.setMusic(this.S.music));
    bind('s-bob', 'bob');
    bind('s-lowres', 'lowres', null, () => { this.r.resScale = this.S.lowres ? 0.5 : 1; this.r.resize(); });
    $('resume').onclick = () => { this.hidePause(); this.lock(); };
    $('quit').onclick = () => { try { this.ws.close(); } catch { /* */ } location.reload(); };
    $('re-back').onclick = () => this.showHideout();
  }

  // ------------------------------------------------------------ réseau
  connect() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    let ws;
    try { ws = new WebSocket(url); } catch (e) { $('menu-status').textContent = 'Connexion impossible : ' + e.message; return; }
    this.ws = ws;
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMsg(m); };
    ws.onclose = () => {
      if (this.state !== 'menu' && this.state !== 'boot') { document.exitPointerLock?.(); show('disconnected'); }
      else { $('menu-status').textContent = 'Serveur injoignable. Est-il lancé ?'; $('play').disabled = true; $('play').textContent = 'Hors ligne'; }
      this.state = this.state === 'menu' || this.state === 'boot' ? 'menu' : 'dead-link';
    };
    ws.onerror = () => {};
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }

  onMsg(m) {
    switch (m.t) {
      case 'hello': {
        this.seed = m.seed; this.time = m.time; this.spawn = m.spawn;
        this.world = new ClientWorld(m.seed, m.edits, this.mesher, this.r);
        this.world.radius = Math.min(this.S.dist, 5);
        for (const p of m.players) this.addRemote(p);
        for (const it of m.items) this.addItem(it);
        for (const b of m.bags || []) this.bags.set(b.id, b);
        this.state = 'menu';
        $('play').disabled = false; $('play').textContent = 'Jouer';
        $('menu-status').textContent = m.online ? `${m.online} joueur${m.online > 1 ? 's' : ''} en ligne` : 'Personne en ligne : vous serez le premier.';
        break;
      }
      case 'welcome': {
        this.myId = m.id; this.myName = m.name; this.time = m.time; this.pvp = m.pvp;
        this.player.place(m.x, m.y, m.z); this.player.yaw = m.yaw || 0;
        this.player.hp = m.hp ?? 20; this.player.hunger = m.hunger ?? 20;
        this.inv.load(m.inv);
        this.stash.load(m.stash);
        this.money = m.money || 0; this.stats = m.stats || this.stats;
        this.kitAt = performance.now() + Math.max(0, m.kitT || 0);
        this.inRaid = !!m.inRaid; this.raidT = m.raidT || 0;
        this.invSentVersion = this.inv.version;
        show('menu', false);
        this.ui.chat(`Bienvenue, ${m.name} ! Tapez /aide pour les commandes.`, null, true);
        if (this.inRaid) { this.raidStart = performance.now() - (RAID_TIME - this.raidT) * 1000; this.startLoading('Retour dans la zone…'); }
        else this.showHideout();
        this.hoSent = this.hideoutKey();
        break;
      }
      case 'deployed': {
        const P = this.player;
        P.place(m.x, m.y, m.z); P.hp = m.hp; P.hunger = m.hunger; P.alive = true; P.resetStatus();
        this.time = m.time ?? this.time;
        this.inRaid = true; this.raidT = m.raidT; this.raidStart = performance.now(); this.stats.raids++;
        this.mobs.clear(); this.particles.length = 0; this.tracers.length = 0;
        this.extractT = 0; this.extractSent = false;
        this.invSentVersion = this.inv.version;
        this.startLoading('Insertion dans la zone…');
        break;
      }
      case 'extracted': if (m.stats) this.stats = m.stats; this.endRaid('ok'); break;
      case 'stats': this.stats = m.stats; break;
      case 'mia': this.inv.clear(); this.player.alive = false; this.endRaid('mia'); break;
      case 'kit': {
        if (!m.items.length) { this.ui.toast('Kit pas encore disponible'); this.kitAt = performance.now() + m.next; break; }
        this.kitAt = performance.now() + m.next;
        let lost = 0;
        for (const it of m.items) { const left = this.stash.add(it); if (left) lost += this.inv.add({ ...it, n: left }); }
        this.ui.toast(lost ? 'Kit reçu (planque pleine : une partie est perdue)' : 'Kit de survie ajouté à la planque');
        this.audio.craft();
        break;
      }
      case 'pjoin': this.addRemote(m.p); break;
      case 'pleave': { const p = this.remote.get(m.id); if (p) this.remote.delete(m.id); break; }
      case 'ps':
        for (const [id, x, y, z, yaw, pitch, held] of m.l) {
          if (id === this.myId) continue;
          const p = this.remote.get(id); if (!p) continue;
          p.tx = x; p.ty = y; p.tz = z; p.tyaw = yaw; p.tpitch = pitch; p.held = held;
        }
        break;
      case 'swing': { const p = this.remote.get(m.id); if (p) p.swing = 0.001; break; }
      case 'act': {
        const e = m.id > 0 ? this.remote.get(m.id) : this.mobs.get(-m.id);
        if (e && m.a === 'reload') { e.anim.reload = 0.001; this.audio.gunFx && this.dist(e) < 20 && this.audio.gunFx('magout'); }
        break;
      }
      case 'shot': this.onShot(m); break;
      case 'ms': this.onMobs(m.l); break;
      case 'mh': {
        const mob = this.mobs.get(m.id);
        if (mob) {
          if (m.hp < mob.hp) { mob.hurtT = 0.4; this.audio.mob(mob.type, 'hurt', [mob.x, mob.y, mob.z]); mob.showHp = 4; }
          mob.hp = m.hp;
        }
        break;
      }
      case 'md': {
        const mob = this.mobs.get(m.id);
        if (mob) {
          if (m.silent) this.mobs.delete(m.id);
          else { mob.dead = 0.001; mob.hp = 0; this.audio.mob(mob.type, 'death', [mob.x, mob.y, mob.z]); }
        }
        break;
      }
      case 'is': this.addItem(m); break;
      case 'ir': {
        const it = this.items.get(m.id);
        if (!it) break;
        const who = m.by === this.myId ? this.player : m.by ? this.remote.get(m.by) : null;
        if (who) { it.fly = 0.001; it.flyTo = who; } else this.items.delete(m.id);
        break;
      }
      case 'give': {
        const left = this.inv.add(m.item);
        if (m.silent) this.audio.click(); else this.audio.pickup();
        if (left) { if (this.state === 'play') this.dropItem({ ...m.item, n: left }, false); else this.stash.add({ ...m.item, n: left }); }
        break;
      }
      case 'bag': this.bags.set(m.b.id, m.b); break;
      case 'bagrm': this.bags.delete(m.id); break;
      case 'cont': {
        this.cont = { key: m.key, kind: m.kind, cap: m.cap, title: m.title, items: m.items };
        this.contVer++;
        if (this.pendingOpen && this.state === 'play') { this.pendingOpen = 0; this.tab.inv = 'cont'; this.openInventory(); this.audio.place('wood', null); }
        this.refreshPanels();
        break;
      }
      case 'contclose':
        if (this.cont && this.cont.key === m.key) { this.cont = null; this.contVer++; if (this.tab.inv === 'cont') this.tab.inv = 'craft'; this.refreshPanels(true); }
        break;
      case 'set': this.onSet(m); break;
      case 'hurt': {
        const cause = m.src ? (m.bullet ? `a été abattu par ${m.src}.` : `a été tué par ${m.src}.`) : 'est mort.';
        this.player.damage(m.dmg, cause, m.x, m.z, { part: m.part, pen: m.pen, bullet: m.bullet, srcId: m.srcId });
        break;
      }
      case 'tp': this.player.place(m.x, m.y, m.z); break;
      case 'time': this.time = m.time; break;
      case 'chat':
        if (m.sys) this.ui.chat(m.text, null, true); else this.ui.chat(m.text, m.from);
        break;
    }
  }

  dist(e) { const P = this.player; return Math.hypot(e.x - P.x, e.y - P.y, e.z - P.z); }

  addRemote(p) {
    if (p.id === this.myId) return;
    let tex = this.playerTex.get(p.name);
    if (!tex) { tex = this.r.texture2D(playerSkin(p.name)); this.playerTex.set(p.name, tex); }
    this.remote.set(p.id, {
      id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, tx: p.x, ty: p.y, tz: p.z, yaw: p.yaw, tyaw: p.yaw, pitch: p.pitch, tpitch: p.pitch,
      held: p.held, alive: p.alive !== false, tex, anim: { t: 0, walk: 0, amt: 0, swing: 0, pitch: 0, kick: 0, reload: 0 }, swing: 0, deadT: 0,
    });
  }

  onMobs(list) {
    const seen = new Set();
    for (const e of list) {
      const [id, ti, x, y, z, yaw, hp, fl, size] = e;
      seen.add(id);
      let m = this.mobs.get(id);
      const type = MOB_TYPES[ti];
      if (!m) {
        const d = mobDims(type, size);
        m = { id, type, size, x, y, z, yaw, hp, maxHp: d.hp, w: d.w, h: d.h, anim: { t: Math.random() * 10, walk: 0, amt: 0, pitch: 0, attack: 0, eat: 0, squash: 0, kick: 0, reload: 0 }, hurtT: 0, showHp: 0, idleT: 4 + Math.random() * 10, dead: 0, pvy: 0, pitch: 0, tpitch: 0 };
        this.mobs.set(id, m);
      }
      if (m.dead) continue;
      m.tx = x; m.ty = y; m.tz = z; m.tyaw = yaw; m.hp = hp; m.fl = fl;
      if (e.length > 9) { m.gunItem = { id: e[9], m: e[12] || {} }; m.variant = e[10] | 0; m.tpitch = e[11] || 0; }
    }
    for (const [id, m] of this.mobs) if (!seen.has(id) && !m.dead) this.mobs.delete(id);
  }

  addItem(m) {
    this.items.set(m.id, { id: m.id, item: m.item, x: m.x, y: m.y, z: m.z, vx: m.vx || 0, vy: m.vy || 0, vz: m.vz || 0, w: 0.25, h: 0.25, delay: m.delay || 0, age: Math.random() * 10, req: 0 });
  }

  onSet(m) {
    const w = this.world; if (!w) return;
    const old = w.get(m.x, m.y, m.z);
    if (old === m.id) return;
    w.set(m.x, m.y, m.z, m.id);
    if (m.by && m.by !== this.myId) {
      const pos = [m.x + 0.5, m.y + 0.5, m.z + 0.5];
      if (m.id === B.AIR && old > 0) { this.audio.breakBlock(BLOCKS[old].sound, pos); this.blockParticles(m.x, m.y, m.z, old); }
      else if (m.id !== B.AIR) this.audio.place(BLOCKS[m.id].sound, pos);
    }
  }

  // Tir d'un autre joueur ou d'un pillard : traçante, éclair, son, sifflement
  onShot(m) {
    const g = GUNS[m.g]; if (!g) return;
    const shooter = m.id > 0 ? this.remote.get(m.id) : this.mobs.get(-m.id);
    let o = m.o;
    if (shooter) {
      shooter.anim.kick = 1;
      if (m.id > 0) { const y = shooter.yaw; o = [shooter.x - Math.sin(y) * 0.7, shooter.y + 1.4, shooter.z - Math.cos(y) * 0.7]; }
    }
    for (const e of m.e) {
      this.addTracer(o, e);
      const bx = Math.floor(e[0]), by = Math.floor(e[1]), bz = Math.floor(e[2]);
      const id = this.world.get(bx, by, bz);
      if (id > 0 && SOLID[id] && this.dist({ x: e[0], y: e[1], z: e[2] }) < 60) this.puffAt(e[0], e[1], e[2], this.tileOf(id, 2));
    }
    if (!m.sil) this.addParticle(o[0], o[1], o[2], 0, 0, 0, this.A.tile.fx_flash, 0.05, 0.55, { sub: 16, glow: true, grav: 0, coll: false, trans: true });
    this.audio.gunshot(g.cat, o, m.sil);
    // balle qui frôle le joueur
    const P = this.player, h = [P.x, P.y + 1.4, P.z], e = m.e[0];
    if (e && P.alive && this.state === 'play') {
      const d = [e[0] - o[0], e[1] - o[1], e[2] - o[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
      const t = clamp(((h[0] - o[0]) * d[0] + (h[1] - o[1]) * d[1] + (h[2] - o[2]) * d[2]) / L2, 0, 1);
      const c = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
      if (Math.hypot(c[0] - h[0], c[1] - h[1], c[2] - h[2]) < 2.2 && t > 0.05 && t < 0.98) this.audio.whiz(c);
    }
  }

  // ------------------------------------------------------------ planque et raids
  hideoutKey() { return JSON.stringify([this.stash.slots, this.inv.slots, this.money]); }
  showHideout() {
    this.state = 'hideout';
    document.body.classList.add('ingame');
    this.touch?.release();
    for (const id of ['hud', 'loading', 'raid-end', 'inventory', 'pause', 'map', 'menu']) show(id, false);
    show('hideout');
    document.exitPointerLock?.();
    const left = this.inv.stowCursor(); if (left) this.stash.add(left);
    this.uiOpen = null; this.cont = null;
    this.ui.clearLabels(); this.ui.hideTip();
    this.ui.scope(false); this.ui.dot(false);
    $('ho-deploy').disabled = false;
    this.refreshPanels(true);
  }
  deploy() {
    if (this.state !== 'hideout') return;
    const left = this.inv.stowCursor(); if (left) this.stash.add(left);
    this.syncHideout(true);
    $('ho-deploy').disabled = true;
    this.send({ t: 'deploy', inv: this.inv.toJSON() });
    this.audio.init();
    this.lock();
  }
  startLoading(text) {
    this.state = 'loading';
    document.body.classList.add('ingame');
    this.world.radius = this.S.dist;
    for (const id of ['hideout', 'raid-end', 'menu']) show(id, false);
    $('load-text').textContent = text;
    show('loading');
  }
  endRaid(kind) {
    this.touch?.release();
    const secs = Math.round((performance.now() - this.raidStart) / 1000);
    this.inRaid = false;
    this.closeAllUI();
    this.state = 'end';
    show('hud', false);
    document.exitPointerLock?.();
    this.ui.clearLabels(); this.ui.scope(false); this.ui.dot(false);
    const box = $('raid-end').querySelector('.re-box');
    box.classList.toggle('dead', kind !== 'ok');
    const value = this.inv.allItems().reduce((a, s) => a + itemValue(s), 0);
    const T = { ok: 'Extraction réussie', dead: 'Mort au combat', mia: 'Porté disparu' };
    $('re-title').textContent = T[kind];
    $('re-text').textContent = kind === 'ok' ? 'Vous avez quitté la zone avec tout votre équipement.' : kind === 'mia' ? "Le temps imparti est écoulé : l'équipement emporté est perdu." : `${this.myName} ${this.deathCause || 'est mort.'} Votre corps garde tout ce que vous portiez.`;
    const mm = Math.floor(secs / 60), ss = secs % 60;
    $('re-stats').innerHTML = `<span>Durée du raid</span><b>${mm} min ${String(ss).padStart(2, '0')}</b>` + (kind === 'ok' ? `<span>Valeur rapportée</span><b>${value.toLocaleString('fr-FR')} écus</b>` : '');
    show('raid-end');
    if (kind === 'ok') this.audio.craft();
  }
  syncHideout(force) {
    const k = this.hideoutKey();
    if (!force && k === this.hoSent) return;
    this.hoSent = k;
    this.send({ t: 'hideout', stash: this.stash.toJSON(), inv: this.inv.toJSON(), money: this.money, hunger: this.player.hunger });
  }

  // ------------------------------------------------------------ grilles, conteneurs, marchand, armurerie
  gridClick(grid, i, b, shift, ctrl) {
    const inv = this.inv, ho = this.state === 'hideout';
    if (grid === 'cont') { this.contClick(i, b); return; }
    const g = grid === 'inv' ? inv : this.stash;
    if (ctrl && ho && g.slots[i]) { this.sellSlot(g, i); return; }
    if (shift && !ho && grid === 'inv' && this.cont && this.tab.inv === 'cont') { this.putToCont(i); return; }
    const shiftTo = shift && ho ? (grid === 'inv' ? this.stash : inv) : null;
    clickSlot(g, i, b, shift, inv, shiftTo);
    this.audio.click();
    this.refreshPanels();
  }
  contClick(i, b) {
    const c = this.cont; if (!c) return;
    const cur = this.inv.cursor;
    if (cur) {
      if (b === 2 && cur.n > 1) { this.send({ t: 'cput', key: c.key, slot: i, item: { ...cloneItem(cur), n: 1 } }); cur.n--; }
      else { this.send({ t: 'cput', key: c.key, slot: i, item: cur }); this.inv.cursor = null; }
      this.inv.changed(); this.audio.click();
    } else if (c.items[i]) {
      if (!this.inv.canAdd(c.items[i])) { this.ui.toast('Sac plein'); return; }
      this.send({ t: 'ctake', key: c.key, slot: i });
    }
    this.refreshPanels();
  }
  putToCont(i) {
    const s = this.inv.slots[i]; if (!s || !this.cont) return;
    this.send({ t: 'cput', key: this.cont.key, slot: -1, item: s });
    this.inv.slots[i] = null; this.inv.changed(); this.audio.click();
    this.refreshPanels();
  }
  takeAll() {
    const c = this.cont; if (!c) return;
    let full = false;
    const sim = new Grid(this.inv.slots.length, 36); sim.slots = this.inv.toJSON();
    c.items.forEach((s, i) => { if (!s) return; if (sim.add(s)) { full = true; return; } this.send({ t: 'ctake', key: c.key, slot: i }); });
    if (full) this.ui.toast('Sac plein : tout ne rentre pas');
  }
  interact() {
    const T = this.target; if (!T) return false;
    if (T.bag) { this.send({ t: 'open', key: 'b:' + T.bag.id }); this.pendingOpen = 1; return true; }
    if (T.block && CONTAINER[T.block.id]) { this.send({ t: 'open', x: T.block.x, y: T.block.y, z: T.block.z }); this.pendingOpen = 1; return true; }
    return false;
  }
  buy(id, times) {
    let bought = 0;
    for (let t = 0; t < times; t++) {
      const price = buyPrice(id);
      if (this.money < price) { if (!bought) this.ui.toast('Pas assez d\'écus'); break; }
      const item = GUNS[id] ? { id, n: 1, d: 0, m: {}, a: 0, at: 0, fm: 0 } : { id, n: AMMO[id] ? AMMO_LOT : 1, d: 0 };
      if (!this.stash.canAdd(item)) { this.ui.toast('Planque pleine'); break; }
      this.stash.add(item); this.money -= price; bought++;
    }
    if (bought) { this.audio.craft(); this.ui.toast(`Acheté : ${ITEMS[id].name}${bought > 1 ? ' ×' + bought : ''}`, 1200); this.refreshPanels(); }
  }
  sellItem(s) {
    const p = sellPrice(s);
    this.money += p;
    this.audio.pickup();
    this.ui.toast(`Vendu : ${ITEMS[s.id].name} (+${p.toLocaleString('fr-FR')} écus)`, 1400);
  }
  sellCursor() {
    const c = this.inv.cursor; if (!c || this.state !== 'hideout') return;
    this.sellItem(c); this.inv.cursor = null; this.inv.changed(); this.refreshPanels();
  }
  sellSlot(g, i) { const s = g.slots[i]; if (!s) return; this.sellItem(s); g.slots[i] = null; g.changed(); this.refreshPanels(); }

  gsContext() {
    const ho = this.state === 'hideout', guns = [], mods = new Map();
    const scan = (grid, name) => grid.slots.forEach((s, i) => {
      if (!s) return;
      if (GUNS[s.id]) guns.push({ ref: name + ':' + i, s });
      else if (MODS[s.id]) mods.set(s.id, (mods.get(s.id) || 0) + s.n);
    });
    scan(this.inv, 'inv'); if (ho) scan(this.stash, 'stash');
    if (!guns.find((g) => g.ref === this.gsSel)) this.gsSel = (guns.find((g) => g.ref === 'inv:' + this.inv.sel) || guns[0] || {}).ref || null;
    return { guns, sel: this.gsSel, mods: [...mods].map(([id, n]) => ({ id, n })) };
  }
  gsItem() {
    if (!this.gsSel) return null;
    const [g, i] = this.gsSel.split(':'), grid = g === 'inv' ? this.inv : this.stash, s = grid.slots[+i];
    return s && GUNS[s.id] ? s : null;
  }
  giveBack(item) {
    const ho = this.state === 'hideout';
    let left = (ho ? this.stash : this.inv).add(item);
    if (left && ho) left = this.inv.add({ ...item, n: left });
    if (left) { if (this.state === 'play') this.dropItem({ ...item, n: left }, false); else this.ui.toast('Plus de place'); }
  }
  fixMag(s) {
    const st = gunStats(s);
    if ((s.a | 0) > st.mag) { this.giveBack({ id: s.at, n: s.a - st.mag }); s.a = st.mag; }
  }
  gsInstall(slot, id) {
    const s = this.gsItem(); if (!s) return;
    const src = this.inv.count(id) > 0 ? this.inv : (this.state === 'hideout' && this.stash.count(id) > 0 ? this.stash : null);
    if (!src) return;
    src.remove(id, 1);
    s.m = s.m || {};
    const old = s.m[slot];
    s.m[slot] = id;
    if (old) this.giveBack({ id: old, n: 1 });
    this.fixMag(s);
    this.inv.changed(); this.stash.changed();
    this.audio.gunFx('magin');
    this.refreshPanels(true);
  }
  gsRemove(slot) {
    const s = this.gsItem(); if (!s || !s.m || !s.m[slot]) return;
    const old = s.m[slot];
    delete s.m[slot];
    this.giveBack({ id: old, n: 1 });
    this.fixMag(s);
    this.inv.changed(); this.stash.changed();
    this.audio.gunFx('magout');
    this.refreshPanels(true);
  }

  // Met à jour les grilles et le panneau à onglets de l'écran affiché
  refreshPanels(force) {
    const ho = this.state === 'hideout';
    if (!ho && this.uiOpen !== 'inv') return;
    const where = ho ? 'ho' : 'inv';
    const gk = `${this.inv.version}:${this.stash.version}:${this.contVer}:${!!this.inv.cursor}`;
    if (force || gk !== this.gridKey) {
      this.gridKey = gk;
      this.ui.renderGrids();
      this.ui.armorInfo(this.inv);
    }
    const tabs = ho ? [['trader', 'Marchand'], ['gunsmith', 'Armurerie'], ['craft', 'Fabrication']]
      : [['craft', 'Fabrication'], ['gunsmith', 'Armurerie']].concat(this.cont ? [['cont', this.cont.title]] : []);
    if (!tabs.some((t) => t[0] === this.tab[where])) this.tab[where] = tabs[0][0];
    const stations = ho ? new Set([B.TABLE, B.FURNACE]) : this.stations;
    const pk = `${where}:${this.tab[where]}:${this.inv.version}:${this.stash.version}:${this.contVer}:${this.money}:${this.gsSel}:${this.traderCat}:${[...stations].join()}`;
    if (!force && pk === this.panelKey) return;
    this.panelKey = pk;
    const tab = this.tab[where];
    this.ui.renderPanel(where, {
      tab, tabs, inv: this.inv, stations, cont: this.cont, hideout: ho, money: this.money, trader: this.traderCat,
      gs: tab === 'gunsmith' ? this.gsContext() : null,
    });
    if (ho) this.renderHideoutHead();
  }
  renderHideoutHead() {
    const used = this.stash.slots.filter(Boolean).length;
    this.ui.renderHideout({
      money: this.money, stats: this.stats, kitLeft: (this.kitAt - performance.now()) / 1000, stashUsed: used,
      stashValue: this.stash.items().reduce((a, s) => a + itemValue(s), 0), invValue: this.inv.allItems().reduce((a, s) => a + itemValue(s), 0),
    });
  }

  // ------------------------------------------------------------ entrées
  initInput() {
    const canvas = $('gl');
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      this.inp.active = locked;
      if (!locked) {
        this.mouse.left = this.mouse.right = false;
        for (const k in this.keys) this.keys[k] = false;
        if (this.state === 'play' && !this.uiOpen && this.player.alive) this.showPause();
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'play') return;
      if (!this.inp.active) { if (!this.uiOpen && this.player.alive) this.lock(); return; }
      this.audio.init();
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    document.addEventListener('contextmenu', (e) => { if (this.state === 'play' || this.state === 'hideout') e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.inp.active) return;
      const s = 0.0022 * this.S.sens / Math.pow(this.weapons.zoom(), 0.85);
      this.player.yaw -= e.movementX * s;
      this.player.pitch = clamp(this.player.pitch - e.movementY * s, -1.55, 1.55);
    });
    document.addEventListener('wheel', (e) => {
      if (this.state !== 'play' || !this.inp.active) return;
      this.selectSlot((this.inv.sel + (e.deltaY > 0 ? 1 : 8)) % 9);
    }, { passive: true });

    const chatInput = $('chat-input');
    chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = chatInput.value.trim();
        if (v) this.send({ t: 'chat', text: v });
        this.closeChat();
      } else if (e.key === 'Escape') this.closeChat();
    });
    chatInput.addEventListener('keyup', (e) => e.stopPropagation());
    chatInput.addEventListener('blur', () => { if (this.touch && this.uiOpen === 'chat') this.closeChat(); });

    window.addEventListener('keydown', (e) => {
      if (this.state !== 'play') return;
      const c = e.code, k = (e.key || '').toLowerCase();
      if (c === 'Tab') { e.preventDefault(); show('players'); this.ui.playerList([this.myName, ...[...this.remote.values()].map((p) => p.name)]); return; }
      if (c === 'F3') { e.preventDefault(); $('debug').classList.toggle('hidden'); return; }
      if (this.uiOpen === 'inv') {
        if (c === 'KeyE' || c === 'Escape') { e.preventDefault(); this.closeInventory(); }
        return;
      }
      if (this.uiOpen === 'map') {
        if (k === 'm' || c === 'Escape') { e.preventDefault(); this.closeMap(); }
        return;
      }
      if (this.uiOpen) return;
      if (!e.repeat && c === 'KeyW' && !this.keys.KeyW) {
        const now = performance.now();
        if (now - (this.lastW || 0) < 280) this.inp.forwardTap = true;
        this.lastW = now;
      }
      this.keys[c] = true;
      if (!this.player.alive) return;
      if (c === 'KeyE') { e.preventDefault(); this.openInventory(); }
      else if (c === 'KeyT' || c === 'Enter') { e.preventDefault(); this.openChat(''); }
      else if (c === 'Slash' || e.key === '/') { e.preventDefault(); this.openChat('/'); }
      else if (c === 'KeyV' && !e.repeat) this.view = (this.view + 1) % 3;
      else if (c === 'KeyQ' && !e.repeat) this.dropHeld(e.ctrlKey);
      else if (k === 'r' && !e.repeat) this.weapons.reload();
      else if (k === 'b' && !e.repeat) this.weapons.toggleMode();
      else if (k === 'l' && !e.repeat) this.weapons.toggleLight();
      else if (k === 'f' && !e.repeat) { if (!this.interact()) this.ui.toast('Rien à fouiller ici', 900); }
      else if (k === 'm' && !e.repeat) this.openMap();
      else if (c.startsWith('Digit')) { const n = +c.slice(5); if (n >= 1 && n <= 9) this.selectSlot(n - 1); }
      if (c === 'Space' || c.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Tab') show('players', false);
    });
    window.addEventListener('blur', () => { for (const k in this.keys) this.keys[k] = false; });
  }

  lock() {
    if (this.touch) { this.inp.active = this.state === 'play'; this.touch.fullscreen(); return; }
    const c = $('gl');
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { c.requestPointerLock(); } catch { /* */ } });
    } catch { try { c.requestPointerLock(); } catch { /* */ } }
  }
  showPause() { this.touch?.release(); this.uiOpen = 'pause'; show('pause'); }
  hidePause() { this.uiOpen = null; show('pause', false); }
  openChat(pre) { this.touch?.release(); this.uiOpen = 'chat'; document.exitPointerLock(); this.ui.openChat(pre); }
  closeChat() { this.uiOpen = null; this.ui.closeChat(); this.lock(); }
  selectSlot(i) { if (i !== this.inv.sel) { this.inv.sel = i; this.equip = 0; this.mining = null; this.eating = 0; this.weapons.onSwitch(); this.inv.changed(); } }
  openMap() {
    this.touch?.release();
    this.uiOpen = 'map';
    document.exitPointerLock();
    show('map');
    const P = this.player;
    this.ui.renderMap($('map-canvas'), this.world.gen, P, this.world.gen.structuresNear(P.x, P.z, 560));
  }
  closeMap() { show('map', false); this.uiOpen = null; this.lock(); }

  openInventory() {
    this.touch?.release();
    this.uiOpen = 'inv';
    document.exitPointerLock();
    this.updateStations();
    show('inventory');
    this.refreshPanels(true);
  }
  closeInventory() {
    const left = this.inv.stowCursor();
    if (left) this.dropItem(left, true);
    if (this.cont) { this.send({ t: 'close', key: this.cont.key }); this.cont = null; this.contVer++; }
    if (this.tab.inv === 'cont') this.tab.inv = 'craft';
    show('inventory', false);
    $('cursor-stack').innerHTML = '';
    this.ui.hideTip();
    this.uiOpen = null;
    this.lock();
  }
  closeAllUI() {
    if (this.uiOpen === 'inv') {
      const left = this.inv.stowCursor(); if (left) this.stash.add(left);
      if (this.cont) this.send({ t: 'close', key: this.cont.key });
    }
    this.cont = null; this.tab.inv = 'craft';
    for (const id of ['inventory', 'map', 'pause']) show(id, false);
    if (this.uiOpen === 'chat') this.ui.closeChat();
    $('cursor-stack').innerHTML = '';
    this.ui.hideTip();
    this.uiOpen = null;
  }

  updateStations() {
    const p = this.player, s = new Set();
    const px = Math.floor(p.x), py = Math.floor(p.y + 1), pz = Math.floor(p.z);
    for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
      const id = this.world.get(px + x, py + y, pz + z);
      if (id === B.TABLE || id === B.FURNACE) s.add(id);
    }
    const changed = s.size !== this.stations.size || [...s].some((v) => !this.stations.has(v));
    this.stations = s;
    return changed;
  }

  craft(r, shift) {
    const n = this.inv.craft(r, shift ? this.inv.maxCraft(r) : 1);
    if (n) { this.audio.craft(); this.refreshPanels(); }
  }

  // ------------------------------------------------------------ objets
  dropItem(item, forward) {
    const p = this.player;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), sp = Math.sin(p.pitch), cp = Math.cos(p.pitch);
    const v = forward ? 4.5 : 1.5;
    this.send({
      t: 'drop', item: cloneItem(item),
      x: p.x - sy * 0.3, y: p.y + EYE - 0.3, z: p.z - cy * 0.3,
      vx: -sy * cp * v + (forward ? 0 : (Math.random() - 0.5) * 3), vy: sp * v + 2, vz: -cy * cp * v + (forward ? 0 : (Math.random() - 0.5) * 3),
    });
  }
  dropHeld(all) {
    const h = this.inv.held(); if (!h) return;
    const n = all ? h.n : 1;
    this.dropItem({ ...h, n }, true);
    this.inv.consumeHeld(n);
    this.swing = 0.001;
  }
  dropCursor(one) {
    const c = this.inv.cursor; if (!c) return;
    if (this.state === 'hideout') { const left = this.stash.add(c); this.inv.cursor = left ? { ...c, n: left } : null; this.inv.changed(); this.refreshPanels(); return; }
    const n = one ? 1 : c.n;
    this.dropItem({ ...c, n }, true);
    c.n -= n; if (!c.n) this.inv.cursor = null;
    this.inv.changed(); this.refreshPanels();
  }

  // ------------------------------------------------------------ mort / dégâts
  onHurt(fromX, fromZ, n) {
    this.ui.flashHurt(Math.min(0.95, 0.4 + (n || 1) * 0.08));
    this.audio.hurt();
    if (fromX !== undefined) {
      const P = this.player;
      const bearing = Math.atan2(fromX - P.x, -(fromZ - P.z));
      this.ui.dmgDir(bearing + P.yaw);
    }
  }
  armorHit(def, broken) {
    const P = this.player;
    this.audio.impact([P.x, P.y + 1.4, P.z], 'stone');
    if (broken) this.ui.toast(`${def.name} : hors d'usage`);
  }
  onDeath(cause) {
    const p = this.player;
    if (!p.alive && this.state !== 'play') return;
    p.alive = false;
    this.deathCause = cause || 'est mort.';
    const items = this.inv.allItems();
    this.inv.clear();
    this.send({ t: 'dead', cause: this.deathCause, items, killer: p.lastKiller || 0 });
    this.audio.death();
    this.mining = null; this.eating = 0;
    this.endRaid('dead');
  }

  // ------------------------------------------------------------ visée
  updateTarget() {
    const p = this.player, eye = [p.x, p.y + p.eyeH, p.z];
    const cp = Math.cos(p.pitch);
    const d = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
    const blk = this.world.raycast(eye[0], eye[1], eye[2], d[0], d[1], d[2], REACH, (id) => id !== B.WATER);
    let ent = null, best = Math.min(HIT_REACH, blk ? blk.dist : Infinity);
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const hw = m.w / 2 + 0.1;
      const t = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], m.x - hw, m.y, m.z - hw, m.x + hw, m.y + m.h + 0.1, m.z + hw);
      if (t !== null && t < best) { best = t; ent = { kind: 'mob', e: m }; }
    }
    for (const q of this.remote.values()) {
      if (!q.alive) continue;
      const t = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], q.x - 0.35, q.y, q.z - 0.35, q.x + 0.35, q.y + 1.85, q.z + 0.35);
      if (t !== null && t < best) { best = t; ent = { kind: 'player', e: q }; }
    }
    // sacs et corps
    let bag = null, bd = Math.min(3.5, blk ? blk.dist : Infinity);
    for (const b of this.bags.values()) {
      const t = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], b.x - 0.5, b.y - 0.1, b.z - 0.5, b.x + 0.5, b.y + 0.55, b.z + 0.5);
      if (t !== null && t < bd) { bd = t; bag = b; }
    }
    this.target = { block: ent ? null : blk, ent, bag, dir: d, eye };
  }

  // ------------------------------------------------------------ actions
  actions(dt) {
    const p = this.player, inv = this.inv;
    this.attackCd -= dt; this.mineCd -= dt; this.placeCd -= dt;
    if (!p.alive || this.uiOpen || !this.inp.active) {
      this.weapons.update(dt, false);
      this.mining = null; this.eating = 0; this.mouse.leftPressed = this.mouse.rightPressed = false; return;
    }
    const T = this.target, held = inv.held(), heldIt = held ? ITEMS[held.id] : null;

    // Armes à feu : tout passe par le module d'armes
    if (heldIt && heldIt.gun) {
      this.weapons.update(dt, true);
      this.mining = null; this.eating = 0;
      this.mouse.leftPressed = this.mouse.rightPressed = false;
      return;
    }
    this.weapons.update(dt, false);

    // Clic droit sur une caisse ou un corps : fouiller
    if (this.mouse.rightPressed && (T.bag || (T.block && CONTAINER[T.block.id]))) {
      this.interact(); this.mouse.right = false; this.mouse.leftPressed = this.mouse.rightPressed = false; return;
    }

    // Soins (maintenir clic droit)
    const med = heldIt && heldIt.med;
    if (med) {
      if (this.mouse.right) {
        if (!this.eating) this.audio.heal();
        this.eating += dt;
        if (this.eating >= med.time) {
          p.useMed(med); inv.consumeHeld(1); this.eating = 0; this.audio.heal();
          this.ui.toast(med.bleed ? 'Soigné — hémorragie stoppée' : 'Stimulant injecté', 1500);
          this.send({ t: 'inv', inv: inv.toJSON(), hp: p.hp, hunger: p.hunger, raidT: this.raidT });
        }
      } else this.eating = 0;
    }

    // Attaque
    if (this.mouse.leftPressed && T.ent && this.attackCd <= 0) {
      const tool = heldIt && heldIt.tool;
      let dmg = tool ? tool.dmg : 1;
      const crit = p.vy < -1 && !p.onGround && !p.inWater;
      if (crit) dmg *= 1.5;
      if (T.ent.kind === 'mob') this.send({ t: 'attack', id: T.ent.e.id, dmg });
      else if (this.pvp) this.send({ t: 'hitp', id: T.ent.e.id, dmg });
      this.audio.hit([T.ent.e.x, T.ent.e.y + 1, T.ent.e.z]);
      if (crit) this.sparks(T.ent.e.x, T.ent.e.y + (T.ent.e.h || 1.8) * 0.6, T.ent.e.z);
      if (tool) { if (inv.wearHeld()) { this.audio.toolBreak(); this.ui.toast('Votre outil s\'est brisé'); } }
      p.exh += 0.1;
      this.attackCd = 0.4; this.swing = 0.001; this.send({ t: 'swing' });
      this.mining = null;
    } else if (this.mouse.leftPressed && !T.block && !T.ent) {
      this.swing = 0.001; this.audio.swing(); this.send({ t: 'swing' });
    }

    // Minage
    if (this.mouse.left && T.block && !T.ent && this.mineCd <= 0) {
      const b = T.block, id = b.id;
      if (!this.mining || this.mining.x !== b.x || this.mining.y !== b.y || this.mining.z !== b.z || this.mining.id !== id) {
        this.mining = { x: b.x, y: b.y, z: b.z, id, p: 0, snd: 0 };
      }
      const m = this.mining;
      const bt = breakTime(id, inv.heldId());
      if (isFinite(bt)) {
        m.p += dt / bt;
        m.snd -= dt;
        if (this.swing <= 0 || this.swing > 0.8) { this.swing = 0.001; if (m.snd <= 0) this.send({ t: 'swing' }); }
        if (m.snd <= 0) { m.snd = 0.24; this.audio.dig(BLOCKS[id].sound, [b.x + 0.5, b.y + 0.5, b.z + 0.5]); this.digParticles(b); }
        if (m.p >= 1) this.breakBlock(b);
      }
    } else if (!this.mouse.left) this.mining = null;

    // Nourriture (clic droit)
    const food = heldIt && heldIt.food;
    if (this.mouse.right && food && (p.hunger < 20 || heldIt.always) && !(T.block && this.isStation(T.block.id) && this.mouse.rightPressed)) {
      this.eating += dt;
      this.eatSound -= dt;
      if (this.eatSound <= 0) { this.eatSound = 0.22; this.audio.eat(); this.crumbs(held.id); }
      if (this.eating > 1.3) {
        p.eat(food); inv.consumeHeld(1); this.eating = 0; this.audio.burp();
        this.send({ t: 'inv', inv: inv.toJSON(), hp: p.hp, hunger: p.hunger, raidT: this.raidT });
      }
    } else if (!med) this.eating = 0;

    if (this.mouse.right && (this.mouse.rightPressed || this.placeCd <= 0) && !food && !med) {
      if (T.block && this.isStation(T.block.id) && this.mouse.rightPressed) { this.openInventory(); this.mouse.right = false; }
      else if (T.block && held && heldIt.block) this.placeBlock(T.block, held.id);
      this.placeCd = 0.22;
    }
    this.mouse.leftPressed = false; this.mouse.rightPressed = false;
  }

  isStation(id) { return id === B.TABLE || id === B.FURNACE; }

  breakBlock(b) {
    const id = b.id, inv = this.inv, held = inv.held();
    if (!isFinite(BLOCKS[id].hardness)) return;
    this.send({ t: 'set', x: b.x, y: b.y, z: b.z, id: B.AIR, tool: inv.heldId() });
    this.world.set(b.x, b.y, b.z, B.AIR);
    this.audio.breakBlock(BLOCKS[id].sound, [b.x + 0.5, b.y + 0.5, b.z + 0.5]);
    this.blockParticles(b.x, b.y, b.z, id);
    if (held && ITEMS[held.id].tool && BLOCKS[id].hardness > 0) {
      if (inv.wearHeld()) { this.audio.toolBreak(); this.ui.toast('Votre outil s\'est brisé'); }
    }
    this.player.exh += 0.005;
    this.mining = null;
    this.mineCd = 0.15;
    const above = this.world.get(b.x, b.y + 1, b.z);
    if (above > 0 && BLOCKS[above].needsSupport) this.world.set(b.x, b.y + 1, b.z, B.AIR);
  }

  breakGlass(gl) {
    if (this.world.get(gl.x, gl.y, gl.z) !== B.GLASS) return;
    this.send({ t: 'set', x: gl.x, y: gl.y, z: gl.z, id: B.AIR, glass: true });
    this.world.set(gl.x, gl.y, gl.z, B.AIR);
    this.audio.breakBlock('glass', [gl.x + 0.5, gl.y + 0.5, gl.z + 0.5]);
    this.blockParticles(gl.x, gl.y, gl.z, B.GLASS);
  }

  placeBlock(t, id) {
    const w = this.world, b = BLOCKS[id];
    let x = t.x, y = t.y, z = t.z;
    if (!BLOCKS[t.id].replaceable) { x += t.nx; y += t.ny; z += t.nz; }
    if (y < 0 || y >= HEIGHT) return;
    const cur = w.get(x, y, z);
    if (cur < 0 || !(cur === B.AIR || cur === B.WATER || BLOCKS[cur].replaceable)) return;
    if (b.needsSupport) {
      const below = w.get(x, y - 1, z);
      if (!SOLID[below] || BLOCKS[below].render !== 'cube') return;
    }
    if (b.solid) {
      if (this.player.intersectsBlock(x, y, z)) return;
      for (const m of this.mobs.values()) { const hw = m.w / 2; if (m.x + hw > x && m.x - hw < x + 1 && m.y + m.h > y && m.y < y + 1 && m.z + hw > z && m.z - hw < z + 1) return; }
      for (const q of this.remote.values()) if (q.alive && q.x + 0.3 > x && q.x - 0.3 < x + 1 && q.y + 1.8 > y && q.y < y + 1 && q.z + 0.3 > z && q.z - 0.3 < z + 1) return;
    }
    this.send({ t: 'set', x, y, z, id });
    w.set(x, y, z, id);
    this.inv.consumeHeld(1);
    this.audio.place(b.sound, [x + 0.5, y + 0.5, z + 0.5]);
    this.swing = 0.001; this.send({ t: 'swing' });
  }

  // ------------------------------------------------------------ particules et effets
  tileOf(id, face = 2) {
    const b = BLOCKS[id];
    if (b && b.tex) return this.A.tile[[b.tex.top, b.tex.bottom, b.tex.front, b.tex.front, b.tex.side, b.tex.side][face]];
    return this.A.tile['item:' + id] || this.A.tile.dirt;
  }
  addParticle(x, y, z, vx, vy, vz, tile, life, size, o = {}) {
    if (this.particles.length > 1800) return;
    const s = o.sub ?? 4, u = tile[0] + Math.floor(Math.random() * (16 - s + 1)), v = tile[1] + Math.floor(Math.random() * (16 - s + 1));
    this.particles.push({ x, y, z, vx, vy, vz, life, max: life, size, u0: o.u0 ?? u, v0: o.v0 ?? v, u1: o.u1 ?? u + s, v1: o.v1 ?? v + s, grav: o.grav ?? 16, glow: !!o.glow, coll: o.coll !== false, shrink: !!o.shrink, grow: o.grow || 0, trans: !!o.trans });
  }
  blockParticles(x, y, z, id) {
    const tile = this.tileOf(id, 4);
    for (let i = 0; i < 26; i++) {
      const px = x + 0.1 + Math.random() * 0.8, py = y + 0.1 + Math.random() * 0.8, pz = z + 0.1 + Math.random() * 0.8;
      this.addParticle(px, py, pz, (px - x - 0.5) * 4, 2 + Math.random() * 2, (pz - z - 0.5) * 4, tile, 0.5 + Math.random() * 0.6, 0.1 + Math.random() * 0.08);
    }
  }
  digParticles(b) {
    const tile = this.tileOf(b.id, 4);
    for (let i = 0; i < 3; i++) {
      const px = b.x + 0.5 + b.nx * 0.52 + (b.nx ? 0 : (Math.random() - 0.5) * 0.9);
      const py = b.y + 0.5 + b.ny * 0.52 + (b.ny ? 0 : (Math.random() - 0.5) * 0.9);
      const pz = b.z + 0.5 + b.nz * 0.52 + (b.nz ? 0 : (Math.random() - 0.5) * 0.9);
      this.addParticle(px, py, pz, b.nx * 1.5 + (Math.random() - 0.5), 1.5 + b.ny, b.nz * 1.5 + (Math.random() - 0.5), tile, 0.4 + Math.random() * 0.3, 0.08);
    }
  }
  // Impact de balle sur un bloc : éclats + poussière
  impact(b, p) {
    const tile = this.tileOf(b.id, 4), x = p[0] + b.nx * 0.03, y = p[1] + b.ny * 0.03, z = p[2] + b.nz * 0.03;
    for (let i = 0; i < 6; i++) this.addParticle(x, y, z, b.nx * 2.5 + (Math.random() - 0.5) * 3, b.ny * 2.5 + Math.random() * 2.5, b.nz * 2.5 + (Math.random() - 0.5) * 3, tile, 0.35 + Math.random() * 0.3, 0.06);
    this.puffAt(x, y, z, null);
  }
  puffAt(x, y, z) {
    const t = this.A.tile.fx_dust;
    for (let i = 0; i < 2; i++) this.addParticle(x, y, z, (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6, t, 0.6 + Math.random() * 0.4, 0.22, { sub: 16, grav: -0.3, coll: false, grow: 0.5, trans: true });
  }
  blood(x, y, z, d) {
    const t = this.A.tile.fx_blood;
    for (let i = 0; i < 9; i++) this.addParticle(x, y, z, d[0] * 2 + (Math.random() - 0.5) * 2.5, d[1] * 2 + Math.random() * 2, d[2] * 2 + (Math.random() - 0.5) * 2.5, t, 0.4 + Math.random() * 0.4, 0.07 + Math.random() * 0.05, { sub: 3 });
  }
  addTracer(p0, p1) {
    const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    if (d < 1) return;
    this.tracers.push({ p0: p0.slice(), p1: p1.slice(), d, t: 0 });
    if (this.tracers.length > 80) this.tracers.shift();
  }
  crumbs(id) {
    const p = this.player, tile = this.tileOf(id);
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    for (let i = 0; i < 4; i++) this.addParticle(p.x - sy * 0.45, p.y + EYE - 0.25, p.z - cy * 0.45, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5, tile, 0.5, 0.07);
  }
  puff(x, y, z, n = 12, spread = 0.6) {
    const tile = this.A.tile.snow;
    for (let i = 0; i < n; i++) this.addParticle(x + (Math.random() - 0.5) * spread, y + Math.random() * spread, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 1.2, 0.6 + Math.random(), (Math.random() - 0.5) * 1.2, tile, 0.6 + Math.random() * 0.5, 0.18, { grav: -0.6, coll: false, shrink: true });
  }
  sparks(x, y, z) {
    const tile = this.A.tile.gold_block;
    for (let i = 0; i < 10; i++) this.addParticle(x, y, z, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5, tile, 0.4, 0.07, { glow: true, grav: 10, sub: 2 });
  }
  flame(x, y, z) {
    const t = this.A.tile.torch;
    this.addParticle(x, y, z, 0, 0.35 + Math.random() * 0.2, 0, t, 0.35 + Math.random() * 0.25, 0.1, { u0: t[0] + 7, v0: t[1] + 6, u1: t[0] + 9, v1: t[1] + 8, glow: true, grav: 0, coll: false, shrink: true });
  }
  smoke(x, y, z) {
    const t = this.A.tile.bedrock;
    this.addParticle(x, y, z, (Math.random() - 0.5) * 0.2, 0.6, (Math.random() - 0.5) * 0.2, t, 1.2, 0.12, { grav: -0.2, coll: false, shrink: true, sub: 3 });
  }

  updateParticles(dt) {
    const w = this.world;
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.vy -= p.grav * dt;
      if (p.grow) p.size += p.grow * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.coll && w.solid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        if (!w.solid(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))) { p.vx *= -0.2; p.vz *= -0.2; p.y = ny; }
        else { p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; }
      } else { p.x = nx; p.y = ny; p.z = nz; }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; t.t += dt; if (t.t * 420 > t.d + 6) this.tracers.splice(i, 1); }
    // fumigènes rouges au-dessus des zones d'extraction
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.state === 'play') {
      this.smokeT = 0.12;
      const P = this.player, tile = this.A.tile.fx_smoke;
      for (const e of this.exList) {
        if (Math.hypot(e.cx - P.x, e.cz - P.z) > this.world.radius * 16) continue;
        for (const [x, z] of [[e.x0, e.z0], [e.x0 + e.w - 1, e.z0 + e.d - 1]]) {
          this.addParticle(x + 0.5, e.y + 3, z + 0.5, (Math.random() - 0.5) * 0.3 + 0.2, 1.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, tile, 5 + Math.random() * 2, 0.7, { sub: 16, grav: 0.05, coll: false, grow: 0.5, trans: true, glow: true });
        }
      }
    }
    // flammes des torches proches
    this.flameT = (this.flameT || 0) - dt;
    if (this.flameT <= 0 && this.r.visible) {
      this.flameT = 0.12;
      const P = this.player;
      for (const c of this.r.visible) {
        const t = c.torches;
        for (let i = 0; i < t.length; i += 3) {
          const x = c.cx * 16 + t[i], y = t[i + 1], z = c.cz * 16 + t[i + 2];
          if (Math.abs(x - P.x) > 20 || Math.abs(z - P.z) > 20 || Math.abs(y - P.y) > 16) continue;
          if (w.get(x, y, z) !== B.TORCH) continue;
          if (Math.random() < 0.35) this.flame(x + 0.5 + (Math.random() - 0.5) * 0.05, y + 0.68, z + 0.5 + (Math.random() - 0.5) * 0.05);
          if (Math.random() < 0.12) this.smoke(x + 0.5, y + 0.8, z + 0.5);
        }
      }
    }
  }

  // ------------------------------------------------------------ entités (mise à jour)
  updateEntities(dt) {
    const k = Math.min(1, dt * 12);
    for (const q of this.remote.values()) {
      const ox = q.x, oz = q.z;
      q.x = lerp(q.x, q.tx, k); q.y = lerp(q.y, q.ty, k); q.z = lerp(q.z, q.tz, k);
      if (Math.hypot(q.tx - q.x, q.tz - q.z) > 8) { q.x = q.tx; q.y = q.ty; q.z = q.tz; }
      q.yaw = angleLerp(q.yaw, q.tyaw, k); q.pitch = lerp(q.pitch, q.tpitch, k);
      const sp = Math.hypot(q.x - ox, q.z - oz) / Math.max(dt, 1e-3);
      const a = q.anim;
      a.t += dt; a.amt = lerp(a.amt, Math.min(1, sp / 4.3), Math.min(1, dt * 8)); a.walk += sp * dt * 2.1;
      a.pitch = q.pitch; a.held = q.held;
      a.gun = !!GUNS[q.held]; a.low = sp > 5.2; a.pistol = GUNS[q.held] && GUNS[q.held].cat === 'pistol';
      a.kick = Math.max(0, a.kick - dt * 8);
      if (a.reload > 0) { a.reload += dt / 2.2; if (a.reload >= 1) a.reload = 0; }
      if (q.swing > 0) { q.swing += dt / 0.3; if (q.swing >= 1) q.swing = 0; }
      a.swing = q.swing;
      q.stepD = (q.stepD || 0) + Math.hypot(q.x - ox, q.z - oz);
      if (q.stepD > 1.9) { q.stepD = 0; const id = this.world.get(Math.floor(q.x), Math.floor(q.y - 0.2), Math.floor(q.z)); if (id > 0) this.audio.step(BLOCKS[id].sound, [q.x, q.y, q.z], 0.25); }
    }
    for (const [id, m] of this.mobs) {
      const a = m.anim;
      a.t += dt;
      if (m.dead) {
        m.dead += dt;
        if (m.dead > 0.8) { this.puff(m.x, m.y + m.h * 0.3, m.z, 14, Math.max(0.6, m.w)); this.mobs.delete(id); }
        continue;
      }
      const ox = m.x, oz = m.z, oy = m.y;
      m.x = lerp(m.x, m.tx, k); m.y = lerp(m.y, m.ty, k); m.z = lerp(m.z, m.tz, k);
      if (Math.hypot(m.tx - m.x, m.tz - m.z) > 6) { m.x = m.tx; m.y = m.ty; m.z = m.tz; }
      m.yaw = angleLerp(m.yaw, m.tyaw, Math.min(1, dt * 8));
      m.pitch = lerp(m.pitch, m.tpitch || 0, Math.min(1, dt * 8));
      const sp = Math.hypot(m.x - ox, m.z - oz) / Math.max(dt, 1e-3);
      a.amt = lerp(a.amt, Math.min(1, sp / 2.5), Math.min(1, dt * 8));
      a.walk += sp * dt * (m.type === 'chicken' ? 4 : 2.6);
      a.attack = lerp(a.attack, m.fl & 1 ? 1 : 0, Math.min(1, dt * 10));
      a.eat = m.fl & 2 ? a.eat + dt : 0;
      a.air = !(m.fl & 16);
      if (m.type === 'bandit') {
        a.gun = true; a.low = !(m.fl & 32); a.pitch = m.pitch; a.pistol = m.gunItem && GUNS[m.gunItem.id] && GUNS[m.gunItem.id].cat === 'pistol';
        a.kick = Math.max(0, a.kick - dt * 8);
        if (m.fl & 64) a.reload = a.reload > 0 ? (a.reload + dt / 2.4) % 1 || 0.001 : 0.001; else a.reload = 0;
      }
      const vy = (m.y - oy) / Math.max(dt, 1e-3);
      if (m.type === 'slime') {
        const target = clamp(vy * 0.05, -0.25, 0.35);
        if (!a.air && m.pvy < -2) a.squash = -0.35;
        a.squash = lerp(a.squash, target, Math.min(1, dt * 10));
      }
      if (m.type === 'chicken') { a.peck = a.peck > 0 ? a.peck - dt * 3 : (Math.random() < dt * 0.2 && a.amt < 0.1 ? 1 : 0); }
      m.pvy = vy;
      if (m.hurtT > 0) m.hurtT -= dt;
      if (m.showHp > 0) m.showHp -= dt;
      m.idleT -= dt;
      if (m.idleT <= 0) { m.idleT = 6 + Math.random() * 12; if (m.type !== 'bandit') this.audio.mob(m.type, 'idle', [m.x, m.y + m.h, m.z]); }
      if (m.fl & 8 && Math.random() < dt * 12) this.flame(m.x + (Math.random() - 0.5) * m.w, m.y + Math.random() * m.h, m.z + (Math.random() - 0.5) * m.w);
      // pas des pillards
      if (m.type === 'bandit') {
        m.stepD = (m.stepD || 0) + Math.hypot(m.x - ox, m.z - oz);
        if (m.stepD > 1.9) { m.stepD = 0; const bid = this.world.get(Math.floor(m.x), Math.floor(m.y - 0.2), Math.floor(m.z)); if (bid > 0) this.audio.step(BLOCKS[bid].sound, [m.x, m.y, m.z], 0.3); }
      }
    }
    // objets au sol
    const P = this.player;
    for (const [id, it] of this.items) {
      it.age += dt;
      if (it.fly) {
        it.fly += dt / 0.15;
        const t = it.flyTo;
        it.x = lerp(it.x, t.x, it.fly); it.y = lerp(it.y, t.y + 1, it.fly); it.z = lerp(it.z, t.z, it.fly);
        if (it.fly >= 1) this.items.delete(id);
        continue;
      }
      if (it.delay > 0) it.delay -= dt;
      if (this.world.loaded(it.x, it.z)) {
        it.vy -= 22 * dt; it.vy = Math.max(it.vy, -30);
        const inW = this.world.get(Math.floor(it.x), Math.floor(it.y + 0.1), Math.floor(it.z)) === B.WATER;
        if (inW) { it.vy = Math.min(it.vy + 30 * dt, 1.2); }
        if (boxHitsSolid(this.world, it.x, it.y, it.z, it.w, it.h)) it.y += dt * 4;
        const r = moveEntity(this.world, it, dt);
        if (r.ground) { it.vx *= Math.pow(0.02, dt); it.vz *= Math.pow(0.02, dt); }
      }
      if (P.alive && it.delay <= 0 && this.state === 'play') {
        const d = Math.hypot(it.x - P.x, it.y - (P.y + 0.7), it.z - P.z);
        if (d < 1.7 && performance.now() - it.req > 1500 && this.inv.canAdd(it.item)) { it.req = performance.now(); this.send({ t: 'pickup', id }); }
      }
    }
  }

  // ------------------------------------------------------------ environnement (ciel, lumière)
  environment() {
    const ang = this.time * Math.PI * 2, s = Math.sin(ang);
    const day = clamp(s * 2 + 0.6, 0.16, 1);
    const dayF = clamp((s + 0.15) * 2.4, 0, 1);
    const glowK = Math.max(0, 1 - Math.abs(s) * 3.5);
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    // ciel voilé de poussière (ambiance post-apocalyptique)
    const zenith = mix([0.02, 0.024, 0.035], [0.44, 0.5, 0.55], dayF);
    let horizon = mix([0.05, 0.05, 0.06], [0.76, 0.7, 0.58], dayF);
    const glow = [1.0 * glowK * 0.9, 0.42 * glowK * 0.9, 0.16 * glowK * 0.9];
    horizon = [horizon[0] + glow[0] * 0.28, horizon[1] + glow[1] * 0.22, horizon[2] + glow[2] * 0.1];
    const sl = Math.hypot(Math.cos(ang), s, 0.25);
    const sunDir = [Math.cos(ang) / sl, s / sl, 0.25 / sl];
    const tint = mix([0.45, 0.5, 0.72], [1, 0.95, 0.86], dayF);
    const skyTint = [tint[0] * day, tint[1] * day, tint[2] * day];
    const P = this.player, playing = this.state === 'play', under = playing && P.headUnder;
    const far = Math.max(40, this.world.radius * 16 - 8);
    const heldId = this.inv.heldId();
    let hand = [0, 0, 0, 0];
    if (playing && (heldId === B.TORCH || heldId === B.LANTERN)) hand = [0, -0.2, 0, heldId === B.LANTERN ? 12 : 10];
    if (playing && this.weapons.flashlight()) {
      const cp = Math.cos(P.pitch), f = [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp];
      hand = [f[0] * 5, f[1] * 5, f[2] * 5, 10];
    }
    if (playing && this.muzzleLight > 0) hand = [0, 0, 0, 9];
    return {
      t: this.t, day: dayF, sunDir, zenith, horizon, glow, skyTint,
      fogColor: under ? [0.05 * day + 0.02, 0.16 * day + 0.03, 0.34 * day + 0.06] : horizon,
      fogNear: under ? 1 : far * 0.42, fogFar: under ? 18 : far,
      under, hand,
      flicker: 0.93 + Math.sin(this.t * 9.1) * 0.035 + Math.sin(this.t * 23.7) * 0.025,
    };
  }

  // ------------------------------------------------------------ boucle
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.time = (this.time + dt / DAY_LENGTH) % 1;
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 1) { this.fps = this.frames; this.frames = 0; this.fpsT = 0; }
    if (!this.world) { this.r.resize(); const gl = this.r.gl; gl.clearColor(0.1, 0.12, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    try { this.tick(dt); } catch (e) { console.error(e); }
  }

  tick(dt) {
    const P = this.player, w = this.world;
    if (this.state === 'menu' || this.state === 'boot' || this.state === 'hideout' || this.state === 'end' || this.state === 'dead-link') {
      w.update(this.spawn.x, this.spawn.z, 8);
      if (this.state === 'hideout') {
        this.refreshPanels();
        this.hoT -= dt;
        if (this.hoT <= 0) { this.hoT = 0.6; this.syncHideout(false); this.renderHideoutHead(); }
      }
      this.renderScene(dt, true);
      return;
    }
    if (this.state === 'loading') {
      w.update(P.x, P.z, 14);
      const r = w.readyAround(P.x, P.z, 2);
      $('load-bar').style.width = Math.round(r * 100) + '%';
      if (r >= 1) {
        let guard = 0;
        while (boxHitsSolid(w, P.x, P.y, P.z, P.w, P.h) && guard++ < 60) P.y += 1;
        this.state = 'play';
        show('loading', false);
        show('hud');
        this.exT = 0;
        if (this.player.hp <= 0) this.onDeath('est mort.');
        else this.ui.toast('Trouvez une zone d\'extraction (boussole, carte : M)', 4000);
      }
      this.renderScene(dt, false);
      return;
    }
    if (this.state !== 'play') { this.renderScene(dt, false); return; }

    w.update(P.x, P.z, this.touch ? 3 : 5);
    if (this.touch) this.touch.update(this.lastPrompt);
    P.update(dt, this.inp);
    this.updateTarget();
    this.actions(dt);
    if (this.swing > 0) { this.swing += dt / 0.3; if (this.swing >= 1) this.swing = 0; }
    this.equip = Math.min(1, this.equip + dt * 5);
    this.muzzleLight = Math.max(0, this.muzzleLight - dt);
    this.updateEntities(dt);
    this.updateParticles(dt);
    this.audio.listener = { x: P.x, y: P.y + EYE, z: P.z, yaw: P.yaw };
    this.audio.update(dt, clamp(Math.sin(this.time * Math.PI * 2) * 2 + 0.5, 0, 1));
    if (this.state !== 'play') return; // mort ou extraction pendant cette image
    this.raidLogic(dt);

    // réseau : position (20 Hz), inventaire (1 s après changement), état
    this.posT -= dt;
    if (this.posT <= 0) {
      this.posT = 0.05;
      const s = `${P.x.toFixed(2)},${P.y.toFixed(2)},${P.z.toFixed(2)},${P.yaw.toFixed(2)},${P.pitch.toFixed(2)},${this.inv.heldId()}`;
      if (s !== this.lastSentPos) { this.lastSentPos = s; this.send({ t: 'pos', x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, held: this.inv.heldId() }); }
    }
    const syncInv = () => this.send({ t: 'inv', inv: this.inv.toJSON(), hp: P.hp, hunger: P.hunger, raidT: this.raidT });
    if (this.inv.version !== this.invSentVersion) { this.invT += dt; if (this.invT > 1) { this.invT = 0; this.invSentVersion = this.inv.version; syncInv(); } }
    this.statT += dt;
    if (this.statT > 10) { this.statT = 0; if (P.alive) syncInv(); }
    if (this.uiOpen === 'inv') { this.stationT -= dt; if (this.stationT <= 0) { this.stationT = 0.5; if (this.updateStations()) this.refreshPanels(true); } this.refreshPanels(); }

    this.ui.renderHotbar(this.inv);
    this.ui.renderBars(P.hp, P.hunger);
    this.hud(dt);
    $('water-tint').style.display = P.headUnder ? 'block' : 'none';
    this.renderScene(dt, false);
  }

  // Chrono, zones d'extraction, boussole
  raidLogic(dt) {
    const P = this.player;
    this.raidT = Math.max(0, this.raidT - dt);
    this.exT -= dt;
    if (this.exT <= 0) {
      this.exT = 0.5;
      this.exList = this.world.gen.extractionsNear(P.x, P.z, 900);
      this.exList.sort((a, b) => Math.hypot(a.cx - P.x, a.cz - P.z) - Math.hypot(b.cx - P.x, b.cz - P.z));
    }
    this.townT = (this.townT || 0) - dt;
    if (this.townT <= 0) {
      this.townT = 0.5;
      const t = this.world.gen.nearTown(P.x, P.z, 0);
      if (t !== this.curTown) { if (t) this.ui.toast(`${t.name} — ville en ruine`, 3000); this.curTown = t; }
    }
    const inZone = P.alive && this.exList.find((e) => Math.hypot(e.cx - P.x, e.cz - P.z) < 5.8 && Math.abs(P.y - (e.y + 1)) < 3);
    if (inZone) {
      const before = Math.ceil(EXTRACT_TIME - this.extractT);
      this.extractT += dt;
      const left = Math.max(0, EXTRACT_TIME - this.extractT);
      if (Math.ceil(left) !== before) this.audio.extractTick(EXTRACT_TIME - Math.ceil(left));
      this.ui.extract({ text: this.extractSent ? 'Extraction…' : `Extraction dans ${left.toFixed(1).replace('.', ',')} s`, p: Math.min(1, this.extractT / EXTRACT_TIME) });
      if (this.extractT >= EXTRACT_TIME && !this.extractSent) {
        this.extractSent = true;
        const left2 = this.inv.stowCursor(); if (left2) this.dropItem(left2, false);
        this.send({ t: 'extract', inv: this.inv.toJSON(), hp: P.hp });
      }
    } else { this.extractT = 0; this.extractSent = false; this.ui.extract(null); }
  }

  hud() {
    const P = this.player, W = this.weapons;
    this.ui.timer(this.raidT, this.inRaid);
    this.ui.compass(P.yaw, P.x, P.z, this.exList.slice(0, 5).map((e) => { const d = Math.hypot(e.cx - P.x, e.cz - P.z); return { x: e.cx, z: e.cz, label: `${Math.round(d)} m`, near: d < 40 }; }));
    const s = W.gun();
    if (s) {
      const { st } = W.info(s);
      const reserve = Object.keys(AMMO).map(Number).filter((k) => AMMO[k].cal === st.cal).reduce((a, k) => a + this.inv.count(k), 0);
      const mode = MODE_NAMES[st.modes[s.fm || 0]];
      const info = W.reloadT > 0 ? 'Rechargement…' : `${mode} · ${s.at ? AMMO[s.at].name : CAL_NAME[st.cal]} · réserve ${reserve}`;
      this.ui.ammo(true, s.a | 0, st.mag, info, (s.a | 0) === 0);
      const scoped = W.scoped();
      this.ui.scope(scoped);
      this.ui.dot(!scoped && st.dot && W.ads > 0.8);
      if (W.ads > 0.5 || P.sprinting) this.ui.crosshair('hidden');
      else {
        const fov = this.S.fov * this.fovMul * Math.PI / 180;
        this.ui.crosshair('gun', 4 + Math.tan(W.spread(st)) / Math.tan(fov / 2) * innerHeight / 2);
      }
    } else {
      this.ui.ammo(false); this.ui.scope(false); this.ui.dot(false);
      this.ui.crosshair('tool');
    }
    this.ui.hitmarker(W.hitT, W.hitHead);
    // états
    const st = [];
    if (P.bleed) st.push({ text: 'Hémorragie', cls: 'bad' });
    if (P.stimT > 0) st.push({ text: `Stimulant ${Math.ceil(P.stimT)} s`, cls: 'good' });
    if (P.hunger <= 4) st.push({ text: 'Affamé', cls: 'bad' });
    for (const [slot, name] of [[EQ_HELMET, 'Casque'], [EQ_VEST, 'Gilet']]) {
      const a = this.inv.slots[slot];
      if (a) { const def = ITEMS[a.id].armor; const left = Math.max(0, def.dur - (a.d || 0)); st.push({ text: `${name} cl.${def.cls} · ${Math.round(left / def.dur * 100)} %`, cls: left <= 0 ? 'bad' : '' }); }
    }
    if (P.crouch) st.push({ text: 'Accroupi' });
    this.ui.status(st);
    // invite d'interaction
    const T = this.target;
    let pr = null;
    if (T && T.bag) pr = `<b>F</b> Fouiller : ${T.bag.name}`;
    else if (T && T.block && CONTAINER[T.block.id]) pr = `<b>F</b> Fouiller : ${BLOCKS[T.block.id].name}`;
    this.lastPrompt = this.uiOpen ? null : pr;
    this.ui.prompt(this.touch && pr ? pr.replace('<b>F</b> ', '') : this.lastPrompt);
  }

  // ------------------------------------------------------------ rendu
  renderScene(dt, menu) {
    const r = this.r, gl = r.gl, P = this.player;
    r.resize();
    const env = this.environment();
    let eye, yaw, pitch, roll = 0;
    if (menu) {
      const a = this.t * 0.035;
      yaw = a; pitch = -0.12;
      const h = this.world.gen.column(Math.floor(this.spawn.x), Math.floor(this.spawn.z)) & 255;
      eye = [this.spawn.x, Math.max(h, 38) + 14, this.spawn.z];
    } else {
      yaw = P.yaw; pitch = P.pitch;
      eye = [P.x, P.y + P.eyeH, P.z];
      const bobK = 1 - this.weapons.ads * 0.8;
      if (this.S.bob && this.view === 0 && P.onGround) { eye[1] += -Math.abs(Math.cos(P.walkPhase)) * 0.055 * P.walkAmt * bobK; roll = Math.sin(P.walkPhase) * 0.006 * P.walkAmt * bobK; }
      roll += Math.sin(P.hurtTilt * 9) * 0.05 * Math.min(1, P.hurtTilt);
      if (!P.alive) { roll = 0.4; eye[1] = P.y + 0.3; }
      if (this.view > 0) {
        const cp = Math.cos(pitch), f = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
        const dir = this.view === 1 ? -1 : 1;
        let d = 4;
        for (let s = 0.2; s <= 4; s += 0.1) { if (this.world.solid(Math.floor(eye[0] + f[0] * s * dir), Math.floor(eye[1] + f[1] * s * dir), Math.floor(eye[2] + f[2] * s * dir))) { d = s - 0.3; break; } }
        eye = [eye[0] + f[0] * d * dir, eye[1] + f[1] * d * dir, eye[2] + f[2] * d * dir];
        if (this.view === 2) { yaw += Math.PI; pitch = -pitch; }
      }
    }
    const fovTarget = this.state === 'play' && P.sprinting ? 1.12 : 1;
    this.fovBase = lerp(this.fovBase || 1, fovTarget, Math.min(1, dt * 8));
    this.fovMul = this.fovBase / (this.state === 'play' && this.view === 0 ? this.weapons.zoom() : 1);
    r.setCamera(eye, yaw, pitch, env, { roll, fovMul: this.fovMul });
    gl.clearColor(env.fogColor[0], env.fogColor[1], env.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    r.drawSky();
    r.drawWorld();
    this.drawEntities(menu);
    r.drawWater();
    if (!menu && this.state === 'play') {
      const T = this.target;
      if (T && T.block && P.alive && !this.uiOpen && !this.weapons.gun()) {
        const b = T.block, bd = BLOCKS[b.id];
        if (bd.render === 'cross') r.outline(b.x + 0.15, b.y, b.z + 0.15, b.x + 0.85, b.y + 0.9, b.z + 0.85);
        else if (bd.render === 'torch') r.outline(b.x + 0.4, b.y, b.z + 0.4, b.x + 0.6, b.y + 0.65, b.z + 0.6);
        else r.outline(b.x, b.y, b.z, b.x + 1, b.y + 1, b.z + 1);
      }
      if (T && T.bag && !this.uiOpen) { const b = T.bag; r.outline(b.x - 0.4, b.y, b.z - 0.3, b.x + 0.4, b.y + 0.4, b.z + 0.3); }
      if (this.view === 0 && P.alive) this.drawHand();
      this.updateLabels();
      if (!$('debug').classList.contains('hidden')) this.debugText();
    }
  }

  lightAt(x, y, z, flash = 0) {
    const [sky, blk] = this.world.light(x, y, z);
    return { sky, blk, flash, glow: { sky: 1, blk: 1, flash } };
  }

  gunGeom(s) {
    const k = s.id + JSON.stringify(s.m || {});
    let g = this.geomCache.get(k);
    if (!g) { g = gunGeometry(s); this.geomCache.set(k, g); }
    return g;
  }
  // Arme tenue à deux mains, fixée à l'avant-bras droit
  drawGunThird(mats, s, L, low) {
    if (!s || !GUNS[s.id]) return;
    const gg = this.gunGeom(s);
    const m = mat4.copy(mat4.create(), mats[MODELS.player.index.rarm]);
    mat4.translate(m, -1, -10, 0);
    mat4.rotY(m, Math.PI);
    mat4.rotX(m, -Math.PI / 2);
    if (low) mat4.rotX(m, 0.55); // arme baissée : canon remonté vers l'horizontale
    mat4.translate(m, -gg.hold[0], -gg.hold[1], -gg.hold[2]);
    drawGun(this.r.batch, m, s, L, false, this.A.tile, gg);
  }

  drawEntities(menu) {
    const r = this.r, bt = r.batch, P = this.player;
    const cam = r.cam, maxD2 = (this.world.radius * 16) ** 2;
    const near = (x, z) => (x - cam[0]) ** 2 + (z - cam[2]) ** 2 < maxD2;
    const GLOW = { sky: 1, blk: 1, flash: 0 };
    let le = null;
    if (!menu) {
      for (const m of this.mobs.values()) {
        if (!near(m.x, m.z)) continue;
        const flash = m.hurtT > 0 || m.dead ? 1 : 0;
        const L = this.lightAt(m.x, m.y + m.h * 0.6, m.z, flash);
        if (m.fl & 8) L.blk = Math.max(L.blk, 0.9);
        const s = m.anim; s.dead = m.dead;
        if (m.type === 'bandit') {
          const mats = drawModel(bt, 'bandit', r.skins['bandit' + (m.variant || 0)], s, m.x, m.y, m.z, m.yaw, L);
          if (!m.dead) this.drawGunThird(mats, m.gunItem, L, s.low);
        } else drawModel(bt, m.type, r.skins[m.type], s, m.x, m.y, m.z, m.yaw, L, m.type === 'slime' ? m.size : 1);
      }
      for (const q of this.remote.values()) {
        if (!near(q.x, q.z) || !q.alive) continue;
        const L = this.lightAt(q.x, q.y + 1.2, q.z, 0);
        q.anim.dead = 0;
        const mats = drawModel(bt, 'player', q.tex, q.anim, q.x, q.y, q.z, q.yaw + Math.PI, L);
        if (q.anim.gun) this.drawGunThird(mats, { id: q.held, m: {} }, L, q.anim.low);
        else this.drawHeldThird(mats, q.held, L);
      }
      if (this.view > 0 && P.alive && this.state === 'play') {
        const a = this.selfAnim || (this.selfAnim = { t: 0, walk: 0, amt: 0, pitch: 0, swing: 0 });
        const s = this.weapons.gun();
        a.t = this.t; a.walk = P.walkPhase; a.amt = P.walkAmt; a.pitch = P.pitch; a.swing = this.swing; a.held = this.inv.heldId(); a.dead = 0;
        a.gun = !!s; a.low = P.sprinting; a.kick = this.weapons.kick; a.reload = this.weapons.reloadT > 0 ? 1 - this.weapons.reloadT / this.weapons.reloadDur : 0;
        a.pistol = s && GUNS[s.id].cat === 'pistol';
        const tex = this.myTex || (this.myTex = r.texture2D(playerSkin(this.myName)));
        const L = this.lightAt(P.x, P.y + 1.2, P.z, P.invuln > 0.25 ? 1 : 0);
        const mats = drawModel(bt, 'player', tex, a, P.x, P.y, P.z, P.yaw + Math.PI, L);
        if (s) this.drawGunThird(mats, s, L, a.low); else this.drawHeldThird(mats, this.inv.heldId(), L);
      }
      // sacs et corps
      for (const b of this.bags.values()) {
        if (!near(b.x, b.z)) continue;
        const L = this.lightAt(b.x, b.y + 0.3, b.z);
        const m = mat4.create();
        mat4.translate(m, b.x, b.y, b.z);
        mat4.rotY(m, (b.id * 1.7) % 6.28);
        mat4.scale(m, 1 / 16, 1 / 16, 1 / 16);
        const t = this.A.tile.bag;
        bt.tileBox(m, -6, 0, -4, 6, 5, 4, t, L, false);
        bt.tileBox(m, -5, 5, -3, 5, 7, 3, t, L, false);
        bt.tileBox(m, -2, 0.5, 4, 2, 4, 5.5, this.A.tile.gm_olive, L, false);
      }
      // objets au sol
      for (const it of this.items.values()) {
        if (!near(it.x, it.z)) continue;
        const L = this.lightAt(it.x, it.y + 0.2, it.z);
        const m = mat4.create();
        const bob = Math.sin(it.age * 2.5) * 0.06 + 0.08;
        mat4.translate(m, it.x, it.y + bob, it.z);
        mat4.rotY(m, it.age * 1.4);
        if (GUNS[it.item.id]) {
          const gg = this.gunGeom(it.item);
          mat4.translate(m, 0, 0.15, 0);
          mat4.scale(m, 1 / 22, 1 / 22, 1 / 22);
          mat4.translate(m, 0, 0, 6);
          drawGun(bt, m, it.item, L, false, this.A.tile, gg);
        } else this.drawItem(m, it.item.id, L, false, it.item.n > 1 ? 2 : 1);
      }
      // fissures du minage
      if (this.mining && this.mining.p > 0) {
        const mi = this.mining, stage = Math.min(7, Math.floor(mi.p * 8));
        const tile = this.A.tile['crack_' + stage];
        const m = mat4.create();
        mat4.translate(m, mi.x + 0.5, mi.y - 0.004, mi.z + 0.5);
        bt.blockCube(m, [tile, tile, tile, tile, tile, tile], GLOW, true, false, 1.008);
      }
      // balles traçantes
      for (const t of this.tracers) {
        const head = t.t * 420, tail = Math.max(0, head - 5);
        if (tail >= t.d) continue;
        const a = Math.min(head, t.d) / t.d, b = tail / t.d;
        const lp = (k) => [t.p0[0] + (t.p1[0] - t.p0[0]) * k, t.p0[1] + (t.p1[1] - t.p0[1]) * k, t.p0[2] + (t.p1[2] - t.p0[2]) * k];
        bt.streak(lp(b), lp(a), 0.022, this.A.tile.fx_tracer, GLOW);
      }
      // laser
      le = this.state === 'play' ? this.weapons.laserEnd : null;
      if (le && this.view === 0 && P.alive) {
        const f = this.target.dir, rgt = [Math.cos(P.yaw), 0, -Math.sin(P.yaw)];
        const o = [P.x + f[0] * 0.5 + rgt[0] * 0.2, P.y + P.eyeH - 0.18 + f[1] * 0.5, P.z + f[2] * 0.5 + rgt[2] * 0.2];
        bt.streak(o, le, 0.004, this.A.tile.gm_red, GLOW);
      }
    }
    // particules
    const yaw = this.view === 2 ? P.yaw + Math.PI : P.yaw, pitch = this.view === 2 ? -P.pitch : P.pitch;
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const up = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
    if (!menu) for (const p of this.particles) {
      const L = p.glow ? GLOW : this.lightAt(p.x, p.y, p.z);
      const size = p.shrink ? p.size * (0.4 + 0.6 * p.life / p.max) : p.size;
      bt.billboard(p.x, p.y, p.z, size, p.u0, p.v0, p.u1, p.v1, L, right, up, p.trans);
    }
    if (le && this.view === 0) { const t = this.A.tile.gm_red; bt.billboard(le[0], le[1], le[2], 0.07, t[0] + 2, t[1] + 2, t[0] + 14, t[1] + 14, GLOW, right, up); }
    bt.flush(false);
  }

  // Dessine un objet (bloc = cube, sinon sprite extrudé) avec la matrice m ; base au sol
  drawItem(m, id, L, full, count = 1, size = 0.25) {
    const bt = this.r.batch;
    const b = BLOCKS[id], isCube = ITEMS[id].block && b.render !== 'cross' && b.render !== 'torch';
    for (let c = 0; c < count; c++) {
      const mm = mat4.copy(mat4.create(), m);
      if (c) mat4.translate(mm, 0.08, 0.06, 0.08);
      if (isCube) {
        const t = b.tex, tl = this.A.tile;
        bt.blockCube(mm, [tl[t.top], tl[t.bottom], tl[t.front], tl[t.front], tl[t.side], tl[t.side]], L, false, full, size);
      } else {
        mat4.scale(mm, 0.45, 0.45, 0.45);
        bt.sprite(mm, this.spriteQuads(id), this.A.tile[this.A.spriteTile[id]], L, full);
      }
    }
  }
  spriteQuads(id) {
    let q = this.spriteCache.get(id);
    if (!q) { q = extrudeIcon(this.A.flatAlpha[id]); this.spriteCache.set(id, q); }
    return q;
  }

  drawHeldThird(mats, heldId, L) {
    if (!heldId || !ITEMS[heldId]) return;
    const arm = mats[MODELS.player.index.rarm];
    const m = mat4.copy(mat4.create(), arm);
    const b = BLOCKS[heldId], isCube = ITEMS[heldId].block && b.render !== 'cross' && b.render !== 'torch';
    if (isCube) {
      mat4.translate(m, -1, -12.5, 0);
      mat4.scale(m, 16, 16, 16);
      const t = b.tex, tl = this.A.tile;
      this.r.batch.blockCube(m, [tl[t.top], tl[t.bottom], tl[t.front], tl[t.front], tl[t.side], tl[t.side]], L, false, false, 0.3);
    } else {
      mat4.translate(m, -1, -10, 0);
      mat4.scale(m, 10, 10, 10);
      mat4.rotX(m, Math.PI / 2);
      mat4.rotY(m, Math.PI / 2);
      mat4.translate(m, 0.36, -0.14, 0);
      this.r.batch.sprite(m, this.spriteQuads(heldId), this.A.tile[this.A.spriteTile[heldId]], L, false);
    }
  }

  // Bras / objet en vue à la première personne
  drawHand() {
    const r = this.r, gl = r.gl, bt = r.batch, P = this.player;
    const aspect = r.canvas.width / r.canvas.height;
    r.handVP = mat4.perspective(r.handVP || mat4.create(), 70 * Math.PI / 180, aspect, 0.02, 10);
    const L = this.lightAt(P.x, P.y + EYE, P.z, P.invuln > 0.3 ? 0.6 : 0);
    if (this.weapons.flashlight()) L.blk = Math.max(L.blk, 0.7);
    if (this.muzzleLight > 0) L.blk = 1;
    const held = this.inv.held();
    const tex = this.myTex || (this.myTex = r.texture2D(playerSkin(this.myName)));
    const bobX = this.S.bob ? Math.sin(P.walkPhase) * 0.025 * P.walkAmt : 0;
    const bobY = this.S.bob ? -Math.abs(Math.cos(P.walkPhase)) * 0.03 * P.walkAmt : 0;
    if (held && GUNS[held.id]) {
      this.weapons.drawFP(L, [bobX, bobY]);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      bt.flush(true);
      return;
    }
    const sw = this.swing, k = sw > 0 ? Math.sin(sw * Math.PI) : 0, ks = sw > 0 ? Math.sin(Math.sqrt(sw) * Math.PI) : 0;
    const eq = (1 - this.equip) * 0.6;
    const med = held && ITEMS[held.id].med;
    const eat = this.eating > 0 ? Math.min(1, this.eating * 4) : 0;
    const m = mat4.create();
    if (!held) {
      mat4.translate(m, 0.62 + bobX - ks * 0.3, -0.72 + bobY - eq + Math.sin(sw * Math.PI * 2) * 0.12, -0.35 - k * 0.25);
      mat4.rotY(m, 0.25 + ks * 0.5);
      mat4.rotX(m, 1.8 - ks * 0.5);
      mat4.rotZ(m, -0.1);
      mat4.scale(m, 1 / 16, 1 / 16, 1 / 16);
      const part = MODELS.player.parts[MODELS.player.index.rarm];
      bt.box(m, part.box[0], part.box[1], part.box[2], part.box[3], part.box[4], part.box[5], part.uv[0], part.uv[1], 64, 64, L, false, tex, true);
    } else {
      const id = held.id, b = BLOCKS[id], isCube = ITEMS[id].block && b.render !== 'cross' && b.render !== 'torch';
      const lift = med ? eat * 0.25 : eat * (0.12 + Math.sin(this.t * 22) * 0.03);
      mat4.translate(m, 0.56 + bobX - ks * 0.35 - eat * 0.3, -0.56 + bobY - eq + Math.sin(sw * Math.PI * 2) * 0.1 + lift, -0.82 - k * 0.2);
      mat4.rotX(m, -ks * 0.6);
      if (isCube) {
        mat4.rotY(m, 0.78 + ks * 0.3);
        mat4.rotX(m, 0.08);
        this.drawItem(m, id, L, true, 1, 0.42);
      } else {
        mat4.rotY(m, Math.PI - 0.5 + ks * 0.4);
        mat4.rotZ(m, 0.2);
        mat4.scale(m, 0.95, 0.95, 0.95);
        mat4.translate(m, 0.05, -0.2, 0);
        bt.sprite(m, this.spriteQuads(id), this.A.tile[this.A.spriteTile[id]], L, true);
      }
    }
    gl.clear(gl.DEPTH_BUFFER_BIT);
    bt.flush(true);
  }

  updateLabels() {
    const items = [];
    const P = this.player;
    for (const q of this.remote.values()) if (q.alive) items.push({ key: 'p' + q.id, text: q.name, x: q.x, y: q.y + 2.05, z: q.z });
    for (const m of this.mobs.values()) if (m.showHp > 0 && !m.dead) items.push({ key: 'm' + m.id, x: m.x, y: m.y + m.h + 0.35, z: m.z, hp: m.hp, max: m.maxHp });
    for (const b of this.bags.values()) if (Math.hypot(b.x - P.x, b.z - P.z) < 9) items.push({ key: 'b' + b.id, text: b.name, x: b.x, y: b.y + 0.9, z: b.z });
    this.ui.labelsUpdate(this.r.vpWorld, items);
  }

  debugText() {
    const P = this.player, w = this.world;
    const dirs = ['Nord (-Z)', 'Ouest (-X)', 'Sud (+Z)', 'Est (+X)'];
    const yawN = ((P.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const dir = dirs[Math.round(yawN / (Math.PI / 2)) % 4];
    const hours = (this.time * 24 + 6) % 24;
    const [sky, blk] = w.light(P.x, P.y + 0.5, P.z);
    const T = this.target;
    const tb = T && T.block ? `${BLOCKS[T.block.id].name} (${T.block.x}, ${T.block.y}, ${T.block.z})` : T && T.ent ? (T.ent.kind === 'mob' ? MOBS[T.ent.e.type].name : T.ent.e.name) : '—';
    $('debug').textContent =
`Glaise   ${this.fps} i/s
XYZ      ${P.x.toFixed(2)} / ${P.y.toFixed(2)} / ${P.z.toFixed(2)}
Tronçon  ${Math.floor(P.x) >> 4}, ${Math.floor(P.z) >> 4}   biome ${w.biome(P.x, P.z)}
Regard   ${dir}  (${(P.pitch * 57.3).toFixed(0)}°)
Heure    ${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}
Lumière  ciel ${sky.toFixed(2)}  torche ${blk.toFixed(2)}
Cible    ${tb}
Tronçons ${w.chunks.size} chargés, ${this.r.stats.drawn} dessinés, ${this.r.stats.quads} faces
Maillage ${(w.stats.meshMs || 0).toFixed(1)} ms   graine ${this.seed}
Entités  ${this.mobs.size} créatures, ${this.items.size} objets, ${this.bags.size} sacs, ${this.remote.size} joueurs, ${this.particles.length} particules`;
  }
}

const game = new Game();
window.glaise = game;
game.boot();
