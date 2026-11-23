// Árvores estilizadas do perfil HD: copa "pintada" feita de centenas de CARTÕES de folha (quads com recorte), agrupados em
// tufos arredondados e irregulares; normais "esferizadas" (do centro do tufo para fora) para o sombreamento ficar macio;
// degradê de cor claro (topo/fora) -> escuro (baixo/dentro) na cor do vértice (a cor da instância = espécie/floração);
// troncos e galhos tortos como tubos gerados por código; leve balanço de vento no vertex shader.
// Cada espécie = UMA geometria (tronco + galhos + cartões), instanciada como antes (mesmas posições/escala/cor do leve;
// colisores não mudam). Recorte por alphaTest (+ alpha-to-coverage com MSAA), sem blending/ordenação; sombra recortada
// pelas folhas via customDepthMaterial. O degrau "sombra reduzida" do ajuste automático corta os cartões (drawRange).
import * as THREE from 'three';
import { makeRng } from '../core/math.js';
import { patchHD, HD, SURF } from '../render/hdMaterials.js';
import { addOcclusionCut } from '../render/materials.js';

// atlas 2x2 (u, v de baixo para cima): [0] cacho de folhas, [1] cacho de flores (ipê), [2] fronde de palmeira, [3] casca (opaco)
const SLOT = { leaf: [0, 0.5], flower: [0.5, 0.5], frond: [0, 0], bark: [0.5, 0] };

/** Atlas das folhas (canvas): formas brancas com nervura/sombra leve; a cor vem do vértice × instância. */
export function makeLeafAtlas(S = 512, anisotropy = 8) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), h = S / 2, rng = makeRng(313);
  g.clearRect(0, 0, S, S);
  // [0] folhas: 6 folhas em leque, ovais pontudas
  const leaf = (cx, cy, len, wid, ang, shade) => {
    g.save(); g.translate(cx, cy); g.rotate(ang);
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(wid, len * 0.45, 0, len); g.quadraticCurveTo(-wid, len * 0.45, 0, 0); g.fill();
    g.strokeStyle = `rgba(150,150,150,.7)`; g.lineWidth = Math.max(1, S / 300); g.beginPath(); g.moveTo(0, len * 0.05); g.lineTo(0, len * 0.92); g.stroke();
    g.restore();
  };
  for (let i = 0; i < 14; i++) { // dois anéis de folhas: o cartão sai "cheio" (copa densa vista de cima)
    const a = (i / 7) * Math.PI * 2 + (rng() - 0.5) * 0.4, inner = i >= 7;
    const ox = inner ? (rng() - 0.5) * h * 0.1 : 0, oy = inner ? (rng() - 0.5) * h * 0.1 : 0;
    leaf(h * 0.5 + ox, h * 0.5 + oy, h * (inner ? 0.3 : 0.44) * (0.9 + rng() * 0.2), h * (inner ? 0.11 : 0.13), a, 200 + rng() * 55 | 0);
  }
  // [1] flores (ipê): cacho de florzinhas de 5 pétalas
  const flower = (cx, cy, r, shade) => {
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    for (let k = 0; k < 5; k++) { const a = k * 1.2566 + rng() * 0.3; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.55, r * 0.38, a, 0, 7); g.fill(); }
    g.fillStyle = `rgb(${shade - 25},${shade - 25},${shade - 30})`; g.beginPath(); g.arc(cx, cy, r * 0.18, 0, 7); g.fill(); // miolo discreto
  };
  for (let i = 0; i < 22; i++) {
    const a = rng() * 6.283, d = Math.sqrt(rng()) * h * 0.36;
    flower(h * 1.5 + Math.cos(a) * d, h * 0.5 + Math.sin(a) * d, h * (0.09 + rng() * 0.05), 205 + rng() * 50 | 0);
  }
  // [2] fronde (palmeira): nervura central + folíolos dos dois lados (comprimento em v)
  g.strokeStyle = 'rgb(200,200,200)'; g.lineWidth = S / 120; g.beginPath(); g.moveTo(h * 0.5, h * 1.02); g.lineTo(h * 0.5, h * 1.98); g.stroke();
  for (let y = h * 1.06; y < h * 1.96; y += h * 0.045) {
    const t = (y - h) / h, L = h * 0.46 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + h * 0.05;
    for (const sgn of [-1, 1]) {
      g.save(); g.translate(h * 0.5, y); g.rotate(sgn * (1.05 - t * 0.4));
      g.fillStyle = `rgb(${215 + rng() * 40 | 0},${215 + rng() * 40 | 0},${215 + rng() * 40 | 0})`;
      g.beginPath(); g.ellipse(0, -L * 0.5, h * 0.022, L * 0.5, 0, 0, 7); g.fill(); g.restore();
    }
  }
  // [3] casca: opaca, ruído vertical
  for (let y = h; y < S; y++) for (let x = h; x < S; x += 2) {
    const v = 175 + 60 * Math.sin(x * 0.21 + Math.sin(y * 0.05) * 3) * 0.5 + rng() * 30 | 0;
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, S - y + h - 1, 2, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy;
  return t;
}

