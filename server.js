// Glaise — serveur de jeu multijoueur.
// Aucune dépendance : HTTP statique + WebSocket (RFC 6455) écrits à la main.
// Écoute sur "::" (IPv6, double pile : accepte aussi l'IPv4 sur la plupart des systèmes).
//
//   node server.js [port]
//
// Compilé en exécutable autonome (Glaise.exe, voir build/sea.mjs), les fichiers du jeu
// sont embarqués dans l'exécutable et la sauvegarde est écrite à côté de lui.
//
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { exec, spawn as spawnProcess } from 'node:child_process';

import { WorldGen, bidx } from './public/js/shared/worldgen.js';
import { B, BLOCKS, ITEMS, CHUNK, HEIGHT, SEA, SOLID, LIGHT_BLOCK, CONTAINER, blockDrops, maxStack } from './public/js/shared/blocks.js';
import { MOBS, MOB_TYPES, mobDims, rollDrops } from './public/js/shared/mobs.js';
import {
  GUNS, AMMO, cleanItem, plain, gunStats, makeGun, rollLoot, pickBanditGun, freeKit, starterStash, RAID_TIME, START_MONEY,
} from './public/js/shared/guns.js';
import { moveEntity } from './public/js/shared/physics.js';
import { mulberry32 } from './public/js/shared/noise.js';

// Exécutable autonome (Node SEA) ? `require` n'existe que dans la version compilée (CommonJS).
const sea = (() => { try { return typeof require === 'function' ? require('node:sea') : null; } catch { return null; } })();
const IN_SEA = !!(sea && sea.isSea && sea.isSea());
const ROOT = IN_SEA ? path.dirname(process.execPath) : path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const SAVE_FILE = path.join(ROOT, 'monde.json');
const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '::';
const DAY_LENGTH = 720; // secondes pour un cycle jour/nuit complet
const PVP = process.env.PVP !== '0';

// ------------------------------------------------------------------ Sauvegarde
let save = { seed: process.env.SEED ? (parseInt(process.env.SEED, 10) | 0) : (Math.random() * 2 ** 31) | 0, time: 0.02, edits: {}, players: {}, containers: {}, bags: [] };
try {
  if (fs.existsSync(SAVE_FILE)) {
    save = Object.assign(save, JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')));
    console.log(`Monde chargé (graine ${save.seed}, ${Object.keys(save.edits).length} tronçons modifiés).`);
  } else console.log(`Nouveau monde, graine ${save.seed}.`);
} catch (e) { console.error('Sauvegarde illisible, nouveau monde :', e.message); }

let dirty = false;
function writeSave() {
  save.time = time;
  for (const p of players.values()) storePlayer(p);
  save.bags = [...bags.values()].map((b) => ({ x: b.x, y: b.y, z: b.z, items: b.items, name: b.name, born: b.born }));
  try {
    fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(save));
    fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE);
    dirty = false;
  } catch (e) { console.error('Échec de la sauvegarde :', e.message); }
}

// ------------------------------------------------------------------ Monde serveur
const gen = new WorldGen(save.seed);
const rnd = Math.random;
class ServerWorld {
  constructor() { this.cache = new Map(); }
  chunk(cx, cz) {
    const k = cx + ',' + cz;
    let c = this.cache.get(k);
    if (c) return c;
    c = gen.generate(cx, cz);
    const e = save.edits[k];
    if (e) for (const idx in e) c[idx] = e[idx];
    this.cache.set(k, c);
    if (this.cache.size > 900) { const first = this.cache.keys().next().value; this.cache.delete(first); }
    return c;
  }
  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    return this.chunk(x >> 4, z >> 4)[bidx(x & 15, y, z & 15)];
  }
  set(x, y, z, id) {
    if (y < 0 || y >= HEIGHT) return;
    const cx = x >> 4, cz = z >> 4, k = cx + ',' + cz, i = bidx(x & 15, y, z & 15);
    this.chunk(cx, cz)[i] = id;
    (save.edits[k] || (save.edits[k] = {}))[i] = id;
    dirty = true;
  }
  solid(x, y, z) { return SOLID[this.get(x, y, z)] === 1; }
  // Y du plus haut bloc « sol » (hors air/plantes), -1 si feuilles ou eau
  surface(x, z) {
    for (let y = HEIGHT - 1; y > 0; y--) {
      const id = this.get(x, y, z);
      if (id === B.AIR || BLOCKS[id].render === 'cross' || id === B.TORCH) continue;
      if (id === B.WATER || BLOCKS[id].render === 'leaves') return -1;
      return y;
    }
    return -1;
  }
  skyExposed(x, y, z) {
    for (let yy = y; yy < HEIGHT; yy++) if (LIGHT_BLOCK[this.get(x, yy, z)]) return false;
    return true;
  }
}
const world = new ServerWorld();

function findSpawn() {
  for (let r = 0; r < 2000; r += 6) {
    for (let a = 0; a < 16; a++) {
      const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
      const c = gen.column(x, z), h = c & 255, biome = c >> 8;
      if (h <= SEA + 1 || biome === 0 || biome === 1 || biome === 6) continue;
      const y = world.surface(x, z);
      if (y > SEA) return { x: x + 0.5, y: y + 1, z: z + 0.5 };
    }
  }
  return { x: 0.5, y: HEIGHT - 5, z: 0.5 };
}
const spawn = save.spawn || (save.spawn = findSpawn());
console.log(`Point d'apparition : ${spawn.x.toFixed(0)} ${spawn.y} ${spawn.z.toFixed(0)}`);

// ------------------------------------------------------------------ WebSocket minimal
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class WSConn {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.frags = []; this.closed = false;
    this.onmessage = null; this.onclose = null;
    socket.on('data', (d) => { this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d; while (this.parse()); });
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }
  parse() {
    const b = this.buf;
    if (b.length < 2) return false;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return false; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) {
      if (b.length < 10) return false;
      if (b.readUInt32BE(2) !== 0) { this.close(); return false; }
      len = b.readUInt32BE(6); off = 10;
    }
    if (len > 2 * 1024 * 1024) { this.close(); return false; }
    const ml = masked ? 4 : 0;
    if (b.length < off + ml + len) return false;
    let payload = Buffer.from(b.subarray(off + ml, off + ml + len));
    if (masked) { const m0 = b[off], m1 = b[off + 1], m2 = b[off + 2], m3 = b[off + 3]; const mk = [m0, m1, m2, m3]; for (let i = 0; i < payload.length; i++) payload[i] ^= mk[i & 3]; }
    this.buf = b.subarray(off + ml + len);
    if (op === 8) { this.close(); return false; }
    if (op === 9) { this.raw(10, payload); return true; }
    if (op === 10) return true;
    this.frags.push(payload);
    if (fin) {
      const msg = this.frags.length === 1 ? this.frags[0] : Buffer.concat(this.frags);
      this.frags = [];
      if (this.onmessage) { try { this.onmessage(msg.toString('utf8')); } catch (e) { console.error('Erreur message :', e); } }
    }
    return true;
  }
  raw(op, data) {
    if (this.closed || this.socket.destroyed) return;
    const len = data.length;
    let h;
    if (len < 126) { h = Buffer.alloc(2); h[1] = len; }
    else if (len < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(len, 6); }
    h[0] = 0x80 | op;
    this.socket.write(Buffer.concat([h, data]));
  }
  send(obj) { this.raw(1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8')); }
  get congested() { return this.socket.writableLength > 512 * 1024; }
  close() { if (this.closed) return; try { this.raw(8, Buffer.alloc(0)); this.socket.end(); } catch { /* ignore */ } this.finish(); }
  finish() { if (this.closed) return; this.closed = true; try { this.socket.destroy(); } catch { /* ignore */ } if (this.onclose) this.onclose(); }
}

// ------------------------------------------------------------------ HTTP statique
const MIME = { '.webmanifest': 'application/manifest+json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
// Lecture d'un fichier du jeu : sur le disque, ou embarqué dans l'exécutable
function readPublic(p, cb) {
  if (IN_SEA) {
    let data = null;
    try { data = Buffer.from(sea.getAsset('public' + p)); } catch (e) { cb(e); return; }
    cb(null, data);
    return;
  }
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { cb(new Error('interdit')); return; }
  fs.readFile(file, cb);
}
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
  if (p === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ game: 'glaise', port: PORT, addrs: localAddresses() }));
    return;
  }
  if (p === '/') p = '/index.html';
  p = path.posix.normalize(p.replace(/\\/g, '/'));
  if (!p.startsWith('/') || p.includes('..')) { res.writeHead(403); res.end(); return; }
  readPublic(p, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  onConnection(new WSConn(socket), req.socket.remoteAddress);
});

