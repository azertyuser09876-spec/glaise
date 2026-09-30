// Rendu WebGL2 : terrain (texture array), ciel procédural, entités (lot dynamique), lignes.
import { mat4, frustumPlanes, boxInFrustum } from './math.js';
import { HEIGHT } from '../shared/blocks.js';
import { FACES } from './mesher.js';

const CHUNK_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aUV;
layout(location=2) in vec4 aL;
uniform mat4 uVP;
uniform vec3 uOff;
uniform vec3 uCam;
uniform float uTime;
out vec3 vUV;
out vec3 vL;
out vec3 vRel;
void main() {
  vec3 p = aPos / 16.0 + uOff;
  vec3 wp = p + uCam;
  float fl = aUV.w;
  if (fl == 1.0) {
    p.x += sin(uTime * 1.6 + wp.x * 0.9 + wp.y * 0.6) * 0.018;
    p.z += cos(uTime * 1.3 + wp.z * 0.8 + wp.y * 0.4) * 0.018;
  } else if (fl == 2.0) {
    p.x += sin(uTime * 2.1 + wp.x * 0.7 + wp.z * 0.3) * 0.07;
    p.z += cos(uTime * 1.7 + wp.z * 0.6 + wp.x * 0.2) * 0.05;
  } else if (fl == 3.0 && mod(aPos.y, 16.0) == 14.0) {
    p.y += sin(uTime * 1.4 + wp.x * 0.9 + wp.z * 0.7) * 0.025 - 0.02;
  }
  vUV = vec3(aUV.x / 16.0, aUV.y / 16.0, aUV.z);
  if (fl == 3.0) vUV.xy += vec2(uTime * 0.03, uTime * 0.017);
  vL = aL.xyz;
  vRel = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;

const LIGHT_FN = `
uniform vec3 uSkyTint;
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform vec4 uHand;
uniform float uFlicker;
vec3 lighting(float sky, float blk, vec3 rel) {
  if (uHand.w > 0.0) blk = max(blk, clamp(1.0 - length(rel - uHand.xyz) / uHand.w, 0.0, 1.0) * 0.93);
  vec3 s = uSkyTint * (sky * sky * 0.92 + 0.08 * sky);
  vec3 b = vec3(1.0, 0.8, 0.56) * pow(blk, 1.5) * uFlicker;
  return max(s, b) + vec3(0.035, 0.035, 0.045);
}
vec3 fog(vec3 c, vec3 rel) {
  float d = length(rel);
  return mix(c, uFogColor, smoothstep(uFog.x, uFog.y, d));
}`;

const CHUNK_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec3 vUV;
in vec3 vL;
in vec3 vRel;
uniform sampler2DArray uTex;
uniform float uWater;
out vec4 outColor;
${LIGHT_FN}
void main() {
  vec4 t = texture(uTex, vUV);
  if (uWater < 0.5 && t.a < 0.5) discard;
  vec3 c = t.rgb * lighting(vL.y, vL.z, vRel) * vL.x;
  outColor = vec4(fog(c, vRel), uWater > 0.5 ? t.a : 1.0);
}`;

const SKY_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vNdc;
void main() { vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform mat4 uInv;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform float uDay;
uniform float uTime;
uniform vec3 uCam;
uniform float uUnder;
out vec4 outColor;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec4 w = uInv * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-h * 3.0, 0.0, 1.0));
  // lueur du lever / coucher
  float sd = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5)), 0.0);
  col += uGlow * pow(sd, 6.0) * exp(-abs(h) * 5.0);
  // étoiles
  if (uDay < 0.6 && h > 0.0) {
    vec3 sp = floor(d * 260.0);
    float s = h3(sp);
    if (s > 0.9975) col += vec3(0.85, 0.88, 1.0) * (1.0 - uDay / 0.6) * (0.5 + 0.5 * sin(uTime * 2.0 + s * 500.0)) * smoothstep(0.0, 0.2, h);
  }
  // soleil et lune (carrés)
  vec3 sun = uSunDir;
  vec3 tA = normalize(cross(sun, vec3(0.0, 0.0, 1.0)));
  vec3 tB = cross(sun, tA);
  float ds = dot(d, sun);
  if (ds > 0.0) {
    vec2 q = vec2(dot(d, tA), dot(d, tB)) / ds;
    float m = max(abs(q.x), abs(q.y));
    col += vec3(1.0, 0.92, 0.7) * (smoothstep(0.075, 0.068, m) * 1.4 + smoothstep(0.35, 0.0, m) * 0.25);
  } else {
    vec2 q = vec2(dot(d, tA), dot(d, tB)) / -ds;
    float m = max(abs(q.x), abs(q.y));
    float crater = step(0.6, h2(floor(q * 40.0)));
    col += vec3(0.85, 0.88, 0.95) * (smoothstep(0.052, 0.046, m) * (0.9 - crater * 0.25) + smoothstep(0.25, 0.0, m) * 0.08);
  }
  // nuages plats à y = 110
  if (h > 0.01) {
    float t = (110.0 - uCam.y) / h;
    if (t > 0.0) {
      vec2 p = uCam.xz + d.xz * t;
      vec2 cp = p * 0.012 + vec2(uTime * 0.012, uTime * 0.004);
      float n = fbm(cp);
      float c = smoothstep(0.52, 0.72, n);
      float fade = exp(-t * 0.0025);
      vec3 cc = mix(vec3(0.16, 0.18, 0.26), vec3(1.0, 0.99, 0.97), uDay) + uGlow * 0.35;
      cc *= 0.82 + 0.18 * smoothstep(0.55, 0.9, n);
      col = mix(col, cc, c * fade * 0.92);
    }
  }
  if (uUnder > 0.5) col = vec3(0.06, 0.16, 0.34) * (0.3 + uDay * 0.7);
  outColor = vec4(col, 1.0);
}`;

const ENT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec4 aL;
uniform mat4 uVP;
out vec2 vUV;
out vec4 vL;
out vec3 vRel;
void main() { vUV = aUV; vL = aL; vRel = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;

const ENT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vL;
in vec3 vRel;
uniform sampler2D uTex;
uniform float uTrans;
uniform float uFull;
out vec4 outColor;
${LIGHT_FN}
void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a < (uTrans > 0.5 ? 0.02 : 0.5)) discard;
  vec3 c = t.rgb * (uFull > 0.5 ? vec3(1.0) : lighting(vL.y, vL.z, vRel)) * vL.x;
  c = mix(c, vec3(1.0, 0.15, 0.1), vL.w * 0.55);
  outColor = vec4(uFull > 0.5 ? c : fog(c, vRel), uTrans > 0.5 ? t.a : 1.0);
}`;

const LINE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
void main() { gl_Position = uVP * vec4(aPos, 1.0); }`;
const LINE_FS = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }`;

const MAX_QUADS = 98304;
const ZERO3 = [0, 0, 0];
const LDIR = (() => { const l = Math.hypot(0.35, 1, 0.55); return [0.35 / l, 1 / l, 0.55 / l]; })();

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl; this.canvas = canvas;
    this.chunkProg = this.program(CHUNK_VS, CHUNK_FS);
    this.skyProg = this.program(SKY_VS, SKY_FS);
    this.entProg = this.program(ENT_VS, ENT_FS);
    this.lineProg = this.program(LINE_VS, LINE_FS);
    // index partagé pour des quads (TL,BL,BR,TR → 0,1,2 / 0,2,3)
    const idx = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) { const o = q * 6, v = q * 4; idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    // triangle plein écran
    this.skyVao = gl.createVertexArray();
    gl.bindVertexArray(this.skyVao);
    const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // lot d'entités
    this.entVao = gl.createVertexArray();
    gl.bindVertexArray(this.entVao);
    this.entVbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.entVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 9 * 4 * 8192, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    // lignes
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    this.lineVbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 3 * 256, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);

    this.proj = mat4.create(); this.view = mat4.create(); this.vp = mat4.create();
    this.vpRot = mat4.create(); this.inv = mat4.create(); this.planes = new Float32Array(24);
    this.cam = [0, 0, 0];
    this.batch = new EntityBatch(this);
    this.chunks = new Set();
    this.stats = { drawn: 0, quads: 0 };
    this.fov = 75;
  }

  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader : ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Programme : ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  // ------------------------------------------------------------ textures
  loadAssets(A) {
    const gl = this.gl;
    const n = A.layerImgs.length;
    this.blockTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blockTex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    A.layerImgs.forEach((img, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, 16, 16, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.data.buffer)));
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, 4);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.atlas = this.texture2D(A.atlas);
    this.skins = {};
    for (const k in A.skins) this.skins[k] = this.texture2D(A.skins[k]);
  }

  texture2D(img) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, img.w, img.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.data.buffer));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    t.w = img.w; t.h = img.h;
    return t;
  }
  freeTexture(t) { if (t) this.gl.deleteTexture(t); }

  // ------------------------------------------------------------ tronçons
  makeMesh(bytes) {
    const gl = this.gl;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, false, 16, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 16, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);
    return { vao, vbo };
  }

  uploadChunk(c, r) {
    this.freeChunk(c);
    const quadsO = Math.min(r.nOpaque, MAX_QUADS), quadsW = Math.min(r.nWater, MAX_QUADS);
    c.gpu = {
      o: quadsO ? this.makeMesh(r.opaque) : null, no: quadsO,
      w: quadsW ? this.makeMesh(r.water) : null, nw: quadsW,
    };
    this.chunks.add(c);
  }

  freeChunk(c) {
    if (!c.gpu) return;
    const gl = this.gl;
    for (const m of [c.gpu.o, c.gpu.w]) if (m) { gl.deleteBuffer(m.vbo); gl.deleteVertexArray(m.vao); }
    c.gpu = null;
    this.chunks.delete(c);
  }

  // ------------------------------------------------------------ image
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr || 2) * (this.resScale || 1);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.gl.viewport(0, 0, w, h);
  }

  // env : { time, day, sunDir, skyTint, fogColor, zenith, horizon, glow, fogNear, fogFar, under, hand, flicker, t }
  setCamera(eye, yaw, pitch, env, extra) {
    const aspect = this.canvas.width / this.canvas.height;
    mat4.perspective(this.proj, (this.fov * (extra?.fovMul || 1)) * Math.PI / 180, aspect, 0.05, 1000);
    this.cam = eye;
    const v = this.view;
    mat4.identity(v);
    if (extra?.roll) mat4.rotZ(v, extra.roll);
    mat4.rotX(v, -pitch);
    mat4.rotY(v, -yaw);
    mat4.mul(this.vpRot, this.proj, v);
    mat4.copy(this.vp, this.vpRot);
    mat4.invert(this.inv, this.vpRot);
    // plans de vision en coordonnées relatives à la caméra
    frustumPlanes(this.vp, this.planes);
    this.env = env;
    // matrice monde absolue (pour projeter les étiquettes)
    this.vpWorld = mat4.copy(this.vpWorld || mat4.create(), this.vp);
    mat4.translate(this.vpWorld, -eye[0], -eye[1], -eye[2]);
  }

  setLightUniforms(prog) {
    const gl = this.gl, u = prog.u, e = this.env;
    gl.uniform3fv(u.uSkyTint, e.skyTint);
    gl.uniform3fv(u.uFogColor, e.fogColor);
    gl.uniform2f(u.uFog, e.fogNear, e.fogFar);
    gl.uniform4fv(u.uHand, e.hand);
    gl.uniform1f(u.uFlicker, e.flicker);
  }

  drawSky() {
    const gl = this.gl, P = this.skyProg, e = this.env;
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uInv, false, this.inv);
    gl.uniform3fv(P.u.uSunDir, e.sunDir);
    gl.uniform3fv(P.u.uZenith, e.zenith);
    gl.uniform3fv(P.u.uHorizon, e.horizon);
    gl.uniform3fv(P.u.uGlow, e.glow);
    gl.uniform1f(P.u.uDay, e.day);
    gl.uniform1f(P.u.uTime, e.t);
    gl.uniform3fv(P.u.uCam, this.cam);
    gl.uniform1f(P.u.uUnder, e.under ? 1 : 0);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
  }

  drawWorld() {
    const gl = this.gl, P = this.chunkProg, cam = this.cam, e = this.env;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
    gl.uniform3fv(P.u.uCam, cam);
    gl.uniform1f(P.u.uTime, e.t);
    gl.uniform1f(P.u.uWater, 0);
    gl.uniform1i(P.u.uTex, 0);
    this.setLightUniforms(P);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blockTex);
    const vis = [];
    let quads = 0;
    const maxD = (e.fogFar + 24) ** 2;
    for (const c of this.chunks) {
      const x0 = c.cx * 16 - cam[0], z0 = c.cz * 16 - cam[2];
      const dx = x0 + 8, dz = z0 + 8;
      if (dx * dx + dz * dz > maxD) continue;
      if (!boxInFrustum(this.planes, x0, -cam[1], z0, x0 + 16, HEIGHT - cam[1], z0 + 16)) continue;
      vis.push(c);
      c._d = dx * dx + dz * dz;
      const m = c.gpu.o;
      if (!m) continue;
      gl.uniform3f(P.u.uOff, x0, -cam[1], z0);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, c.gpu.no * 6, gl.UNSIGNED_INT, 0);
      quads += c.gpu.no;
    }
    this.stats.drawn = vis.length; this.stats.quads = quads;
    this.visible = vis;
  }

  drawWater() {
    const gl = this.gl, P = this.chunkProg, cam = this.cam;
    gl.useProgram(P.p);
    gl.uniform1f(P.u.uWater, 1);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blockTex);
    const vis = (this.visible || []).filter((c) => c.gpu && c.gpu.w).sort((a, b) => b._d - a._d);
    for (const c of vis) {
      gl.uniform3f(P.u.uOff, c.cx * 16 - cam[0], -cam[1], c.cz * 16 - cam[2]);
      gl.bindVertexArray(c.gpu.w.vao);
      gl.drawElements(gl.TRIANGLES, c.gpu.nw * 6, gl.UNSIGNED_INT, 0);
    }
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }

  drawLines(pts, color) {
    const gl = this.gl, P = this.lineProg, cam = this.cam;
    const a = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 3) { a[i] = pts[i] - cam[0]; a[i + 1] = pts[i + 1] - cam[1]; a[i + 2] = pts[i + 2] - cam[2]; }
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
    gl.uniform4fv(P.u.uColor, color);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
    gl.drawArrays(gl.LINES, 0, a.length / 3);
    gl.disable(gl.BLEND);
  }

  // Boîte de sélection d'un bloc
  outline(x0, y0, z0, x1, y1, z1) {
    const e = 0.003;
    x0 -= e; y0 -= e; z0 -= e; x1 += e; y1 += e; z1 += e;
    const p = [];
    const edge = (a, b, c, d, f, g) => p.push(a, b, c, d, f, g);
    for (const y of [y0, y1]) { edge(x0, y, z0, x1, y, z0); edge(x1, y, z0, x1, y, z1); edge(x1, y, z1, x0, y, z1); edge(x0, y, z1, x0, y, z0); }
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) edge(x, y0, z, x, y1, z);
    this.drawLines(p, [0.05, 0.06, 0.05, 0.75]);
  }
}

// ------------------------------------------------------------------ lot d'entités
// Sommet : x,y,z (relatifs à la caméra), u,v, ombrage, ciel, torche, flash
export class EntityBatch {
  constructor(r) { this.r = r; this.lists = new Map(); this.full = new Map(); }
  list(tex, trans, full) {
    const m = full ? this.full : this.lists;
    const k = tex;
    let l = m.get(k);
    if (!l) { l = { tex, o: new Float32Array(9 * 4 * 512), no: 0, t: new Float32Array(9 * 4 * 128), nt: 0 }; m.set(k, l); }
    return l;
  }
  push(l, trans, v) {
    const key = trans ? 't' : 'o', nk = trans ? 'nt' : 'no';
    let a = l[key];
    if ((l[nk] + 4) * 9 > a.length) { const b = new Float32Array(a.length * 2); b.set(a); a = l[key] = b; }
    a.set(v, l[nk] * 9);
    l[nk] += 4;
  }
  // quad : 4 sommets (TL, TR, BR, BL) en coordonnées monde, uv en pixels de texture
  quad(tex, p, uv, tw, th, L, trans, full, shade = 1) {
    const l = this.list(tex, trans, full), c = full ? ZERO3 : this.r.cam;
    const ord = [0, 3, 2, 1];
    const v = new Array(36);
    for (let i = 0; i < 4; i++) {
      const k = ord[i], o = i * 9;
      v[o] = p[k * 3] - c[0]; v[o + 1] = p[k * 3 + 1] - c[1]; v[o + 2] = p[k * 3 + 2] - c[2];
      v[o + 3] = uv[k * 2] / tw; v[o + 4] = uv[k * 2 + 1] / th;
      v[o + 5] = shade; v[o + 6] = L.sky; v[o + 7] = L.blk; v[o + 8] = L.flash || 0;
    }
    this.push(l, trans, v);
  }
  // Boîte transformée par la matrice m, avec le patron UV façon « skin »
  box(m, x0, y0, z0, w, h, d, u, v, tw, th, L, trans, tex, full) {
    const pts = new Array(24);
    for (let i = 0; i < 8; i++) {
      const X = x0 + (i & 1 ? w : 0), Y = y0 + (i & 2 ? h : 0), Z = z0 + (i & 4 ? d : 0);
      pts[i * 3] = m[0] * X + m[4] * Y + m[8] * Z + m[12];
      pts[i * 3 + 1] = m[1] * X + m[5] * Y + m[9] * Z + m[13];
      pts[i * 3 + 2] = m[2] * X + m[6] * Y + m[10] * Z + m[14];
    }
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h)), D = Math.max(0, Math.round(d));
    const reg = [
      [u + D, v, W, D], [u + D + W, v, W, D], [u + D, v + D, W, H], [u + 2 * D + W, v + D, W, H], [u + D + W, v + D, D, H], [u, v + D, D, H],
    ];
    const p = new Array(12), uv = new Array(8);
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      for (let k = 0; k < 4; k++) {
        const c = F.c[k], ci = (c[0] ? 1 : 0) | (c[1] ? 2 : 0) | (c[2] ? 4 : 0);
        p[k * 3] = pts[ci * 3]; p[k * 3 + 1] = pts[ci * 3 + 1]; p[k * 3 + 2] = pts[ci * 3 + 2];
      }
      const [ru, rv, rw, rh] = reg[f];
      uv[0] = ru; uv[1] = rv; uv[2] = ru + rw; uv[3] = rv; uv[4] = ru + rw; uv[5] = rv + rh; uv[6] = ru; uv[7] = rv + rh;
      const n = F.n;
      let nx = m[0] * n[0] + m[4] * n[1] + m[8] * n[2], ny = m[1] * n[0] + m[5] * n[1] + m[9] * n[2], nz = m[2] * n[0] + m[6] * n[1] + m[10] * n[2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      const dt = (nx * LDIR[0] + ny * LDIR[1] + nz * LDIR[2]) / nl;
      const shade = dt > 0 ? 0.62 + 0.38 * dt : 0.62 + 0.14 * dt;
      this.quad(tex, p, uv, tw, th, L, trans, full, shade);
    }
  }
  // Cube de bloc (textures de l'atlas) transformé par m ; tiles : 6 coins [u,v] des faces
  blockCube(m, tiles, L, trans, full, s = 1) {
    const atlas = this.r.atlas;
    const pts = new Array(24);
    for (let i = 0; i < 8; i++) {
      const X = (i & 1 ? 0.5 : -0.5) * s, Y = (i & 2 ? 1 : 0) * s, Z = (i & 4 ? 0.5 : -0.5) * s;
      pts[i * 3] = m[0] * X + m[4] * Y + m[8] * Z + m[12];
      pts[i * 3 + 1] = m[1] * X + m[5] * Y + m[9] * Z + m[13];
      pts[i * 3 + 2] = m[2] * X + m[6] * Y + m[10] * Z + m[14];
    }
    const p = new Array(12), uv = new Array(8), e = 0.02;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      for (let k = 0; k < 4; k++) {
        const c = F.c[k], ci = (c[0] ? 1 : 0) | (c[1] ? 2 : 0) | (c[2] ? 4 : 0);
        p[k * 3] = pts[ci * 3]; p[k * 3 + 1] = pts[ci * 3 + 1]; p[k * 3 + 2] = pts[ci * 3 + 2];
      }
      const [tu, tv] = tiles[f];
      uv[0] = tu + e; uv[1] = tv + e; uv[2] = tu + 16 - e; uv[3] = tv + e; uv[4] = tu + 16 - e; uv[5] = tv + 16 - e; uv[6] = tu + e; uv[7] = tv + 16 - e;
      const n = F.n;
      const nx = m[0] * n[0] + m[4] * n[1] + m[8] * n[2], ny = m[1] * n[0] + m[5] * n[1] + m[9] * n[2], nz = m[2] * n[0] + m[6] * n[1] + m[10] * n[2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      const dt = (nx * LDIR[0] + ny * LDIR[1] + nz * LDIR[2]) / nl;
      this.quad(atlas, p, uv, 256, 256, L, trans, full, dt > 0 ? 0.62 + 0.38 * dt : 0.62 + 0.14 * dt);
    }
  }
  // Boîte quelconque (x0..x1) transformée par m, texturée par une tuile de l'atlas
  tileBox(m, x0, y0, z0, x1, y1, z1, tile, L, full) {
    const atlas = this.r.atlas, pts = this._pts || (this._pts = new Array(24)), p = new Array(12), uv = new Array(8);
    for (let i = 0; i < 8; i++) {
      const X = i & 1 ? x1 : x0, Y = i & 2 ? y1 : y0, Z = i & 4 ? z1 : z0;
      pts[i * 3] = m[0] * X + m[4] * Y + m[8] * Z + m[12];
      pts[i * 3 + 1] = m[1] * X + m[5] * Y + m[9] * Z + m[13];
      pts[i * 3 + 2] = m[2] * X + m[6] * Y + m[10] * Z + m[14];
    }
    const [tu, tv] = tile;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      for (let k = 0; k < 4; k++) {
        const c = F.c[k], ci = (c[0] ? 1 : 0) | (c[1] ? 2 : 0) | (c[2] ? 4 : 0);
        p[k * 3] = pts[ci * 3]; p[k * 3 + 1] = pts[ci * 3 + 1]; p[k * 3 + 2] = pts[ci * 3 + 2];
      }
      // taille de la face en pixels -> portion de tuile (évite l'étirement du bruit)
      const n = F.n, fw = n[0] ? Math.abs(z1 - z0) : Math.abs(x1 - x0), fh = n[1] ? Math.abs(z1 - z0) : Math.abs(y1 - y0);
      const uw = Math.max(1, Math.min(15, fw * 2)), vh = Math.max(1, Math.min(15, fh * 2));
      uv[0] = tu + 0.5; uv[1] = tv + 0.5; uv[2] = tu + 0.5 + uw; uv[3] = tv + 0.5; uv[4] = tu + 0.5 + uw; uv[5] = tv + 0.5 + vh; uv[6] = tu + 0.5; uv[7] = tv + 0.5 + vh;
      const nx = m[0] * n[0] + m[4] * n[1] + m[8] * n[2], ny = m[1] * n[0] + m[5] * n[1] + m[9] * n[2], nz = m[2] * n[0] + m[6] * n[1] + m[10] * n[2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      const dt = (nx * LDIR[0] + ny * LDIR[1] + nz * LDIR[2]) / nl;
      this.quad(atlas, p, uv, 256, 256, L, false, full, dt > 0 ? 0.62 + 0.38 * dt : 0.62 + 0.14 * dt);
    }
  }
  // Traînée lumineuse (balle traçante) : segment p0-p1 face à la caméra
  streak(p0, p1, width, tile, L) {
    const c = this.r.cam;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const mx = (p0[0] + p1[0]) / 2 - c[0], my = (p0[1] + p1[1]) / 2 - c[1], mz = (p0[2] + p1[2]) / 2 - c[2];
    let wx = dy * mz - dz * my, wy = dz * mx - dx * mz, wz = dx * my - dy * mx;
    const wl = Math.hypot(wx, wy, wz) || 1;
    wx *= width / wl; wy *= width / wl; wz *= width / wl;
    const p = [p1[0] + wx, p1[1] + wy, p1[2] + wz, p1[0] - wx, p1[1] - wy, p1[2] - wz, p0[0] - wx, p0[1] - wy, p0[2] - wz, p0[0] + wx, p0[1] + wy, p0[2] + wz];
    const [tu, tv] = tile;
    this.quad(this.r.atlas, p, [tu + 2, tv + 2, tu + 14, tv + 2, tu + 14, tv + 14, tu + 2, tv + 14], 256, 256, L, true, false, 1);
  }
  // Sprite extrudé (maille précalculée par extrudeIcon), tuile [u,v] dans l'atlas
  sprite(m, quads, tile, L, full) {
    const atlas = this.r.atlas, p = new Array(12), uv = new Array(8);
    for (const q of quads) {
      for (let k = 0; k < 4; k++) {
        const X = (q[k * 3] - 8) / 16, Y = q[k * 3 + 1] / 16, Z = q[k * 3 + 2] / 16;
        p[k * 3] = m[0] * X + m[4] * Y + m[8] * Z + m[12];
        p[k * 3 + 1] = m[1] * X + m[5] * Y + m[9] * Z + m[13];
        p[k * 3 + 2] = m[2] * X + m[6] * Y + m[10] * Z + m[14];
      }
      const u0 = tile[0] + q[12], v0 = tile[1] + q[13], u1 = tile[0] + q[14], v1 = tile[1] + q[15];
      uv[0] = u0; uv[1] = v0; uv[2] = u1; uv[3] = v0; uv[4] = u1; uv[5] = v1; uv[6] = u0; uv[7] = v1;
      const nx = m[0] * q[16] + m[4] * q[17] + m[8] * q[18], ny = m[1] * q[16] + m[5] * q[17] + m[9] * q[18], nz = m[2] * q[16] + m[6] * q[17] + m[10] * q[18];
      const nl = Math.hypot(nx, ny, nz) || 1;
      const dt = (nx * LDIR[0] + ny * LDIR[1] + nz * LDIR[2]) / nl;
      this.quad(atlas, p, uv, 256, 256, L, false, full, 0.66 + 0.34 * Math.abs(dt));
    }
  }
  // Particule (billboard) : centre, taille, tuile atlas + sous-région
  billboard(x, y, z, size, u0, v0, u1, v1, L, right, up, trans = false) {
    const hs = size / 2, p = new Array(12);
    const rx = right[0] * hs, ry = right[1] * hs, rz = right[2] * hs, ux = up[0] * hs, uy = up[1] * hs, uz = up[2] * hs;
    p[0] = x - rx + ux; p[1] = y - ry + uy; p[2] = z - rz + uz;
    p[3] = x + rx + ux; p[4] = y + ry + uy; p[5] = z + rz + uz;
    p[6] = x + rx - ux; p[7] = y + ry - uy; p[8] = z + rz - uz;
    p[9] = x - rx - ux; p[10] = y - ry - uy; p[11] = z - rz - uz;
    this.quad(this.r.atlas, p, [u0, v0, u1, v0, u1, v1, u0, v1], 256, 256, L, trans, false, 1);
  }

  flush(full) {
    const r = this.r, gl = r.gl, P = r.entProg;
    const lists = full ? this.full : this.lists;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, full ? r.handVP : r.vp);
    gl.uniform1i(P.u.uTex, 0);
    gl.uniform1f(P.u.uFull, 0);
    r.setLightUniforms(P);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(r.entVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.entVbo);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const draw = (arr, n) => {
      let off = 0;
      while (off < n) {
        const cnt = Math.min(n - off, 4 * 8192);
        gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(off * 9, (off + cnt) * 9), gl.STREAM_DRAW);
        gl.drawElements(gl.TRIANGLES, (cnt / 4) * 6, gl.UNSIGNED_INT, 0);
        off += cnt;
      }
    };
    gl.uniform1f(P.u.uTrans, 0);
    for (const l of lists.values()) { if (!l.no) continue; gl.bindTexture(gl.TEXTURE_2D, l.tex); draw(l.o, l.no); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(P.u.uTrans, 1);
    for (const l of lists.values()) { if (!l.nt) continue; gl.bindTexture(gl.TEXTURE_2D, l.tex); draw(l.t, l.nt); }
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    for (const l of lists.values()) { l.no = 0; l.nt = 0; }
  }
}