// ------------------------------------------------------------------ espécies
// lobes: [x, y, z, raio, achatamento]; cards: base de cartões (multiplicado por treeLeafCards); light/dark: faixa do degradê
const SPECIES = {
  ipe: { trunk: { h: 3.3, r0: 0.2, r1: 0.11, twist: 0.35, col: 0x8a7058 }, branches: 1, slot: 'flower', size: 0.95, cards: 340, dark: 0.68, light: 1.12,
    lobes: [[0, 4.9, 0, 1.6, 0.62], [1.25, 4.4, 0.4, 1.25, 0.62], [-1.1, 4.5, -0.5, 1.3, 0.62], [0.3, 4.3, -1.25, 1.15, 0.62], [-0.4, 4.4, 1.2, 1.2, 0.62]] },
  mangueira: { trunk: { h: 2.3, r0: 0.38, r1: 0.22, twist: 0.3, col: 0x7a5e46 }, branches: 1, slot: 'leaf', size: 1.0, cards: 480, dark: 0.42, light: 1.0,
    lobes: [[0, 3.7, 0, 2.5, 0.82], [1.5, 3.2, 0.6, 1.7, 0.85], [-1.4, 3.3, -0.7, 1.8, 0.85], [0.4, 4.7, -0.4, 1.6, 0.8], [-0.6, 3.0, 1.4, 1.5, 0.8], [0.8, 2.9, -1.5, 1.4, 0.8]] },
  jaqueira: { trunk: { h: 4.2, r0: 0.32, r1: 0.2, twist: 0.12, col: 0x9a8e7e }, branches: 1, slot: 'leaf', size: 1.0, cards: 400, dark: 0.34, light: 0.95, jacas: true,
    lobes: [[0, 5.4, 0, 2.0, 1.0], [1.0, 4.5, 0.6, 1.45, 0.9], [-1.0, 4.7, -0.5, 1.5, 0.9], [0.1, 6.6, 0.1, 1.3, 0.9], [-0.3, 4.3, 1.1, 1.2, 0.9]] },
  cerrado: { trunk: { h: 1.9, r0: 0.16, r1: 0.07, twist: 0.9, col: 0x7a5e46 }, branches: 1, slot: 'leaf', size: 0.8, cards: 200, dark: 0.5, light: 1.05,
    lobes: [[0.55, 2.4, 0.2, 1.25, 0.58], [-0.5, 2.25, -0.3, 1.1, 0.58], [0.0, 2.8, 0.0, 0.95, 0.58]] },
  arbusto: { trunk: null, branches: 0, slot: 'leaf', size: 0.62, cards: 100, dark: 0.5, light: 1.05,
    lobes: [[0, 0.55, 0, 0.75, 0.75], [0.6, 0.42, 0.2, 0.55, 0.75], [-0.5, 0.4, -0.2, 0.6, 0.75]] },
  palmeira: { palm: true },
};

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();

class TreeBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.paint = []; this.uv = []; this.wind = []; this.surf = []; }
  vert(p, n, rgb, paint, u, v, w, s) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(rgb[0], rgb[1], rgb[2]);
    this.paint.push(paint); this.uv.push(u, v); this.wind.push(w); this.surf.push(s[0], s[1], s[2], s[3]);
  }
  get count() { return this.pos.length / 3; }
  /** Tubo torto: pts = [Vector3], radii = [r]; casca no atlas; cor fixa (paint 0). */
  tube(pts, radii, hex, sides = 6, windTip = 0) {
    _c.set(hex); const rgb = [_c.r, _c.g, _c.b], [u0, v0] = SLOT.bark;
    const rings = [];
    for (let i = 0; i < pts.length; i++) {
      const t = (i < pts.length - 1 ? _a.subVectors(pts[i + 1], pts[i]) : _a.subVectors(pts[i], pts[i - 1])).clone().normalize();
      const ref = Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const n = new THREE.Vector3().crossVectors(t, ref).normalize(), b = new THREE.Vector3().crossVectors(t, n);
      const ring = [];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2, d = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
        ring.push({ p: pts[i].clone().addScaledVector(d, radii[i]), n: d, u: u0 + 0.5 * (k / sides), v: v0 + 0.5 * ((i / (pts.length - 1)) * 0.9 + 0.05) });
      }
      rings.push(ring);
    }
    const w = (i) => windTip * (i / (pts.length - 1)) ** 2;
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
      const A = rings[i][k], B = rings[i][k + 1], C = rings[i + 1][k + 1], D = rings[i + 1][k];
      for (const [q, ii] of [[A, i], [B, i], [C, i + 1], [A, i], [C, i + 1], [D, i + 1]]) this.vert(q.p, q.n, rgb, 0, q.u, q.v, w(ii), SURF.bark);
    }
  }
  /** Cartão de folha: centro p, normal do cartão cn, normal de sombreamento (esferizada) a partir de `center`. */
  card(p, cn, size, slot, f, center, rng, w) {
    _a.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(cn).normalize();
    if (_a.lengthSq() < 0.5) _a.set(1, 0, 0);
    _b.crossVectors(cn, _a).normalize();
    const [u0, v0] = SLOT[slot], hs = size / 2;
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, -1, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    for (const [sx, sy, u, v] of corners) {
      const q = _v.copy(p).addScaledVector(_a, sx * hs).addScaledVector(_b, sy * hs);
      _n.subVectors(q, center).normalize().lerp(cn, 0.25).normalize();
      this.vert(q, _n, f, 1, u0 + u * 0.5, v0 + v * 0.5, w, SURF.foliage);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('paint', new THREE.Float32BufferAttribute(this.paint, 1));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('wind', new THREE.Float32BufferAttribute(this.wind, 1));
    g.setAttribute('surf', new THREE.Float32BufferAttribute(this.surf, 4));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Caminho torto de (x0,y0,z0) a (x1,y1,z1) em n pontos, com desvio lateral `bend`. */
function crooked(rng, from, to, n, bend) {
  const pts = [];
  let ox = 0, oz = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    if (i > 0 && i < n - 1) { ox += (rng() - 0.5) * bend; oz += (rng() - 0.5) * bend; }
    const k = i === n - 1 ? 0 : 1;
    pts.push(new THREE.Vector3(from.x + (to.x - from.x) * t + ox * k, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t + oz * k));
  }
  return pts;
}

/**
 * Geometria HD da espécie. cardsMul = quality.treeLeafCards (1 = base). Retorna { geometry, cards, cardStart (vértice),
 * triangles, cardArea, crownArea } — cardArea/crownArea ~ sobreposição média de folhas vista de cima (estimativa de overdraw).
 */
export function hdTreeGeometry(species, cardsMul = 1) {
  const S = SPECIES[species], tb = new TreeBuilder(), rng = makeRng(1000 + species.length * 37 + species.charCodeAt(0));
  if (S.palm) return palmGeometry(tb, rng, cardsMul);
  // tronco torto + galhos até dentro de cada tufo
  let top = new THREE.Vector3(0, 0.3, 0);
  if (S.trunk) {
    const T = S.trunk, pts = crooked(rng, new THREE.Vector3(0, -0.05, 0), new THREE.Vector3((rng() - 0.5) * T.twist, T.h, (rng() - 0.5) * T.twist), 6, T.twist);
    tb.tube(pts, pts.map((_, i) => T.r0 + (T.r1 - T.r0) * (i / (pts.length - 1))), T.col, T.r0 > 0.25 ? 8 : 6);
    top = pts[pts.length - 1];
    for (const [lx, ly, lz, r] of S.lobes) {
      const end = new THREE.Vector3(lx * 0.75, ly - r * 0.25, lz * 0.75);
      const bp = crooked(rng, top, end, 4, 0.35);
      tb.tube(bp, bp.map((_, i) => T.r1 * (1 - 0.75 * (i / (bp.length - 1)))), T.col, 5, 0.3);
    }
  }
  if (S.jacas) { // jacas penduradas no tronco (opacas)
    _c.set(0x95a63c);
    const ico = new THREE.IcosahedronGeometry(1, 1), P = ico.attributes.position, NN = ico.attributes.normal;
    for (const [a, y] of [[0.3, 1.6], [1.9, 2.2], [3.4, 1.4], [4.6, 2.8], [5.6, 2.0], [2.7, 3.1]]) {
      for (let i = 0; i < P.count; i++) {
        _v.set(P.getX(i) * 0.2 + Math.cos(a) * 0.38, P.getY(i) * 0.34 + y, P.getZ(i) * 0.2 + Math.sin(a) * 0.38);
        _n.set(NN.getX(i), NN.getY(i), NN.getZ(i));
        tb.vert(_v, _n, [_c.r, _c.g, _c.b], 0, SLOT.bark[0] + 0.25, SLOT.bark[1] + 0.25, 0, SURF.foliage);
      }
    }
    ico.dispose();
  }
  const cardStart = tb.count; // tudo antes daqui (tronco, galhos, jacas) é sempre desenhado
  // tufos: cartões numa casca (mais perto da superfície), viés para cima (a câmera é alta)
  const tot = S.lobes.reduce((s, l) => s + l[3] * l[3], 0), N = Math.round(S.cards * cardsMul);
  let yMin = Infinity, yMax = -Infinity;
  for (const [, ly, , r, sy] of S.lobes) { yMin = Math.min(yMin, ly - r * sy); yMax = Math.max(yMax, ly + r * sy); }
  let cardArea = 0, crownArea = 0;
  const cards = [];
  for (const [lx, ly, lz, r, sy] of S.lobes) {
    crownArea += Math.PI * r * r;
    const n = Math.round(N * (r * r) / tot), center = new THREE.Vector3(lx, ly, lz);
    for (let i = 0; i < n; i++) {
      const y = 1 - 2 * Math.pow(rng(), 1.25), a = rng() * Math.PI * 2, rh = Math.sqrt(Math.max(0, 1 - y * y));
      const d = new THREE.Vector3(Math.cos(a) * rh, y, Math.sin(a) * rh);
      const rr = r * (0.58 + 0.44 * Math.sqrt(rng())) * (rng() < 0.08 ? 1.08 : 1); // algumas folhas soltas na borda
      const p = new THREE.Vector3(lx + d.x * rr, ly + d.y * rr * sy, lz + d.z * rr);
      const cn = d.clone().multiplyScalar(0.75).add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.7)).add(new THREE.Vector3(0, 0.35, 0)).normalize();
      // degradê: alto e de fora = claro; baixo e de dentro = escuro
      const hgt = (p.y - yMin) / Math.max(0.01, yMax - yMin), out = (rr / r - 0.58) / 0.5;
      let t = Math.max(0, Math.min(1, 0.1 + 0.55 * hgt + 0.25 * (0.5 + 0.5 * d.y) + 0.2 * out));
      t = t * t * (3 - 2 * t);
      const base = S.dark + (S.light - S.dark) * t, j = 0.94 + rng() * 0.12;
      const f = [base * j * (0.97 + rng() * 0.06), base * j, base * j * (0.95 + rng() * 0.06)];
      const size = S.size * (0.8 + rng() * 0.5) * (0.75 + 0.25 * r / 1.6);
      cardArea += size * size;
      cards.push({ p, cn, size, f, center, w: 0.6 + 0.4 * hgt, k: rng() });
    }
  }
  cards.sort((a, b) => a.k - b.k); // ordem aleatória: cortar o drawRange tira folhas uniformemente
  for (const c of cards) tb.card(c.p, c.cn, c.size, S.slot, c.f, c.center, rng, c.w);
  const geometry = tb.build();
  return { geometry, cards: cards.length, cardStart, cardVerts: cards.length * 6, triangles: tb.count / 3, cardArea, crownArea };
}