// ------------------------------------------------------------------ État de jeu
const clients = new Set();          // toutes les connexions (menu compris)
const players = new Map();          // id -> joueur (connecté, en raid ou dans sa planque)
const mobs = new Map();
const items = new Map();
const bags = new Map();             // corps / sacs abandonnés : conteneurs mobiles
const viewers = new Map();          // clé de conteneur -> Set(ws)
const poiCooldown = new Map();      // région -> date de prochaine apparition de pillards
let nextId = 1, nextMob = 1, nextItem = 1, nextBag = 1;
let time = typeof save.time === 'number' ? save.time : 0.02;
save.containers = save.containers || {};

const isNight = () => { const s = Math.sin(time * Math.PI * 2); return s < -0.12; };
const isDay = () => Math.sin(time * Math.PI * 2) > 0.1;
const inWorld = (p) => p && p.inWorld && p.alive;

function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c !== except) c.send(s);
}
// Envoi aux joueurs présents dans le monde à moins de r blocs
function broadcastNear(msg, x, z, r, except) {
  const s = JSON.stringify(msg);
  for (const c of clients) {
    if (c === except || !c.player || !c.player.inWorld) continue;
    if (Math.hypot(c.player.x - x, c.player.z - z) <= r) c.send(s);
  }
}
const r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => typeof v === 'number' && isFinite(v);
const arr3 = (a) => (Array.isArray(a) && a.length === 3 && a.every(num) ? a : null);

function storePlayer(p) {
  if (!p.name) return;
  save.players[p.name] = {
    x: p.x, y: p.y, z: p.z, yaw: p.yaw, inv: p.inv, hp: p.hp, hunger: p.hunger,
    stash: p.stash, money: p.money, inRaid: p.inRaid, raidT: p.raidT, kitT: p.kitT, stats: p.stats,
  };
}

function sanitizeName(n) {
  n = String(n || '').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().slice(0, 16);
  return n || 'Joueur' + Math.floor(Math.random() * 1000);
}

// Sacs (corps) sauvegardés
for (const b of save.bags || []) if (b && Array.isArray(b.items)) { const id = nextBag++; bags.set(id, { ...b, id }); }

function onConnection(ws, addr) {
  clients.add(ws);
  const local = isLoopback(String(addr || ''));
  if (local) { localConns++; localSeen = true; }
  ws.player = null;
  console.log(`Connexion depuis ${addr}`);
  ws.send({
    t: 'hello', seed: save.seed, time, spawn, edits: save.edits, online: players.size,
    players: [...players.values()].filter((p) => p.inWorld).map(publicPlayer),
    items: [...items.values()].map(itemMsg),
    bags: [...bags.values()].map(bagMsg),
  });
  ws.onmessage = (txt) => {
    let m;
    try { m = JSON.parse(txt); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    handle(ws, m);
  };
  ws.onclose = () => {
    clients.delete(ws);
    if (local) { localConns--; lastLocal = Date.now(); }
    for (const set of viewers.values()) set.delete(ws);
    const p = ws.player;
    if (p) {
      storePlayer(p); dirty = true;
      players.delete(p.id);
      if (p.inWorld) broadcast({ t: 'pleave', id: p.id });
      broadcast({ t: 'chat', sys: true, text: `${p.name} a quitté la partie.` });
      console.log(`${p.name} est parti.`);
    }
  };
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), pitch: r2(p.pitch), held: p.held, alive: p.alive };
}
function itemMsg(it) {
  return { t: 'is', id: it.id, item: it.item, x: r2(it.x), y: r2(it.y), z: r2(it.z), vx: r2(it.vx), vy: r2(it.vy), vz: r2(it.vz), delay: it.delay };
}
const bagMsg = (b) => ({ id: b.id, x: r2(b.x), y: r2(b.y), z: r2(b.z), name: b.name });

function spawnItem(item, x, y, z, vx, vy, vz, delay = 0.4) {
  const c = cleanItem(item);
  if (!c) return;
  const it = { id: nextItem++, item: c, x, y, z, vx, vy, vz, delay, born: Date.now() };
  items.set(it.id, it);
  broadcast(itemMsg(it));
}

// ------------------------------------------------------------------ Conteneurs (caisses, coffres, sacs)
const CAP = { crate: 12, mil: 12, med: 8, safe: 8, storage: 27, bag: 36 };
const TITLES = { crate: 'Caisse en bois', mil: 'Caisse militaire', med: 'Armoire médicale', safe: 'Coffre-fort', storage: 'Coffre de rangement' };
const LOOT_RESPAWN = 15 * 60 * 1000;

function containerOf(key) {
  if (key.startsWith('b:')) {
    const b = bags.get(+key.slice(2));
    return b ? { items: b.items, cap: CAP.bag, kind: 'bag', title: b.name, x: b.x, y: b.y, z: b.z, bag: b } : null;
  }
  const [x, y, z] = key.split(',').map(Number);
  if (![x, y, z].every(Number.isInteger)) return null;
  const id = world.get(x, y, z), kind = BLOCKS[id] && BLOCKS[id].container;
  if (!kind) return null;
  let c = save.containers[key];
  const now = Date.now();
  const empty = !c || c.items.every((s) => !s);
  if (kind !== 'storage' && (!c || (empty && now - c.t > LOOT_RESPAWN))) {
    const loot = rollLoot(kind, Math.random).slice(0, CAP[kind]);
    c = save.containers[key] = { items: new Array(CAP[kind]).fill(null), t: now };
    // répartit le butin dans des cases au hasard
    for (const it of loot) { let k = Math.floor(Math.random() * CAP[kind]); while (c.items[k]) k = (k + 1) % CAP[kind]; c.items[k] = it; }
    dirty = true;
  }
  if (!c) c = save.containers[key] = { items: new Array(CAP[kind]).fill(null), t: now };
  if (c.items.length < CAP[kind]) c.items.length = CAP[kind];
  return { items: c.items, cap: CAP[kind], kind, title: TITLES[kind], x: x + 0.5, y, z: z + 0.5, entry: c };
}

function sendContainer(key, c, only) {
  const msg = { t: 'cont', key, kind: c.kind, cap: c.cap, title: c.title, items: c.items.map((s) => s || null) };
  const set = viewers.get(key);
  if (only) only.send(msg);
  else if (set) for (const w of set) w.send(msg);
}
function closeContainer(key) {
  const set = viewers.get(key);
  if (set) for (const w of set) w.send({ t: 'contclose', key });
  viewers.delete(key);
}
function nearContainer(p, c) { return Math.hypot(c.x - p.x, c.z - p.z) < 7 && Math.abs(c.y - p.y) < 6; }

function makeBag(x, y, z, list, name) {
  const its = list.map(cleanItem).filter(Boolean).slice(0, CAP.bag);
  if (!its.length) return null;
  const b = { id: nextBag++, x, y, z, items: its.concat(new Array(CAP.bag - its.length).fill(null)), name, born: Date.now() };
  bags.set(b.id, b);
  broadcast({ t: 'bag', b: bagMsg(b) });
  dirty = true;
  return b;
}
function removeBag(b) {
  bags.delete(b.id);
  closeContainer('b:' + b.id);
  broadcast({ t: 'bagrm', id: b.id });
  dirty = true;
}

// ------------------------------------------------------------------ Raids
function insertionPoint() {
  const others = [...players.values()].filter((q) => q.inWorld);
  for (let tries = 0; tries < 300; tries++) {
    const a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 1300;
    const x = Math.round(spawn.x + Math.cos(a) * r), z = Math.round(spawn.z + Math.sin(a) * r);
    const c = gen.column(x, z), h = c & 255, biome = c >> 8;
    if (h <= SEA + 1 || biome === 0) continue;
    const ex = gen.extractionsNear(x, z, 480);
    if (!ex.length) continue;
    const dmin = Math.min(...ex.map((e) => Math.hypot(e.cx - x, e.cz - z)));
    if (dmin < 150) continue;
    if (gen.structuresNear(x, z, 28).length || gen.nearTown(x, z, 12)) continue;
    if (others.some((q) => Math.hypot(q.x - x, q.z - z) < 70)) continue;
    const y = world.surface(x, z);
    if (y <= SEA) continue;
    return { x: x + 0.5, y: y + 1, z: z + 0.5 };
  }
  return { x: spawn.x, y: spawn.y, z: spawn.z };
}

function leaveWorld(p) {
  if (!p.inWorld) return;
  p.inWorld = false;
  broadcast({ t: 'pleave', id: p.id });
  for (const set of viewers.values()) set.delete(p.ws);
}

