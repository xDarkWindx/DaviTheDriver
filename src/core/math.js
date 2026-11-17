// Utilidades matemáticas puras (sem three.js) — testáveis em Node.
// Convenção de heading: forward = (sin h, cos h) no plano XZ; h=0 aponta para +Z (sul),
// h=+PI/2 para +X (leste). Virar à esquerda = h aumenta. Igual a object3D.rotation.y = h.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const headingOf = (dx, dz) => Math.atan2(dx, dz);
export const kmh = (mps) => mps * 3.6;
export const mps = (kmhV) => kmhV / 3.6;

/** PRNG determinístico (mulberry32). */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}

/** Semente derivada (para dar a cada sistema seu próprio fluxo a partir da semente da viagem). */
export function deriveSeed(seed, salt) {
  let h = ((seed >>> 0) ^ Math.imul(salt >>> 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) || 1;
}

/** Ruído 1D suave e barato (soma de senos), útil p/ steerNoise etc. Retorna ~[-1,1]. */
export function smoothNoise(t, seed = 0) {
  return (Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 3.1 + seed * 2.3) * 0.3 + Math.sin(t * 7.3 + seed * 0.7) * 0.2);
}
