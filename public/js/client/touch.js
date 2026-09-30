// Commandes tactiles (téléphones, tablettes) : joystick virtuel, visée par glissement, boutons d'action.
import { clamp } from './math.js';
import { GUNS } from '../shared/guns.js';

const $ = (id) => document.getElementById(id);

// Détection : écran tactile principal, ou forcé par ?tactile=1 / ?tactile=0
export const IS_TOUCH = (() => {
  try {
    const q = new URLSearchParams(location.search).get('tactile');
    if (q === '1') return true;
    if (q === '0') return false;
    return matchMedia('(pointer: coarse)').matches;
  } catch { return false; }
})();

// Icônes (traits simples, couleur héritée)
const ICONS = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/></svg>',
  aim: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  crouch: '<svg viewBox="0 0 24 24"><path d="M12 5v13M6 13l6 6 6-6"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M19 8a8 8 0 1 0 1 6"/><path d="M20 3v5h-5"/></svg>',
  use: '<svg viewBox="0 0 24 24"><path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11M16 11V8a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.6L7 14"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  mode: '<svg viewBox="0 0 24 24"><path d="M6 6h3v12H6zM11 6h3v12h-3zM16 6h3v12h-3z"/></svg>',
  light: '<svg viewBox="0 0 24 24"><path d="M9 3h6l-1 7h-4z"/><path d="M10 10h4v4h-4zM12 17v4M7 16l-2 2M17 16l2 2"/></svg>',
  view: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
};

export class TouchControls {
  constructor(g) {
    this.g = g;
    this.joy = null; this.look = null; this.fire = null;
    this.move = { f: 0, s: 0 };
    this.adsOn = false; this.useHeld = false;
    document.body.classList.add('touch');
    this.build();
  }