function newStats() { return { raids: 0, extracts: 0, deaths: 0, kills: 0, bandits: 0 }; }

// ------------------------------------------------------------------ Messages
function handle(ws, m) {
  const p = ws.player;
  if (m.t === 'join') {
    if (p) return;
    let name = sanitizeName(m.name);
    const taken = new Set([...players.values()].map((q) => q.name.toLowerCase()));
    if (taken.has(name.toLowerCase())) { let i = 2; while (taken.has((name + i).toLowerCase())) i++; name = name + i; }
    const saved = save.players[name];
    const np = {
      id: nextId++, ws, name, x: spawn.x, y: spawn.y, z: spawn.z, yaw: 0, pitch: 0, held: 0, alive: true,
      inv: null, hp: 20, hunger: 20, stash: starterStash(), money: START_MONEY, inRaid: false, inWorld: false,
      raidT: 0, kitT: 0, stats: newStats(), lastShot: 0,
    };
    if (saved) {
      Object.assign(np, {
        x: saved.x, y: saved.y, z: saved.z, yaw: saved.yaw || 0, inv: saved.inv, hp: saved.hp ?? 20, hunger: saved.hunger ?? 20,
        stash: Array.isArray(saved.stash) ? saved.stash : np.stash, money: num(saved.money) ? saved.money : START_MONEY,
        inRaid: !!saved.inRaid, raidT: saved.raidT || 0, kitT: saved.kitT || 0, stats: Object.assign(newStats(), saved.stats || {}),
      });
    }
    if (np.inRaid && np.raidT <= 0) { np.inRaid = false; np.inv = null; }
    np.inWorld = np.inRaid;
    ws.player = np;
    players.set(np.id, np);
    ws.send({
      t: 'welcome', id: np.id, name, x: np.x, y: np.y, z: np.z, yaw: np.yaw, inv: np.inv, hp: np.hp, hunger: np.hunger, time, pvp: PVP,
      stash: np.stash, money: np.money, inRaid: np.inRaid, raidT: np.raidT, kitT: np.kitT - Date.now(), stats: np.stats, raidTime: RAID_TIME,
    });
    if (np.inWorld) broadcast({ t: 'pjoin', p: publicPlayer(np) }, ws);
    broadcast({ t: 'chat', sys: true, text: `${name} a rejoint la partie.` });
    console.log(`${name} a rejoint la partie (${players.size} en ligne).`);
    return;
  }
  if (!p) return;

  switch (m.t) {
    // ---------------------------------------------------- planque
    case 'hideout':
      if (p.inRaid) return;
      if (Array.isArray(m.stash) && m.stash.length <= 100) p.stash = m.stash.map((s) => cleanItem(s));
      if (Array.isArray(m.inv) && m.inv.length <= 40) p.inv = m.inv.map((s) => cleanItem(s));
      if (num(m.money) && m.money >= 0) p.money = Math.floor(m.money);
      if (num(m.hunger)) p.hunger = m.hunger;
      dirty = true;
      break;

    case 'kit': {
      if (p.inRaid) return;
      const now = Date.now();
      if (now < p.kitT) { ws.send({ t: 'kit', items: [], next: p.kitT - now }); return; }
      p.kitT = now + 10 * 60 * 1000;
      ws.send({ t: 'kit', items: freeKit(Math.random), next: p.kitT - now });
      break;
    }

    case 'deploy': {
      if (p.inRaid) return;
      if (Array.isArray(m.inv) && m.inv.length <= 40) p.inv = m.inv.map((s) => cleanItem(s));
      const pos = insertionPoint();
      Object.assign(p, pos);
      p.inRaid = true; p.inWorld = true; p.alive = true; p.raidT = RAID_TIME; p.hp = 20; p.hunger = Math.max(p.hunger, 12);
      p.stats.raids++;
      ws.send({ t: 'deployed', x: p.x, y: p.y, z: p.z, raidT: p.raidT, hp: p.hp, hunger: p.hunger, time });
      broadcast({ t: 'pjoin', p: publicPlayer(p) }, ws);
      broadcast({ t: 'chat', sys: true, text: `${p.name} part en raid.` });
      dirty = true;
      break;
    }

    case 'extract': {
      if (!p.inRaid || !p.inWorld) return;
      const ok = gen.extractionsNear(p.x, p.z, 16).some((e) => Math.hypot(e.cx - p.x, e.cz - p.z) < 7.5 && Math.abs(p.y - (e.y + 1)) < 5);
      if (!ok) return;
      if (Array.isArray(m.inv) && m.inv.length <= 40) p.inv = m.inv.map((s) => cleanItem(s));
      if (num(m.hp)) p.hp = m.hp;
      p.inRaid = false; p.stats.extracts++;
      leaveWorld(p);
      ws.send({ t: 'extracted', raidT: p.raidT, stats: p.stats });
      broadcast({ t: 'chat', sys: true, text: `${p.name} s'est extrait de la zone.` });
      dirty = true;
      break;
    }

    case 'dead': {
      if (!p.inRaid) return;
      const list = Array.isArray(m.items) ? m.items.slice(0, 60) : [];
      makeBag(p.x, p.y, p.z, list, `Corps de ${p.name}`);
      p.inRaid = false; p.inv = null; p.stats.deaths++;
      const killer = m.killer ? players.get(m.killer | 0) : null;
      if (killer && killer !== p) { killer.stats.kills++; killer.ws.send({ t: 'stats', stats: killer.stats }); }
      leaveWorld(p);
      ws.send({ t: 'stats', stats: p.stats });
      broadcast({ t: 'chat', sys: true, text: `${p.name} ${String(m.cause || 'est mort.').slice(0, 60)}` });
      dirty = true;
      break;
    }

    // ---------------------------------------------------- dans le monde
    case 'pos':
      if (!p.inWorld) return;
      if (num(m.x) && num(m.y) && num(m.z)) {
        const now = Date.now(), dtp = Math.max(0.02, (now - (p.lastPos || now - 50)) / 1000);
        p.vx = (m.x - p.x) / dtp; p.vz = (m.z - p.z) / dtp; p.lastPos = now;
        p.x = m.x; p.y = m.y; p.z = m.z;
      }
      if (num(m.yaw)) p.yaw = m.yaw;
      if (num(m.pitch)) p.pitch = m.pitch;
      if (num(m.held)) p.held = m.held | 0;
      p.moved = true;
      break;

    case 'set': {
      if (!p.inWorld) return;
      const x = m.x | 0, y = m.y | 0, z = m.z | 0, id = m.id | 0;
      if (y < 0 || y >= HEIGHT || !BLOCKS[id]) return;
      if (Math.abs(x - p.x) > 12 || Math.abs(y - p.y) > 12 || Math.abs(z - p.z) > 12) {
        // les tirs peuvent briser du verre plus loin
        if (!(m.glass && id === B.AIR && world.get(x, y, z) === B.GLASS && Math.hypot(x - p.x, z - p.z) < 300)) return;
      }
      const old = world.get(x, y, z);
      if (!isFinite(BLOCKS[old].hardness) || (old !== B.AIR && old !== B.WATER && id !== B.AIR && !BLOCKS[old].replaceable)) {
        ws.send({ t: 'set', x, y, z, id: old });
        return;
      }
      if (m.glass && old !== B.GLASS) return;
      applySet(x, y, z, id, p);
      if (id === B.AIR && old !== B.AIR && old !== B.WATER) {
        if (CONTAINER[old]) {
          const key = x + ',' + y + ',' + z, c = save.containers[key];
          if (c) for (const s of c.items) if (s) spawnItem(s, x + 0.5, y + 0.5, z + 0.5, (Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3, 0.3);
          delete save.containers[key];
          closeContainer(key);
          if (old === B.STORAGE) spawnItem({ id: B.STORAGE, n: 1 }, x + 0.5, y + 0.3, z + 0.5, 0, 3, 0, 0.3);
        } else if (!m.glass) {
          const r = mulberry32((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ Date.now());
          for (const [did, n] of blockDrops(old, m.tool | 0, r)) {
            spawnItem({ id: did, n }, x + 0.5, y + 0.3, z + 0.5, (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2, 0.3);
          }
        }
        breakUnsupported(x, y + 1, z, p);
        const nb = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
        if (nb.some(([dx, dy, dz]) => world.get(x + dx, y + dy, z + dz) === B.WATER)) applySet(x, y, z, B.WATER, null);
      }
      break;
    }

    case 'drop':
      if (!p.inWorld) return;
      if (m.item && num(m.x) && num(m.y) && num(m.z)) {
        spawnItem(m.item, m.x, m.y, m.z, num(m.vx) ? m.vx : 0, num(m.vy) ? m.vy : 0, num(m.vz) ? m.vz : 0, 1.5);
      }
      break;

    case 'pickup': {
      const it = items.get(m.id | 0);
      if (!it || !inWorld(p)) return;
      items.delete(it.id);
      ws.send({ t: 'give', item: it.item });
      broadcast({ t: 'ir', id: it.id, by: p.id });
      break;
    }

    case 'attack': {
      if (!inWorld(p)) return;
      const mob = mobs.get(m.id | 0);
      if (!mob || mob.dead) return;
      if (Math.hypot(mob.x - p.x, mob.z - p.z) > 7) return;
      damageMob(mob, Math.max(0, Math.min(12, +m.dmg || 1)), p, false);
      break;
    }

    case 'hitp': {
      if (!PVP || !inWorld(p)) return;
      const q = players.get(m.id | 0);
      if (!inWorld(q) || q === p) return;
      if (Math.hypot(q.x - p.x, q.z - p.z) > 7) return;
      q.ws.send({ t: 'hurt', dmg: Math.max(0, Math.min(12, +m.dmg || 1)), x: p.x, z: p.z, src: p.name, srcId: p.id });
      break;
    }

    case 'shot': {
      if (!inWorld(p)) return;
      const g = GUNS[m.g | 0]; if (!g) return;
      const now = Date.now();
      if (now - p.lastShot < (60000 / g.rpm) * 0.55) return;
      p.lastShot = now;
      const o = arr3(m.o); if (!o || Math.hypot(o[0] - p.x, o[2] - p.z) > 4) return;
      const ends = (Array.isArray(m.e) ? m.e : []).slice(0, 8).map(arr3).filter(Boolean);
      const sil = !!m.sil;
      broadcastNear({ t: 'shot', id: p.id, g: m.g | 0, o, e: ends, sil }, p.x, p.z, sil ? 60 : 320, ws);
      alertAround(o[0], o[2], sil ? 12 : g.noise * 0.6);
      for (const h of (Array.isArray(m.h) ? m.h : []).slice(0, 12)) {
        const dmg = Math.max(0, Math.min(45, +h.dmg || 0));
        if (!dmg) continue;
        if (h.k === 'm') {
          const mob = mobs.get(h.id | 0);
          if (mob && !mob.dead && Math.hypot(mob.x - p.x, mob.z - p.z) < 320) damageMob(mob, dmg, p, true);
        } else if (h.k === 'p' && PVP) {
          const q = players.get(h.id | 0);
          if (inWorld(q) && q !== p && Math.hypot(q.x - p.x, q.z - p.z) < 320) {
            q.ws.send({ t: 'hurt', dmg, pen: h.pen | 0, part: String(h.part || 'body'), bullet: true, x: p.x, z: p.z, src: p.name, srcId: p.id });
          }
        }
      }
      break;
    }

    case 'swing':
      if (p.inWorld) broadcast({ t: 'swing', id: p.id }, ws);
      break;

    case 'act': // rechargement, etc. (animation chez les autres)
      if (p.inWorld) broadcastNear({ t: 'act', id: p.id, a: String(m.a || '').slice(0, 12) }, p.x, p.z, 80, ws);
      break;

    case 'inv':
      if (Array.isArray(m.inv) && m.inv.length <= 40) p.inv = m.inv.map((s) => cleanItem(s));
      if (num(m.hp)) p.hp = m.hp;
      if (num(m.hunger)) p.hunger = m.hunger;
      if (num(m.raidT) && p.inRaid) p.raidT = Math.min(p.raidT, m.raidT);
      dirty = true;
      break;

    // ---------------------------------------------------- conteneurs
    case 'open': {
      if (!inWorld(p)) return;
      const key = typeof m.key === 'string' ? m.key : `${m.x | 0},${m.y | 0},${m.z | 0}`;
      const c = containerOf(key);
      if (!c || !nearContainer(p, c)) return;
      if (!viewers.has(key)) viewers.set(key, new Set());
      viewers.get(key).add(ws);
      sendContainer(key, c, ws);
      break;
    }
    case 'close': {
      const set = viewers.get(String(m.key));
      if (set) set.delete(ws);
      break;
    }
    case 'ctake': {
      const key = String(m.key), set = viewers.get(key);
      if (!set || !set.has(ws) || !inWorld(p)) return;
      const c = containerOf(key); if (!c || !nearContainer(p, c)) return;
      const i = m.slot | 0, s = c.items[i];
      if (!s) { sendContainer(key, c, ws); return; }
      c.items[i] = null;
      ws.send({ t: 'give', item: s, silent: true });
      dirty = true;
      if (c.bag && c.items.every((x) => !x)) { removeBag(c.bag); return; }
      sendContainer(key, c);
      break;
    }
    case 'cput': {
      const key = String(m.key), set = viewers.get(key);
      const item = cleanItem(m.item);
      if (!item) return;
      const c = set && set.has(ws) && inWorld(p) ? containerOf(key) : null;
      if (!c || !nearContainer(p, c)) { ws.send({ t: 'give', item, silent: true }); return; }
      let i = m.slot | 0, left = item.n;
      const ms = maxStack(item.id);
      const t = c.items[i];
      if (i >= 0 && i < c.cap && !t) { c.items[i] = item; left = 0; }
      else if (t && t.id === item.id && plain(t) && plain(item) && t.n < ms) { const k = Math.min(left, ms - t.n); t.n += k; left -= k; }
      for (let k = 0; k < c.cap && left > 0; k++) if (!c.items[k]) { c.items[k] = { ...item, n: left }; left = 0; }
      if (left > 0) ws.send({ t: 'give', item: { ...item, n: left }, silent: true });
      dirty = true;
      sendContainer(key, c);
      break;
    }

    case 'chat': {
      const text = String(m.text || '').slice(0, 200).trim();
      if (!text) return;
      if (text.startsWith('/')) command(p, text);
      else broadcast({ t: 'chat', from: p.name, text });
      break;
    }
  }
}

function applySet(x, y, z, id, by) {
  world.set(x, y, z, id);
  broadcast({ t: 'set', x, y, z, id, by: by ? by.id : 0 });
}

function breakUnsupported(x, y, z) {
  if (y >= HEIGHT) return;
  const id = world.get(x, y, z);
  if (BLOCKS[id] && BLOCKS[id].needsSupport) {
    applySet(x, y, z, B.AIR, null);
    for (const [did, n] of blockDrops(id, 0, Math.random)) spawnItem({ id: did, n }, x + 0.5, y + 0.3, z + 0.5, 0, 2, 0, 0.3);
  }
}

function sys(p, text) { p.ws.send({ t: 'chat', sys: true, text }); }

function command(p, text) {
  const [cmd, ...args] = text.slice(1).split(/\s+/);
  switch (cmd.toLowerCase()) {
    case 'aide': case 'help':
      sys(p, 'Commandes : /joueurs, /temps jour|nuit, /tp <joueur> (en raid), /graine');
      break;
    case 'joueurs': case 'list':
      sys(p, `En ligne (${players.size}) : ${[...players.values()].map((q) => q.name + (q.inRaid ? ' (en raid)' : ' (planque)')).join(', ')}`);
      break;
    case 'temps': case 'time': {
      const a = (args[0] || '').toLowerCase();
      if (a === 'jour' || a === 'day') time = 0.03;
      else if (a === 'nuit' || a === 'night') time = 0.56;
      else { sys(p, 'Usage : /temps jour|nuit'); return; }
      broadcast({ t: 'time', time });
      broadcast({ t: 'chat', sys: true, text: `${p.name} a changé l'heure.` });
      break;
    }
    case 'tp': {
      if (!p.inWorld) { sys(p, 'Vous devez être en raid.'); return; }
      const q = [...players.values()].find((o) => o.inWorld && o.name.toLowerCase() === (args[0] || '').toLowerCase());
      if (!q) { sys(p, 'Joueur introuvable (ou pas en raid).'); return; }
      p.ws.send({ t: 'tp', x: q.x, y: q.y, z: q.z });
      break;
    }
    case 'graine': case 'seed':
      sys(p, `Graine du monde : ${save.seed}`);
      break;
    default:
      sys(p, 'Commande inconnue. Tapez /aide.');
  }
}

// ------------------------------------------------------------------ Créatures et pillards
function createMob(type, x, y, z, size = 1) {
  const d = mobDims(type, size);
  const m = {
    id: nextMob++, type, size, x, y, z, vx: 0, vy: 0, vz: 0, w: d.w, h: d.h, hp: d.hp, maxHp: d.hp, dmg: d.dmg,
    yaw: Math.random() * Math.PI * 2, pitch: 0, ground: false, wanderT: 0, moving: false, dir: 0, panic: 0, kb: 0,
    atkCd: 0, atkT: 0, eatT: 0, hopT: 1, burnT: 0, burning: false, skyCheck: 0, dead: false, aggro: 0, alert: null,
  };
  mobs.set(m.id, m);
  return m;
}

function createBandit(x, y, z, anchor) {
  const m = createMob('bandit', x, y, z);
  m.gun = pickBanditGun(Math.random);
  m.gunItem = makeGun(m.gun, Math.random, 0.3, 1);
  m.st = gunStats(m.gunItem);
  m.ammo = m.st.mag; m.reloadT = 0; m.fireT = 0; m.burst = 0; m.react = 0;
  m.target = null; m.lastSeen = null; m.lastSeenT = 0; m.losT = 0; m.visible = false;
  m.anchor = anchor || { x, z }; m.variant = Math.floor(Math.random() * 3); m.strafeT = 0; m.strafeDir = 1;
  m.aiming = false;
  return m;
}

function damageMob(mob, dmg, p, bullet) {
  mob.hp -= dmg;
  const dx = mob.x - p.x, dz = mob.z - p.z, d = Math.hypot(dx, dz) || 1;
  const kb = bullet ? 1.5 : 7;
  mob.vx = (dx / d) * kb; mob.vz = (dz / d) * kb; if (!bullet) mob.vy = 5.5; mob.kb = bullet ? 0.08 : 0.35;
  mob.panic = 4; mob.fleeDir = Math.atan2(dx, dz); mob.aggro = p.id;
  if (mob.type === 'bandit') { mob.target = p; mob.lastSeen = { x: p.x, y: p.y, z: p.z }; mob.lastSeenT = Date.now(); if (mob.react > 0.4) mob.react = 0.4; }
  else if (MOBS[mob.type].hostile) mob.alert = { x: p.x, z: p.z, t: Date.now() };
  broadcast({ t: 'mh', id: mob.id, hp: r2(mob.hp) });
  if (mob.hp <= 0) killMob(mob, p);
}

function killMob(mob, killer) {
  mob.dead = true;
  mobs.delete(mob.id);
  broadcast({ t: 'md', id: mob.id });
  if (mob.type === 'bandit') {
    const loot = [mob.gunItem];
    const ammo = Object.keys(AMMO).map(Number).find((k) => AMMO[k].cal === GUNS[mob.gun].cal && AMMO[k].pen < 5);
    if (Math.random() < 0.85) loot.push({ id: ammo, n: 10 + Math.floor(Math.random() * 35) });
    loot.push(...rollLoot('bandit', Math.random));
    makeBag(mob.x, mob.y, mob.z, loot, 'Corps de pillard');
    if (killer && killer.stats) { killer.stats.bandits++; sys(killer, 'Pillard éliminé.'); killer.ws.send({ t: 'stats', stats: killer.stats }); }
    return;
  }
  for (const [id, n] of rollDrops(mob.type, Math.random, mob.size)) {
    spawnItem({ id, n }, mob.x, mob.y + 0.4, mob.z, (Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3, 0.5);
  }
  if (mob.type === 'slime' && mob.size > 1) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const s = createMob('slime', mob.x + (Math.random() - 0.5), mob.y + 0.2, mob.z + (Math.random() - 0.5), 1);
      s.vy = 5; s.vx = (Math.random() - 0.5) * 4; s.vz = (Math.random() - 0.5) * 4; s.kb = 0.3;
    }
  }
}

// Les tirs attirent les créatures hostiles et les pillards
function alertAround(x, z, r) {
  const now = Date.now();
  for (const m of mobs.values()) {
    if (!MOBS[m.type].hostile) continue;
    if (Math.hypot(m.x - x, m.z - z) > r) continue;
    m.alert = { x, z, t: now };
  }
}

function nearestPlayer(m, range) {
  let best = null, bd = range;
  for (const p of players.values()) {
    if (!inWorld(p)) continue;
    const d = Math.hypot(p.x - m.x, p.z - m.z, (p.y - m.y) * 1.5);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Ligne de vue à travers les voxels (le verre laisse voir, le feuillage cache)
function los(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
  const n = Math.ceil(d / 0.3);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const id = world.get(Math.floor(ax + dx * t), Math.floor(ay + dy * t), Math.floor(az + dz * t));
    if (SOLID[id] && id !== B.GLASS) return false;
  }
  return true;
}

const PREF_DIST = { pistol: 11, smg: 13, shotgun: 6, rifle: 22, sniper: 36 };
const ACC = { pistol: 0.55, smg: 0.45, shotgun: 0.5, rifle: 0.6, sniper: 0.85 };
const ERANGE = { pistol: 38, smg: 42, shotgun: 16, rifle: 90, sniper: 170 };

// IA des pillards : renvoie la direction de déplacement voulue [mx, mz, vitesse]
function banditTick(m, dt) {
  const now = Date.now(), st = m.st;
  m.fireT = Math.max(0, m.fireT - dt);
  if (m.reloadT > 0) { m.reloadT -= dt; if (m.reloadT <= 0) m.ammo = st.mag; }
  const eyeY = m.y + 1.6;
  // perception (4 fois par seconde)
  m.losT -= dt;
  if (m.losT <= 0) {
    m.losT = 0.25;
    let best = null, bd = Infinity;
    for (const p of players.values()) {
      if (!inWorld(p)) continue;
      const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
      if (d > 60) continue;
      const fwd = Math.sin(m.yaw) * dx + Math.cos(m.yaw) * dz;
      const known = m.target === p && now - m.lastSeenT < 4000;
      if (!known && d > 9 && fwd < d * 0.3) continue; // hors du champ de vision
      if (!los(m.x, eyeY, m.z, p.x, p.y + 1.5, p.z) && !los(m.x, eyeY, m.z, p.x, p.y + 0.9, p.z)) continue;
      if (d < bd) { bd = d; best = p; }
    }
    const wasVisible = m.visible;
    m.visible = !!best;
    if (best) {
      if (!wasVisible || m.target !== best) m.react = Math.max(m.react, 0.55 + Math.random() * 0.5);
      m.target = best; m.lastSeen = { x: best.x, y: best.y, z: best.z }; m.lastSeenT = now;
    }
  }
  const T = m.target && inWorld(m.target) ? m.target : null;
  if (!T) m.target = null;
  m.aiming = !!(T && m.visible);
  if (T && m.visible) {
    const dx = T.x - m.x, dz = T.z - m.z, d = Math.hypot(dx, dz) || 1;
    m.yaw = Math.atan2(dx, dz);
    m.pitch = Math.atan2(T.y + 1.1 - eyeY, d);
    m.react -= dt;
    if (m.reloadT <= 0 && m.react <= 0 && m.fireT <= 0) {
      if (m.ammo <= 0) {
        m.reloadT = st.reload * 1.2;
        broadcastNear({ t: 'act', id: -m.id, a: 'reload' }, m.x, m.z, 80);
      } else banditFire(m, T, d);
    }
    // placement
    const pref = PREF_DIST[st.cat] || 15;
    m.strafeT -= dt;
    if (m.strafeT <= 0) { m.strafeT = 1.2 + Math.random() * 2; m.strafeDir = Math.random() < 0.5 ? -1 : 1; }
    let mx = 0, mz = 0, sp = 2.2;
    if (d > pref + 6 && m.reloadT <= 0) { mx = dx / d; mz = dz / d; sp = 2.8; }
    else if (d < pref - 5 || m.reloadT > 0) { mx = -dx / d; mz = -dz / d; sp = 2.2; }
    mx += (-dz / d) * m.strafeDir * 0.8; mz += (dx / d) * m.strafeDir * 0.8;
    const l = Math.hypot(mx, mz) || 1;
    return [mx / l, mz / l, sp];
  }
  // recherche de la dernière position connue
  if (m.lastSeen && now - m.lastSeenT < 25000) {
    const dx = m.lastSeen.x - m.x, dz = m.lastSeen.z - m.z, d = Math.hypot(dx, dz);
    if (d > 2) { m.yaw = Math.atan2(dx, dz); m.pitch = 0; return [dx / d, dz / d, 2.4]; }
    m.lastSeen = null;
  }
  if (m.alert && now - m.alert.t < 30000) {
    const dx = m.alert.x - m.x, dz = m.alert.z - m.z, d = Math.hypot(dx, dz);
    if (d > 4) { m.yaw = Math.atan2(dx, dz); m.pitch = 0; return [dx / d, dz / d, 2.2]; }
    m.alert = null;
  }
  // patrouille autour du point d'ancrage
  m.pitch = 0;
  m.wanderT -= dt;
  const ax = m.anchor.x - m.x, az = m.anchor.z - m.z, ad = Math.hypot(ax, az);
  if (m.wanderT <= 0) {
    m.wanderT = 2 + Math.random() * 4;
    m.moving = Math.random() < 0.6;
    m.dir = ad > 12 ? Math.atan2(ax, az) + (Math.random() - 0.5) * 0.6 : Math.random() * Math.PI * 2;
  }
  if (!m.moving) return [0, 0, 0];
  m.yaw = m.dir;
  return [Math.sin(m.dir), Math.cos(m.dir), 1.3];
}

function banditFire(m, T, d) {
  const st = m.st, cat = st.cat;
  const interval = 60 / st.rpm;
  if (st.modes[0] === 'auto') {
    if (m.burst <= 0) m.burst = 3 + Math.floor(Math.random() * 4);
    m.burst--;
    m.fireT = m.burst > 0 ? interval : interval + 0.35 + Math.random() * 0.6;
  } else m.fireT = Math.max(interval, cat === 'pistol' ? 0.28 + Math.random() * 0.35 : interval);
  m.ammo--;
  const pellets = st.pellets;
  const tSpeed = Math.hypot(T.vx || 0, T.vz || 0);
  const falloff = Math.max(0.12, 1 - d / (ERANGE[cat] || 60));
  let dmg = 0, hit = false;
  const ammo = AMMO[m.gunItem.at] || { dmg: 1, pen: 2 };
  for (let k = 0; k < pellets; k++) {
    const pHit = (ACC[cat] || 0.5) * falloff * (tSpeed > 3 ? 0.75 : 1);
    if (Math.random() < pHit) { hit = true; dmg += st.dmg * ammo.dmg * (d > st.range ? Math.max(0.35, st.range / d) : 1); }
  }
  const muzzle = [m.x + Math.sin(m.yaw) * 0.7, m.y + 1.4, m.z + Math.cos(m.yaw) * 0.7];
  let end;
  if (hit) {
    const r = Math.random(), part = r < (cat === 'sniper' ? 0.25 : 0.1) ? 'head' : r < 0.32 ? 'legs' : 'body';
    end = [T.x, T.y + (part === 'head' ? 1.6 : part === 'legs' ? 0.5 : 1.1), T.z];
    T.ws.send({ t: 'hurt', dmg: Math.min(40, dmg), pen: ammo.pen, part, bullet: true, x: m.x, z: m.z, src: 'un pillard' });
  } else {
    const a = Math.random() * Math.PI * 2, off = 0.8 + Math.random() * 1.8;
    const ex = T.x + Math.cos(a) * off - m.x, ey = T.y + 1 + (Math.random() - 0.3) * 1.5 - (m.y + 1.4), ez = T.z + Math.sin(a) * off - m.z;
    const l = Math.hypot(ex, ey, ez) || 1, L = d + 25;
    end = [muzzle[0] + ex / l * L, muzzle[1] + ey / l * L, muzzle[2] + ez / l * L];
  }
  broadcastNear({ t: 'shot', id: -m.id, g: m.gun, o: muzzle.map(r2), e: [end.map(r2)], sil: st.sil, near: [T.x, T.y + 1, T.z] }, m.x, m.z, st.sil ? 60 : 320);
  alertAround(m.x, m.z, st.sil ? 10 : 35);
}

const GRAV = 28;
function mobTick(m, dt) {
  const def = MOBS[m.type];
  m.atkCd = Math.max(0, m.atkCd - dt); m.atkT = Math.max(0, m.atkT - dt); m.eatT = Math.max(0, m.eatT - dt);
  m.kb = Math.max(0, m.kb - dt); m.panic = Math.max(0, m.panic - dt);
  const inWater = world.get(Math.floor(m.x), Math.floor(m.y + Math.min(0.4, m.h * 0.5)), Math.floor(m.z)) === B.WATER;
  let mx = 0, mz = 0, speed = def.speed;

  if (m.type === 'bandit') {
    const [ax, az, sp] = banditTick(m, dt);
    mx = ax; mz = az; speed = sp;
  } else if (def.hostile) {
    if (m.type === 'zombie') {
      m.skyCheck -= dt;
      if (m.skyCheck <= 0) { m.skyCheck = 1; m.burning = isDay() && !inWater && world.skyExposed(Math.floor(m.x), Math.floor(m.y + m.h), Math.floor(m.z)); }
      if (m.burning) { m.burnT += dt; if (m.burnT > 1) { m.burnT = 0; m.hp -= 2; broadcast({ t: 'mh', id: m.id, hp: m.hp }); if (m.hp <= 0) { killMob(m); return; } } }
    }
    const target = nearestPlayer(m, m.type === 'spider' ? 18 : 22);
    if (target) {
      const dx = target.x - m.x, dz = target.z - m.z, d = Math.hypot(dx, dz) || 1;
      const dist3 = Math.hypot(dx, dz, target.y + 0.9 - (m.y + m.h * 0.5));
      m.yaw = Math.atan2(dx, dz);
      if (m.type === 'slime') {
        if (m.ground && m.kb <= 0) {
          m.hopT -= dt;
          if (m.hopT <= 0) { m.hopT = 0.8 + Math.random() * 0.8; m.vy = 6.5 + m.size; m.vx = (dx / d) * speed * 1.4; m.vz = (dz / d) * speed * 1.4; m.kb = 0.05; }
          else { m.vx *= 0.6; m.vz *= 0.6; }
        }
      } else if (d > 0.9) { mx = dx / d; mz = dz / d; }
      if (m.type === 'spider' && m.ground && d > 2.2 && d < 5.5 && Math.random() < dt * 1.2) {
        m.vy = 6.5; m.vx = (dx / d) * 7; m.vz = (dz / d) * 7; m.kb = 0.4;
      }
      const reach = def.range + m.w * 0.5;
      if (dist3 < reach && m.atkCd <= 0) {
        m.atkCd = m.type === 'slime' ? 0.9 : 1.1; m.atkT = 0.4;
        target.ws.send({ t: 'hurt', dmg: m.dmg, x: m.x, z: m.z, src: def.name.toLowerCase() === 'araignée' ? 'une araignée' : `un ${def.name.toLowerCase()}` });
      }
    } else if (m.alert && Date.now() - m.alert.t < 25000 && m.type !== 'slime') {
      const dx = m.alert.x - m.x, dz = m.alert.z - m.z, d = Math.hypot(dx, dz);
      if (d > 3) { mx = dx / d; mz = dz / d; m.yaw = Math.atan2(dx, dz); } else m.alert = null;
    } else wander(m, dt);
  } else if (m.panic > 0) {
    speed *= 2.1;
    m.wanderT -= dt;
    if (m.wanderT <= 0) { m.dir = m.fleeDir + (Math.random() - 0.5) * 1.4; m.wanderT = 0.5 + Math.random() * 0.5; }
    m.moving = true;
  } else wander(m, dt);

  if (m.type !== 'slime' && m.type !== 'bandit' && m.moving && !def.hostile) { mx = Math.sin(m.dir); mz = Math.cos(m.dir); m.yaw = m.dir; }
  if (m.type !== 'slime' && m.type !== 'bandit' && m.moving && def.hostile && mx === 0 && mz === 0 && !nearestPlayer(m, 22)) { mx = Math.sin(m.dir); mz = Math.cos(m.dir); m.yaw = m.dir; }
  if (m.type === 'slime' && !nearestPlayer(m, 22) && m.ground && m.kb <= 0) {
    m.hopT -= dt;
    if (m.hopT <= 0) { m.hopT = 1.5 + Math.random() * 2; m.dir = Math.random() * Math.PI * 2; m.yaw = m.dir; m.vy = 5.5 + m.size; m.vx = Math.sin(m.dir) * 2; m.vz = Math.cos(m.dir) * 2; m.kb = 0.05; }
    else { m.vx *= 0.6; m.vz *= 0.6; }
  }

  if (m.type !== 'slime' && m.kb <= 0) {
    const k = Math.min(1, (m.ground ? 10 : 2.5) * dt);
    m.vx += (mx * speed - m.vx) * k;
    m.vz += (mz * speed - m.vz) * k;
  }
  if (inWater) { m.vy = Math.min(m.vy + 22 * dt, 2.2); m.vx *= 0.92; m.vz *= 0.92; }
  else m.vy -= GRAV * dt;
  if (m.type === 'chicken' && m.vy < -3) m.vy = -3;
  m.vy = Math.max(m.vy, -40);

  const res = moveEntity(world, m, dt);
  m.ground = res.ground;
  if ((res.hx || res.hz) && res.ground && (mx !== 0 || mz !== 0)) m.vy = 8.2;
  if (m.y < -20) { mobs.delete(m.id); broadcast({ t: 'md', id: m.id, silent: true }); }
}

function wander(m, dt) {
  m.wanderT -= dt;
  if (m.wanderT > 0) return;
  if (Math.random() < 0.55) { m.moving = true; m.dir = Math.random() * Math.PI * 2; m.wanderT = 1.5 + Math.random() * 3; }
  else {
    m.moving = false; m.wanderT = 2 + Math.random() * 4;
    if (m.type === 'sheep' && Math.random() < 0.5) m.eatT = 2;
  }
}

function freeAt(x, y, z) { return !world.solid(x, y, z) && !world.solid(x, y + 1, z) && world.solid(x, y - 1, z); }

function trySpawn(p, type, mode, size = 1) {
  const d = mobDims(type, size);
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * Math.PI * 2;
    let x, y, z;
    if (mode === 'cave') {
      const dist = 10 + Math.random() * 14;
      x = Math.floor(p.x + Math.cos(a) * dist); z = Math.floor(p.z + Math.sin(a) * dist);
      y = Math.floor(p.y) + Math.floor(Math.random() * 16) - 8;
      if (y < 2 || y >= HEIGHT - 3) continue;
      if (!world.solid(x, y, z) || world.solid(x, y + 1, z) || world.solid(x, y + 2, z)) continue;
      if (world.get(x, y + 1, z) === B.WATER) continue;
      if (world.skyExposed(x, y + 1, z)) continue;
    } else {
      const dist = (type === 'bandit' ? 45 : 22) + Math.random() * 26;
      x = Math.floor(p.x + Math.cos(a) * dist); z = Math.floor(p.z + Math.sin(a) * dist);
      y = world.surface(x, z);
      if (y < 1) continue;
      const g = world.get(x, y, z);
      if (!MOBS[type].hostile && g !== B.GRASS && g !== B.SNOW_GRASS) continue;
      if (!SOLID[g] || world.solid(x, y + 1, z) || world.solid(x, y + 2, z)) continue;
    }
    if (d.w > 1 && (world.solid(x + 1, y + 1, z) || world.solid(x, y + 1, z + 1))) continue;
    if (type === 'bandit') { createBandit(x + 0.5, y + 1, z + 0.5); return true; }
    createMob(type, x + 0.5, y + 1, z + 0.5, size);
    return true;
  }
  return false;
}

// Pillards postés aux points d'intérêt
function spawnPOI(p) {
  const now = Date.now();
  let count = 0;
  for (const m of mobs.values()) if (m.type === 'bandit') count++;
  if (count > 28) return;
  const pois = gen.structuresNear(p.x, p.z, 85).filter((s) => s.type !== 'extract');
  for (const l of gen.lotsNear(p.x, p.z, 80)) pois.push(l);
  for (const s of pois) {
    if (count > 30) break;
    const key = s.gx !== undefined ? 'L' + s.gx + ',' + s.gz : s.rx + ',' + s.rz;
    if ((poiCooldown.get(key) || 0) > now) continue;
    const d = Math.hypot(s.cx - p.x, s.cz - p.z);
    if (d < 32) continue;
    poiCooldown.set(key, now + 8 * 60 * 1000);
    const R = Math.random();
    const n = { house: R < 0.5 ? 1 + Math.floor(R * 4) : 0, camp: 2 + Math.floor(R * 3), bunker: 2 + Math.floor(R * 2),
      tower: 1 + Math.floor(R * 3), block: Math.floor(R * 3), shops: Math.floor(R * 2.5), station: 1 + Math.floor(R * 2),
      parking: R < 0.4 ? 1 : 0, houses: R < 0.5 ? 1 : 0, ruin: R < 0.35 ? 1 : 0, park: R < 0.25 ? 1 : 0 }[s.type] || 0;
    const exact = s.type === 'bunker' || s.gx !== undefined;
    for (let i = 0; i < n; i++) {
      const [bx, by, bz] = s.spawns[i % s.spawns.length];
      for (let t = 0; t < 8; t++) {
        const sp = exact ? 3 : 5;
        const x = bx + Math.floor((Math.random() - 0.5) * (t ? sp : 1)), z = bz + Math.floor((Math.random() - 0.5) * (t ? sp : 1));
        let y = by;
        if (!exact) { y = world.surface(x, z) + 1; if (y < 1 || Math.abs(y - by) > 3) continue; }
        if (!freeAt(x, y, z)) continue;
        createBandit(x + 0.5, y, z + 0.5, { x: s.cx, z: s.cz });
        count++;
        break;
      }
    }
  }
}

function spawnTick() {
  const active = [...players.values()].filter(inWorld);
  // disparition des créatures lointaines
  for (const m of mobs.values()) {
    let near = Infinity;
    for (const p of players.values()) if (p.inWorld) near = Math.min(near, Math.hypot(p.x - m.x, p.z - m.z));
    const limit = m.type === 'bandit' ? 115 : MOBS[m.type].hostile ? 72 : 100;
    if (near > limit) { mobs.delete(m.id); broadcast({ t: 'md', id: m.id, silent: true }); }
  }
  for (const p of active) spawnPOI(p);
  if (mobs.size > 110) return;
  for (const p of active) {
    let passive = 0, hostile = 0, bandits = 0;
    for (const m of mobs.values()) {
      if (Math.hypot(m.x - p.x, m.z - p.z) > 64) continue;
      if (m.type === 'bandit') bandits++;
      else if (MOBS[m.type].hostile) hostile++; else passive++;
    }
    if (passive < 8 && Math.random() < 0.5) trySpawn(p, ['pig', 'sheep', 'chicken'][Math.floor(Math.random() * 3)], 'surface');
    if (isNight() && hostile < 8) trySpawn(p, Math.random() < 0.55 ? 'zombie' : 'spider', 'surface');
    if (hostile < 6 && Math.random() < 0.08) trySpawn(p, 'slime', 'surface', Math.random() < 0.5 ? 2 : 1);
    // patrouilles errantes
    if (bandits < 3 && Math.random() < 0.025) { if (trySpawn(p, 'bandit', 'surface')) trySpawn(p, 'bandit', 'surface'); }
    const surf = gen.column(Math.floor(p.x), Math.floor(p.z)) & 255;
    if (p.y < surf - 8 && hostile < 7 && Math.random() < 0.6) trySpawn(p, Math.random() < 0.6 ? 'zombie' : 'spider', 'cave');
  }
}

// ------------------------------------------------------------------ Boucle serveur
const TICK = 0.05;
let tickN = 0;
setInterval(() => {
  tickN++;
  time = (time + TICK / DAY_LENGTH) % 1;
  for (const m of mobs.values()) if (!m.dead) mobTick(m, TICK);

  // chrono des raids (disparu au combat quand il est écoulé)
  for (const p of players.values()) {
    if (!p.inRaid || !p.inWorld) continue;
    p.raidT -= TICK;
    if (p.raidT <= 0) {
      p.inRaid = false; p.inv = null; p.stats.deaths++;
      leaveWorld(p);
      p.ws.send({ t: 'mia' });
      p.ws.send({ t: 'stats', stats: p.stats });
      broadcast({ t: 'chat', sys: true, text: `${p.name} est porté disparu.` });
      dirty = true;
    }
  }

  // positions des joueurs (20 Hz)
  if (players.size) {
    const ps = [];
    for (const p of players.values()) if (p.moved && p.inWorld) { ps.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), p.held]); p.moved = false; }
    if (ps.length) { const s = JSON.stringify({ t: 'ps', l: ps }); for (const c of clients) if (!c.congested) c.send(s); }
  }
  // état des créatures (10 Hz), filtré par distance
  if (tickN % 2 === 0) {
    for (const c of clients) {
      if (c.congested) continue;
      const ref = c.player && c.player.inWorld ? c.player : null;
      const l = [];
      if (ref) for (const m of mobs.values()) {
        if (Math.abs(m.x - ref.x) > 110 || Math.abs(m.z - ref.z) > 110) continue;
        const fl = (m.atkT > 0 ? 1 : 0) | (m.eatT > 0 ? 2 : 0) | (m.panic > 0 ? 4 : 0) | (m.burning ? 8 : 0) | (m.ground ? 16 : 0) | (m.aiming ? 32 : 0) | (m.reloadT > 0 ? 64 : 0);
        const e = [m.id, MOB_TYPES.indexOf(m.type), r2(m.x), r2(m.y), r2(m.z), r2(m.yaw), r2(m.hp), fl, m.size];
        if (m.type === 'bandit') e.push(m.gun, m.variant, r2(m.pitch), m.gunItem.m);
        l.push(e);
      }
      c.send({ t: 'ms', l });
    }
  }
  if (tickN % 20 === 0) spawnTick();
  if (tickN % 100 === 0) {
    broadcast({ t: 'time', time });
    const now = Date.now();
    for (const it of items.values()) if (now - it.born > 8 * 60 * 1000) { items.delete(it.id); broadcast({ t: 'ir', id: it.id, by: 0 }); }
    for (const b of bags.values()) if (now - b.born > 45 * 60 * 1000) removeBag(b);
  }
  if (tickN % 600 === 0 && (dirty || players.size)) writeSave();
}, TICK * 1000);

