// Sons procéduraux (WebAudio) : pas, blocs, créatures, combat, interface, et musique générative.
export class Audio {
  constructor() {
    this.ctx = null; this.volume = 0.7; this.musicOn = true; this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.nextMusic = 8;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master);
    // réverbération générée
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.55;
    this.verb.connect(vg); vg.connect(this.music);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusic(on) { this.musicOn = on; }

  // Nœud de sortie spatialisé (gain + panoramique selon la position)
  out(pos, vol = 1, range = 24) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let v = vol, pan = 0;
    if (pos) {
      const L = this.listener, dx = pos[0] - L.x, dy = pos[1] - L.y, dz = pos[2] - L.z;
      const d = Math.hypot(dx, dy, dz);
      v *= Math.max(0, 1 - d / range) ** 1.6;
      if (v < 0.01) return null;
      const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
      pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / (d || 1))) * 0.8;
    }
    g.gain.value = v;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  }

  noise(dest, t, dur, type, freq, q, a, rel = dur) {
    const ctx = this.ctx, s = ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.playbackRate.value = 0.6 + Math.random() * 0.8;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + rel);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5, dur + 0.05);
    return f;
  }

  tone(dest, t, dur, type, f0, f1, a, attack = 0.01) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // Matériaux : fréquence et type de filtre
  static MAT = {
    grass: [2200, 'bandpass', 0.8], dirt: [900, 'lowpass', 1], stone: [1600, 'bandpass', 2.5], wood: [700, 'bandpass', 3],
    sand: [3500, 'highpass', 0.7], snow: [2600, 'bandpass', 0.6], glass: [4200, 'bandpass', 6], cloth: [1200, 'lowpass', 0.7],
    water: [600, 'lowpass', 1], slime: [500, 'lowpass', 4],
  };

  step(mat, pos, vol = 0.35) {
    if (!this.ctx) return;
    const o = this.out(pos, vol); if (!o) return;
    const [f, type, q] = Audio.MAT[mat] || Audio.MAT.stone, t = this.ctx.currentTime;
    this.noise(o, t, 0.12, type, f * (0.85 + Math.random() * 0.3), q, 0.6, 0.1);
    if (mat === 'wood') this.tone(o, t, 0.08, 'sine', 180, 120, 0.25);
    if (mat === 'slime') this.tone(o, t, 0.15, 'sine', 220, 90, 0.3);
  }

  dig(mat, pos) { this.step(mat, pos, 0.4); }

  breakBlock(mat, pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.7); if (!o) return;
    const [f, type, q] = Audio.MAT[mat] || Audio.MAT.stone, t = this.ctx.currentTime;
    this.noise(o, t, 0.3, type, f, q, 0.9, 0.28);
    this.noise(o, t + 0.03, 0.2, 'lowpass', 400, 1, 0.5, 0.2);
    if (mat === 'glass') for (let i = 0; i < 5; i++) this.tone(o, t + i * 0.03, 0.25, 'triangle', 2500 + Math.random() * 3000, 1800, 0.12);
    if (mat === 'wood') this.tone(o, t, 0.2, 'triangle', 140, 70, 0.4);
    if (mat === 'stone') this.tone(o, t, 0.12, 'square', 110, 60, 0.08);
  }

  place(mat, pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.6); if (!o) return;
    const [f, type, q] = Audio.MAT[mat] || Audio.MAT.stone, t = this.ctx.currentTime;
    this.noise(o, t, 0.12, type, f * 0.7, q, 0.8, 0.12);
    this.tone(o, t, 0.1, 'sine', 160, 80, 0.4);
  }

  mob(type, kind, pos) {
    if (!this.ctx) return;
    const hurt = kind === 'hurt', death = kind === 'death';
    const o = this.out(pos, hurt || death ? 0.8 : 0.55); if (!o) return;
    const t = this.ctx.currentTime, ctx = this.ctx;
    const pitch = hurt ? 1.25 : death ? 0.8 : 1;
    switch (type) {
      case 'pig': {
        for (let i = 0; i < (hurt ? 1 : 2); i++) {
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3; f.connect(o);
          this.tone(f, t + i * 0.16, 0.14, 'sawtooth', 260 * pitch, 150 * pitch, 0.9);
          this.noise(f, t + i * 0.16, 0.12, 'bandpass', 700, 2, 0.4);
        }
        break;
      }
      case 'sheep': {
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2.5; f.connect(o);
        const osc = this.tone(f, t, 0.6, 'sawtooth', 330 * pitch, 290 * pitch, 0.7, 0.04);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 28; lg.gain.value = 22;
        lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + 0.7);
        break;
      }
      case 'chicken': {
        for (let i = 0; i < (hurt ? 2 : 3); i++) this.tone(o, t + i * 0.09, 0.07, 'square', 1300 * pitch + Math.random() * 300, 900 * pitch, 0.18);
        break;
      }
      case 'zombie': {
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.connect(o);
        this.tone(f, t, hurt ? 0.35 : 1.1, 'sawtooth', 120 * pitch, 70 * pitch, 0.8, 0.15);
        this.tone(f, t, hurt ? 0.35 : 1.1, 'sawtooth', 124 * pitch, 72 * pitch, 0.5, 0.2);
        this.noise(f, t, 0.8, 'bandpass', 400, 1, 0.3, 0.8);
        break;
      }
      case 'spider': {
        this.noise(o, t, 0.5, 'highpass', 5000, 0.8, 0.5, 0.45);
        for (let i = 0; i < 4; i++) this.noise(o, t + i * 0.06, 0.03, 'bandpass', 2400, 4, 0.5, 0.03);
        if (hurt || death) this.tone(o, t, 0.25, 'square', 400, 180, 0.15);
        break;
      }
      case 'slime': {
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(o);
        this.tone(f, t, 0.18, 'sine', 180 * pitch, 520 * pitch, 0.8);
        this.noise(f, t, 0.15, 'lowpass', 600, 2, 0.4);
        break;
      }
    }
  }

  hurt() {
    if (!this.ctx) return;
    const o = this.out(null, 0.8), t = this.ctx.currentTime;
    this.tone(o, t, 0.22, 'triangle', 330, 160, 0.8);
    this.noise(o, t, 0.1, 'bandpass', 900, 1.5, 0.5);
  }
  hit(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.7); if (!o) return;
    const t = this.ctx.currentTime;
    this.noise(o, t, 0.1, 'lowpass', 1200, 1, 0.9, 0.1);
    this.tone(o, t, 0.1, 'sine', 140, 60, 0.6);
  }
  swing() {
    if (!this.ctx) return;
    const o = this.out(null, 0.25), t = this.ctx.currentTime;
    const f = this.noise(o, t, 0.16, 'bandpass', 800, 1.5, 0.6, 0.15);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.15);
  }
  pickup() {
    if (!this.ctx) return;
    const o = this.out(null, 0.35), t = this.ctx.currentTime;
    this.tone(o, t, 0.1, 'sine', 700 + Math.random() * 400, 1500, 0.5);
  }
  eat() {
    if (!this.ctx) return;
    const o = this.out(null, 0.5), t = this.ctx.currentTime;
    this.noise(o, t, 0.12, 'bandpass', 1800 + Math.random() * 800, 1.5, 0.8, 0.1);
  }
  burp() {
    if (!this.ctx) return;
    const o = this.out(null, 0.4), t = this.ctx.currentTime;
    this.tone(o, t, 0.25, 'sawtooth', 110, 80, 0.3);
  }
  craft() {
    if (!this.ctx) return;
    const o = this.out(null, 0.45), t = this.ctx.currentTime;
    this.noise(o, t, 0.08, 'bandpass', 1500, 2, 0.7);
    this.tone(o, t + 0.05, 0.25, 'triangle', 880, 880, 0.25);
    this.tone(o, t + 0.12, 0.3, 'triangle', 1320, 1320, 0.2);
  }
  click() {
    if (!this.ctx) return;
    const o = this.out(null, 0.3), t = this.ctx.currentTime;
    this.tone(o, t, 0.05, 'square', 1200, 900, 0.12);
  }
  splash(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.6); if (!o) return;
    const t = this.ctx.currentTime;
    this.noise(o, t, 0.5, 'lowpass', 1400, 0.8, 0.7, 0.45);
  }
  toolBreak() {
    if (!this.ctx) return;
    const o = this.out(null, 0.6), t = this.ctx.currentTime;
    this.noise(o, t, 0.3, 'highpass', 3000, 1, 0.8, 0.3);
    this.tone(o, t, 0.3, 'square', 900, 300, 0.15);
  }
  death() {
    if (!this.ctx) return;
    const o = this.out(null, 0.8), t = this.ctx.currentTime;
    [392, 330, 262, 196].forEach((f, i) => this.tone(o, t + i * 0.22, 0.5, 'triangle', f, f * 0.98, 0.35));
  }

  // ------------------------------------------------------------ armes à feu
  dist(pos) { const L = this.listener; return pos ? Math.hypot(pos[0] - L.x, pos[1] - L.y, pos[2] - L.z) : 0; }
  gunshot(cat, pos, sil) {
    if (!this.ctx) return;
    const ctx = this.ctx, d = this.dist(pos);
    const o = this.out(pos, sil ? 0.45 : 1, sil ? 45 : 330); if (!o) return;
    const t = ctx.currentTime + d / 340;
    let dest = o;
    if (d > 35) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(260, 2600 - d * 9); f.connect(o); dest = f; }
    if (sil) {
      this.noise(dest, t, 0.07, 'highpass', 2600, 0.7, 0.7, 0.06);
      this.tone(dest, t, 0.05, 'sine', 420, 160, 0.35);
      this.noise(dest, t + 0.012, 0.03, 'bandpass', 3200, 3, 0.35, 0.03);
      return;
    }
    const [pf, len] = { pistol: [1, 0.8], smg: [1.15, 0.7], rifle: [0.8, 1.1], shotgun: [0.6, 1.4], sniper: [0.55, 1.7] }[cat] || [1, 1];
    this.noise(dest, t, 0.08 * len, 'bandpass', 1900 * pf, 0.5, 1, 0.07 * len);
    this.noise(dest, t, 0.35 * len, 'lowpass', 1000 * pf, 0.7, 0.85, 0.3 * len);
    this.tone(dest, t, 0.2 * len, 'sine', 150 * pf, 42, 1);
    this.tone(dest, t, 0.06, 'square', 90 * pf, 50, 0.25);
    // écho de la vallée
    this.noise(dest, t + 0.08 + d / 900, 1.1 * len, 'lowpass', 420, 0.5, 0.22, 1 * len);
  }
  gunFx(kind) {
    if (!this.ctx) return;
    const o = this.out(null, 0.5), t = this.ctx.currentTime;
    if (kind === 'dry') { this.tone(o, t, 0.04, 'square', 1800, 1400, 0.15); this.noise(o, t, 0.03, 'bandpass', 3000, 4, 0.3); }
    else if (kind === 'magout') { this.noise(o, t, 0.06, 'bandpass', 1500, 3, 0.6); this.noise(o, t + 0.05, 0.18, 'bandpass', 700, 1, 0.3); }
    else if (kind === 'magin') { this.noise(o, t, 0.05, 'bandpass', 2200, 4, 0.8); this.tone(o, t, 0.05, 'square', 600, 400, 0.12); }
    else if (kind === 'bolt') { this.noise(o, t, 0.05, 'bandpass', 2600, 4, 0.7); this.noise(o, t + 0.12, 0.05, 'bandpass', 1900, 4, 0.7); }
    else if (kind === 'pump') { this.noise(o, t, 0.1, 'bandpass', 900, 2, 0.8); this.noise(o, t + 0.16, 0.08, 'bandpass', 1300, 2, 0.8); }
    else if (kind === 'mode') this.tone(o, t, 0.03, 'square', 2400, 2400, 0.12);
    else if (kind === 'light') this.tone(o, t, 0.02, 'square', 3000, 3000, 0.1);
  }
  impact(pos, mat) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.45, 40); if (!o) return;
    const [f, type, q] = Audio.MAT[mat] || Audio.MAT.stone, t = this.ctx.currentTime;
    this.noise(o, t, 0.06, type, f * 1.4, q, 0.8, 0.05);
    if (mat === 'stone') this.tone(o, t, 0.08, 'triangle', 2600 + Math.random() * 1500, 900, 0.12);
  }
  hitmark(head) {
    if (!this.ctx) return;
    const o = this.out(null, 0.35), t = this.ctx.currentTime;
    this.tone(o, t, 0.05, 'square', head ? 2600 : 1700, head ? 2200 : 1500, 0.12);
    if (head) this.tone(o, t + 0.05, 0.06, 'sine', 3400, 3000, 0.1);
  }
  whiz(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.5, 12); if (!o) return;
    const t = this.ctx.currentTime;
    const f = this.noise(o, t, 0.16, 'bandpass', 4200, 5, 0.8, 0.15);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.15);
  }
  heal() {
    if (!this.ctx) return;
    const o = this.out(null, 0.4), t = this.ctx.currentTime;
    this.noise(o, t, 0.25, 'bandpass', 1200, 1.2, 0.4, 0.22);
  }
  extractTick(k) {
    if (!this.ctx) return;
    const o = this.out(null, 0.3), t = this.ctx.currentTime;
    this.tone(o, t, 0.12, 'sine', 660 + k * 90, 660 + k * 90, 0.3);
  }

  // Musique générative : phrases pentatoniques douces, espacées de silences
  update(dt, day) {
    if (!this.ctx || !this.musicOn) return;
    this.nextMusic -= dt;
    if (this.nextMusic > 0) return;
    this.nextMusic = 40 + Math.random() * 60;
    this.phrase(day);
  }

  phrase(day) {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.1;
    const roots = day > 0.5 ? [261.6, 293.7, 349.2, 392] : [220, 196, 174.6];
    const root = roots[Math.floor(Math.random() * roots.length)];
    const scale = day > 0.5 ? [0, 2, 4, 7, 9, 12, 14, 16] : [0, 3, 5, 7, 10, 12, 15];
    const notes = 8 + Math.floor(Math.random() * 10);
    let t = t0, deg = 2 + Math.floor(Math.random() * 3);
    // nappe
    for (const iv of [0, 7, 12]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = root / 2 * Math.pow(2, iv / 12);
      f.type = 'lowpass'; f.frequency.value = 700;
      const dur = notes * 0.9 + 4;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.06, t0 + 3); g.gain.linearRampToValueAtTime(0, t0 + dur);
      o.connect(f); f.connect(g); g.connect(this.verb); g.connect(this.music);
      o.start(t0); o.stop(t0 + dur + 0.1);
    }
    for (let i = 0; i < notes; i++) {
      deg = Math.max(0, Math.min(scale.length - 1, deg + Math.floor(Math.random() * 5) - 2));
      const f = root * Math.pow(2, scale[deg] / 12);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.18;
      o2.connect(g2); g2.connect(g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      o.connect(g); g.connect(this.verb); g.connect(this.music);
      o.start(t); o.stop(t + 2); o2.start(t); o2.stop(t + 2);
      t += [0.45, 0.9, 0.9, 1.35, 0.45][Math.floor(Math.random() * 5)];
    }
  }
}
