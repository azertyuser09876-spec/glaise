// Mathématiques 3D minimales (matrices 4×4 colonne-major, façon gl-matrix).
// Toutes les opérations « m = m × R » se font en place.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const angleLerp = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export const mat4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  copy(o, a) { o.set(a); return o; },
  mul(o, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
      o[i * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
      o[i * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
      o[i * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    }
    return o;
  },
  translate(m, x, y, z) {
    m[12] += m[0] * x + m[4] * y + m[8] * z;
    m[13] += m[1] * x + m[5] * y + m[9] * z;
    m[14] += m[2] * x + m[6] * y + m[10] * z;
    m[15] += m[3] * x + m[7] * y + m[11] * z;
    return m;
  },
  scale(m, x, y, z) {
    for (let i = 0; i < 4; i++) { m[i] *= x; m[4 + i] *= y; m[8 + i] *= z; }
    return m;
  },
  rotX(m, a) {
    if (!a) return m;
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < 4; i++) {
      const c1 = m[4 + i], c2 = m[8 + i];
      m[4 + i] = c1 * c + c2 * s;
      m[8 + i] = c2 * c - c1 * s;
    }
    return m;
  },
  rotY(m, a) {
    if (!a) return m;
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < 4; i++) {
      const c0 = m[i], c2 = m[8 + i];
      m[i] = c0 * c - c2 * s;
      m[8 + i] = c0 * s + c2 * c;
    }
    return m;
  },
  rotZ(m, a) {
    if (!a) return m;
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < 4; i++) {
      const c0 = m[i], c1 = m[4 + i];
      m[i] = c0 * c + c1 * s;
      m[4 + i] = c1 * c - c0 * s;
    }
    return m;
  },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  },
  invert(o, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
};

// Plans du tronc de vision (Gribb-Hartmann) extraits d'une matrice VP.
export function frustumPlanes(m, out = new Float32Array(24)) {
  const rows = [
    [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
    [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
    [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
    [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
    [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
    [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],
  ];
  rows.forEach((r, i) => { const l = Math.hypot(r[0], r[1], r[2]) || 1; for (let k = 0; k < 4; k++) out[i * 4 + k] = r[k] / l; });
  return out;
}

export function boxInFrustum(p, x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < 24; i += 4) {
    const a = p[i], b = p[i + 1], c = p[i + 2], d = p[i + 3];
    if (a * (a > 0 ? x1 : x0) + b * (b > 0 ? y1 : y0) + c * (c > 0 ? z1 : z0) + d < 0) return false;
  }
  return true;
}

// Projette un point monde vers l'écran (pixels CSS). Renvoie null si derrière la caméra.
export function project(vp, x, y, z, w, h) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw < 0.05) return null;
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (1 - (cy / cw * 0.5 + 0.5)) * h, d: cw };
}