// ------------------------------------------------------------------ Démarrage
function shutdown() {
  console.log('\nSauvegarde du monde...');
  writeSave();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Erreur de démarrage : sans console (Glaise.exe), on l'affiche dans une boîte de dialogue
function fatalExit(msg) {
  if (msg) console.error(msg);
  if (IN_SEA && process.platform === 'win32') { alertBox(msg || 'Le serveur Glaise a rencontré une erreur.', () => process.exit(1)); return; }
  if (IN_SEA) { console.error('\nAppuyez sur Entrée pour fermer.'); process.stdin.resume(); process.stdin.once('data', () => process.exit(1)); return; }
  process.exit(1);
}
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    // un serveur Glaise tourne déjà sur ce port ? on ouvre simplement une fenêtre de plus
    probeGlaise(PORT, (isGlaise) => {
      if (isGlaise && process.env.OPEN !== '0') { openGameWindow(`http://localhost:${PORT}`, false); setTimeout(() => process.exit(0), 1500); }
      else fatalExit(`Le port ${PORT} est déjà utilisé par un autre programme. Essayez un autre port : ` + (IN_SEA ? 'Glaise.exe 8081' : 'node server.js 8081'));
    });
    return;
  }
  else if ((e.code === 'EAFNOSUPPORT' || e.code === 'EADDRNOTAVAIL') && listenHost === '::') {
    console.error("L'IPv6 n'est pas disponible sur cette machine : repli sur l'IPv4 uniquement.");
    listenHost = '0.0.0.0';
    server.listen(PORT, listenHost, onListening);
    return;
  }
  fatalExit('Impossible de démarrer le serveur : ' + (e.message || e));
});