  build() {
    const root = $('touch');
    root.innerHTML = `
      <div id="t-layer"></div>
      <div id="t-joy"><div class="base"></div><div class="knob"></div></div>
      <div class="t-top">
        <button id="t-pause" aria-label="Pause">${ICONS.pause}</button>
        <button id="t-map" aria-label="Carte">${ICONS.map}</button>
        <button id="t-inv" aria-label="Sac">${ICONS.bag}</button>
        <button id="t-chat" aria-label="Discussion">${ICONS.chat}</button>
        <button id="t-view" aria-label="Vue">${ICONS.view}</button>
      </div>
      <button id="t-fire" class="tb big" aria-label="Tirer">${ICONS.fire}</button>
      <button id="t-aim" class="tb" aria-label="Viser / utiliser">${ICONS.aim}</button>
      <button id="t-jump" class="tb" aria-label="Sauter">${ICONS.jump}</button>
      <button id="t-crouch" class="tb sm" aria-label="S'accroupir">${ICONS.crouch}</button>
      <button id="t-reload" class="tb sm" aria-label="Recharger">${ICONS.reload}</button>
      <button id="t-use" class="tb sm" aria-label="Fouiller">${ICONS.use}</button>
      <button id="t-mode" class="tb xs" aria-label="Mode de tir">${ICONS.mode}</button>
      <button id="t-light" class="tb xs" aria-label="Lampe">${ICONS.light}</button>`;
    const g = this.g;
    const layer = $('t-layer');
    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.moveEv(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) layer.addEventListener(t, (e) => this.up(e));

    const hold = (id, on, off, look) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch { /* */ }
        g.audio.init();
        el.classList.add('on');
        if (look) this.fire = { id: e.pointerId, x: e.clientX, y: e.clientY };
        on();
      });
      const end = (e) => {
        if (look && this.fire && this.fire.id !== e.pointerId) return;
        el.classList.remove('on');
        if (look) this.fire = null;
        off && off();
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      if (look) el.addEventListener('pointermove', (e) => { if (this.fire && this.fire.id === e.pointerId) this.lookBy(e.clientX - this.fire.x, e.clientY - this.fire.y, this.fire, e); });
    };
    const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); g.audio.init(); fn(); });

    hold('t-fire', () => { g.mouse.left = true; g.mouse.leftPressed = true; }, () => { g.mouse.left = false; }, true);
    hold('t-aim', () => {
      if (g.weapons.gun()) { this.adsOn = !this.adsOn; g.mouse.right = this.adsOn; }
      else { this.useHeld = true; g.mouse.right = true; g.mouse.rightPressed = true; }
    }, () => { if (this.useHeld) { this.useHeld = false; g.mouse.right = false; } });
    hold('t-jump', () => { g.keys.Space = true; }, () => { g.keys.Space = false; });
    tap('t-crouch', () => { g.keys.KeyC = !g.keys.KeyC; $('t-crouch').classList.toggle('lock', !!g.keys.KeyC); });
    tap('t-reload', () => g.weapons.reload());
    tap('t-use', () => { if (!g.interact()) g.ui.toast('Rien à fouiller ici', 900); });
    tap('t-mode', () => g.weapons.toggleMode());
    tap('t-light', () => g.weapons.toggleLight());
    tap('t-inv', () => { this.release(); g.openInventory(); });
    tap('t-map', () => { this.release(); g.openMap(); });
    tap('t-pause', () => { this.release(); g.showPause(); });
    tap('t-chat', () => { this.release(); g.openChat(''); });
    tap('t-view', () => { g.view = (g.view + 1) % 3; });
  }

  down(e) {
    const g = this.g;
    if (g.state !== 'play' || g.uiOpen) return;
    e.preventDefault();
    g.audio.init();
    try { $('t-layer').setPointerCapture(e.pointerId); } catch { /* */ }
    if (e.clientX < innerWidth * 0.42 && !this.joy) {
      this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
      const j = $('t-joy');
      j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px';
      j.classList.add('on');
      this.setKnob(0, 0);
    } else if (!this.look) this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  moveEv(e) {
    if (this.joy && e.pointerId === this.joy.id) {
      const R = 56;
      let dx = e.clientX - this.joy.x, dy = e.clientY - this.joy.y;
      const d = Math.hypot(dx, dy);
      // le joystick suit le pouce s'il dépasse beaucoup
      if (d > R * 1.6) { const k = (d - R * 1.6) / d; this.joy.x += dx * k; this.joy.y += dy * k; dx = e.clientX - this.joy.x; dy = e.clientY - this.joy.y; const j = $('t-joy'); j.style.left = this.joy.x + 'px'; j.style.top = this.joy.y + 'px'; }
      const dd = Math.min(R, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
      const kx = Math.cos(a) * dd / R, ky = Math.sin(a) * dd / R;
      this.move.f = Math.abs(ky) < 0.12 ? 0 : -ky; this.move.s = Math.abs(kx) < 0.12 ? 0 : kx;
      this.setKnob(kx * R, ky * R);
    } else if (this.look && e.pointerId === this.look.id) this.lookBy(e.clientX - this.look.x, e.clientY - this.look.y, this.look, e);
  }
  lookBy(dx, dy, st, e) {
    const g = this.g;
    st.x = e.clientX; st.y = e.clientY;
    if (g.state !== 'play' || g.uiOpen) return;
    const s = 0.0055 * g.S.sens / Math.pow(g.weapons.zoom(), 0.85);
    g.player.yaw -= dx * s;
    g.player.pitch = clamp(g.player.pitch - dy * s, -1.55, 1.55);
  }
  up(e) {
    if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.move.f = this.move.s = 0; $('t-joy').classList.remove('on'); }
    if (this.look && e.pointerId === this.look.id) this.look = null;
  }
  setKnob(x, y) { const k = $('t-joy').querySelector('.knob'); k.style.transform = `translate(${x}px, ${y}px)`; }

  // Relâche tout (ouverture d'un menu, mort…)
  release() {
    const g = this.g;
    this.joy = this.look = this.fire = null;
    this.move.f = this.move.s = 0;
    this.adsOn = false; this.useHeld = false;
    g.mouse.left = g.mouse.right = false;
    g.keys.Space = false;
    $('t-joy').classList.remove('on');
    for (const el of document.querySelectorAll('#touch .tb.on')) el.classList.remove('on');
  }

  // Appelé à chaque image : entrées vers le joueur, boutons contextuels
  update(prompt) {
    const g = this.g, inp = g.inp;
    const playing = g.state === 'play' && !g.uiOpen;
    inp.active = playing;
    inp.move = this.move;
    inp.sprint = this.move.f > 0.9 && Math.abs(this.move.s) < 0.45;
    const s = g.weapons.gun();
    if (!s && this.adsOn) { this.adsOn = false; g.mouse.right = false; }
    const key = `${!!s}|${!!prompt}|${s && g.weapons.info(s).st.modes.length > 1}|${s && g.weapons.info(s).st.light}|${this.adsOn}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const root = $('touch');
    root.classList.toggle('gun', !!s);
    root.classList.toggle('prompt', !!prompt);
    root.classList.toggle('modes', !!(s && g.weapons.info(s).st.modes.length > 1));
    root.classList.toggle('lamp', !!(s && g.weapons.info(s).st.light));
    $('t-aim').classList.toggle('lock', this.adsOn);
  }

  // Plein écran et paysage (au premier geste de l'utilisateur)
  fullscreen() {
    const d = document.documentElement;
    try {
      if (!document.fullscreenElement && d.requestFullscreen) {
        d.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch { /* */ } }).catch(() => {});
      }
    } catch { /* iOS : pas de plein écran pour la page */ }
  }
}

export { GUNS };
