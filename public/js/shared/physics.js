// Physique AABB contre la grille de voxels (joueurs, mobs, objets au sol).
// world doit fournir solid(x, y, z) pour des coordonnées entières.

function hitBox(world, x0, y0, z0, x1, y1, z1) {
  const ax = Math.floor(x0), bx = Math.floor(x1), ay = Math.floor(y0), by = Math.floor(y1), az = Math.floor(z0), bz = Math.floor(z1);
  for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
    if (world.solid(x, y, z)) return true;
  }
  return false;
}

const E = 1e-4, T = 1e-6;

// e : { x, y, z (centre des pieds), vx, vy, vz, w, h }
export function moveEntity(world, e, dt) {
  let dx = e.vx * dt, dy = e.vy * dt, dz = e.vz * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.45));
  dx /= steps; dy /= steps; dz /= steps;
  const hw = e.w / 2;
  const r = { ground: false, hx: false, hz: false, hy: false, fall: 0 };
  for (let s = 0; s < steps; s++) {
    if (dy !== 0) {
      e.y += dy;
      if (hitBox(world, e.x - hw, e.y, e.z - hw, e.x + hw - T, e.y + e.h - T, e.z + hw - T)) {
        if (dy < 0) { e.y = Math.floor(e.y) + 1; r.ground = true; r.fall = -e.vy; }
        else { e.y = Math.floor(e.y + e.h) - e.h - E; }
        e.vy = 0; dy = 0; r.hy = true;
      }
    }
    if (dx !== 0) {
      e.x += dx;
      if (hitBox(world, e.x - hw, e.y, e.z - hw, e.x + hw - T, e.y + e.h - T, e.z + hw - T)) {
        e.x = dx > 0 ? Math.floor(e.x + hw) - hw - E : Math.floor(e.x - hw) + 1 + hw + E;
        e.vx = 0; dx = 0; r.hx = true;
      }
    }
    if (dz !== 0) {
      e.z += dz;
      if (hitBox(world, e.x - hw, e.y, e.z - hw, e.x + hw - T, e.y + e.h - T, e.z + hw - T)) {
        e.z = dz > 0 ? Math.floor(e.z + hw) - hw - E : Math.floor(e.z - hw) + 1 + hw + E;
        e.vz = 0; dz = 0; r.hz = true;
      }
    }
  }
  // Détection du sol quand on est posé (vy = 0)
  if (!r.ground && e.vy <= 0) {
    if (hitBox(world, e.x - hw, e.y - 0.02, e.z - hw, e.x + hw - T, e.y - 0.001, e.z + hw - T)) r.ground = true;
  }
  return r;
}

export function boxHitsSolid(world, x, y, z, w, h) {
  const hw = w / 2;
  return hitBox(world, x - hw, y, z - hw, x + hw - T, y + h - T, z + hw - T);
}