let listenHost = HOST;
server.listen(PORT, listenHost, onListening);
let announced = false;
// Adresses réseau de cette machine (affichées dans la console et dans le menu du jeu)
function localAddresses() {
  const v6 = [], v4 = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) {
    if (n.internal) continue;
    const fam = n.family === 'IPv6' || n.family === 6 ? 6 : 4;
    const a = n.address.toLowerCase();
    if (fam === 6) { if (!a.startsWith('fe80')) v6.push({ ip: n.address, local: a.startsWith('fd') || a.startsWith('fc') }); }
    else v4.push({ ip: n.address });
  }
  return { v6: listenHost === '::' ? v6 : [], v4 };
}

// ------------------------------------------------------------------ Fenêtre du jeu
// Plutôt qu'un onglet de navigateur, le jeu s'ouvre dans sa propre fenêtre : Edge ou Chrome
// en mode « application » (sans onglets ni barre d'adresse), avec un profil dédié.
// Glaise.exe s'arrête (en sauvegardant) quand cette fenêtre est fermée.
const APP_WINDOW = IN_SEA || process.env.FENETRE === '1';
const QUIT_WITH_WINDOW = IN_SEA ? process.env.GARDER !== '1' : process.env.FENETRE_QUITTE === '1';

function findBrowser() {
  if (process.env.NAVIGATEUR) return fs.existsSync(process.env.NAVIGATEUR) ? process.env.NAVIGATEUR : null;
  const env = process.env, c = [];
  if (process.platform === 'win32') {
    for (const base of [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA]) {
      if (!base) continue;
      c.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(base, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'), path.join(base, 'Chromium', 'Application', 'chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    c.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const dir of (env.PATH || '').split(':')) for (const n of ['microsoft-edge', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser']) c.push(path.join(dir, n));
  }
  return c.find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }) || null;
}

function openDefaultBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

let windowProc = null, windowAt = 0, windowWatch = false;
function openGameWindow(url, watch) {
  const exe = findBrowser();
  if (!exe) { openDefaultBrowser(url); return; }
  const profile = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'Glaise', 'fenetre')
    : path.join(os.homedir(), '.config', 'glaise', 'fenetre');
  try { fs.mkdirSync(profile, { recursive: true }); } catch { /* */ }
  const args = [`--app=${url}`, `--user-data-dir=${profile}`, '--window-size=1280,800', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate,msEdgeSidebarV2', '--disable-background-mode'];
  try {
    const child = spawnProcess(exe, args, { detached: !watch, stdio: 'ignore', windowsHide: false });
    child.on('error', () => openDefaultBrowser(url));
    if (!watch) { child.unref(); return; }
    windowProc = child; windowAt = Date.now(); windowWatch = true;
    child.on('exit', () => {
      windowProc = null;
      // sortie immédiate : le navigateur a confié la fenêtre à une instance déjà ouverte,
      // on surveille alors les connexions locales (voir plus bas)
      if (Date.now() - windowAt < 5000) return;
      if (QUIT_WITH_WINDOW) { console.log('Fenêtre du jeu fermée.'); setTimeout(shutdown, 800); }
    });
  } catch { openDefaultBrowser(url); }
}

// Secours : plus aucune connexion depuis cette machine pendant 25 s -> arrêt (si la fenêtre n'est plus suivie)
let localConns = 0, localSeen = false, lastLocal = Date.now();
const isLoopback = (a) => a === '::1' || a === '127.0.0.1' || a === '::ffff:127.0.0.1';
setInterval(() => {
  if (!QUIT_WITH_WINDOW || !windowWatch || windowProc) return;
  if (localSeen && localConns === 0 && Date.now() - lastLocal > 25000) { console.log('Plus de fenêtre de jeu ouverte.'); shutdown(); }
}, 5000);

// Un serveur Glaise répond-il déjà sur ce port ?
function probeGlaise(port, cb) {
  const req = http.get({ host: '127.0.0.1', port, path: '/api/info', timeout: 1500 }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => { try { cb(JSON.parse(body).game === 'glaise'); } catch { cb(false); } });
  });
  req.on('timeout', () => { req.destroy(); cb(false); });
  req.on('error', () => cb(false));
}