function palmGeometry(tb, rng, cardsMul) {
  const pts = crooked(rng, new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0.35, 7.5, 0.1), 7, 0.15);
  tb.tube(pts, pts.map((_, i) => 0.22 - 0.07 * (i / (pts.length - 1))), 0xb0a088, 7);
  const top = pts[pts.length - 1];
  tb.tube([top.clone().add(new THREE.Vector3(0, -0.4, 0)), top.clone().add(new THREE.Vector3(0, 0.45, 0))], [0.26, 0.18], 0x6f6450, 7);
  const cardStart = tb.count;
  const n = Math.max(8, Math.round(14 * Math.min(1.5, cardsMul)));
  let cardArea = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-dir.z, 0, dir.x);
    const L = 2.6 + rng() * 0.8, W = 0.55 + rng() * 0.15, rise = 0.5 + rng() * 0.4;
    // fronde arqueada em 4 segmentos (sobe e cai), textura da fronde ao longo do comprimento
    const seg = 4, f = 0.7 + rng() * 0.35, base = [f, f, f];
    const P = [];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, along = t * L, y = top.y + 0.25 + rise * Math.sin(t * Math.PI * 0.8) - t * t * 1.3;
      P.push(new THREE.Vector3(top.x, y, top.z).addScaledVector(dir, along + 0.2));
    }
    for (let k = 0; k < seg; k++) {
      const A = P[k], B = P[k + 1], t0 = k / seg, t1 = (k + 1) / seg, [u0, v0] = SLOT.frond;
      const nrm = new THREE.Vector3().subVectors(B, A).cross(side).normalize(); if (nrm.y < 0) nrm.negate();
      const sh = (t) => (t < 0.85 ? 1 : (1 - t) / 0.15);
      const quad = [[A, -1, t0], [B, -1, t1], [B, 1, t1], [A, -1, t0], [B, 1, t1], [A, 1, t0]];
      for (const [Q, s, t] of quad) {
        const q = Q.clone().addScaledVector(side, s * W * 0.5 * sh(t));
        const shade = base.map((x) => x * (0.75 + 0.3 * t));
        tb.vert(q, nrm.clone().lerp(dir, 0.3).normalize(), shade, 1, u0 + (s * 0.5 + 0.5) * 0.5, v0 + (0.02 + t * 0.96) * 0.5, 0.4 + t, SURF.foliage);
      }
      cardArea += L / seg * W;
    }
  }
  const geometry = tb.build();
  return { geometry, cards: n * 4, cardStart, cardVerts: n * 4 * 6, triangles: tb.count / 3, cardArea, crownArea: Math.PI * 3.2 * 3.2 };
}

/** Material das árvores HD (folhas com recorte + casca), máscara de pintura, vento, oclusão; e o de profundidade (sombra). */
export function hdTreeMaterials(atlas) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide,
    roughness: 0.8, metalness: 0, envMapIntensity: 0.6 });
  patchHD(mat, { masked: true, surf: true, wind: true, foliage: true });
  addOcclusionCut(mat, 'tree');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });
  patchHD(depth, { wind: true, cloud: false, depthOnly: true });
  return { mat, depth };
}

/** Registro das geometrias de árvore (o ajuste automático corta os cartões: fração 0..1). */
export const TREE_LOD = { list: [], fraction: 1 };
export function setLeafFraction(f) {
  TREE_LOD.fraction = f;
  for (const t of TREE_LOD.list) t.geometry.setDrawRange(0, f >= 1 ? Infinity : t.cardStart + Math.round(t.cardVerts / 6 * f) * 6);
}
export { HD };