// Boîte de dialogue Windows (Glaise.exe n'a pas de console)
function alertBox(msg, done) {
  const q = "'" + String(msg).replace(/'/g, "''") + "'";
  const ps = spawnProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
    `Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show(${q}, 'Glaise')`], { windowsHide: true, stdio: 'ignore' });
  ps.on('exit', () => done && done());
  ps.on('error', () => done && done());
}

function onListening() {
  if (announced) return;
  announced = true;
  // le jeu s'ouvre dans sa propre fenêtre (OPEN=0 pour ne rien ouvrir)
  if (process.env.OPEN !== '0' && (APP_WINDOW)) setTimeout(() => openGameWindow(`http://localhost:${PORT}`, true), 300);
  console.log('');
  console.log('  Glaise — serveur prêt');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  Sur cette machine   : http://localhost:${PORT}` + (listenHost === '::' ? `   ou   http://[::1]:${PORT}` : ''));
  const { v6, v4 } = localAddresses();
  for (const a of v6) console.log(`  IPv6${(a.local ? ' (local)' : '').padEnd(8)}        : http://[${a.ip}]:${PORT}`);
  for (const a of v4) console.log(`  IPv4 (réseau local) : http://${a.ip}:${PORT}`);
  if (!v6.length) console.log("  Aucune adresse IPv6 publique détectée sur cette machine.");
  console.log('  ─────────────────────────────────────────────');
  console.log('  Donnez une adresse IPv6 (2xxx:...) à vos amis.');
  console.log('  Pensez à ouvrir le port ' + PORT + ' en TCP dans le pare-feu (PC + box).');
  console.log('  Ctrl+C pour arrêter (le monde est sauvegardé).');
  console.log('');
}
