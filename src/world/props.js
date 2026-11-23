// Geometrias de props instanciados (árvores por espécie, arbustos, postes, bancos, lixeiras, placas).
// Cada prop = UMA geometria mesclada com cor por vértice + atributo `paint` (1 = recebe a cor da instância,
// ex.: copa da árvore; 0 = mantém a cor, ex.: tronco). Usar com makeMaskedMaterial (render/materials.js).
// Convenção: base em y = 0, "frente" para +Z, medidas reais (m) para escala 1.
import * as THREE from 'three';
import { PartBuilder } from '../player/vehicleModels.js';
import { makeRng } from '../core/math.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySurface } from '../render/hdMaterials.js';

const TRUNK = 0x5a4634, TRUNK_DARK = 0x46372a, TRUNK_GREY = 0x7a7064;
const ico1 = new THREE.IcosahedronGeometry(1, 1), ico0 = new THREE.IcosahedronGeometry(1, 0);
const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);

function blob(b, geo, x, y, z, r, sy = 1, paint = 1, color = 0xffffff, rot = 0) {
  // HD (propLOD 'ultra'): copa subdividida, irregular e com normais suaves no lugar do icosaedro facetado
  if (b.ultra && (geo === ico1 || geo === ico0)) geo = lumpy(geo === ico1 && r > 1.35 ? 2 : 1, (x * 7.1 + y * 3.3 + z * 5.7) | 0);
  b.add(geo, color, x, y, z, 0, rot, 0, r, r * sy, r, paint);
}
/** Esfera "fofa" (copa): icosaedro subdividido com deslocamento determinístico e normais suaves. Cacheada. */
const _lumpy = new Map();
function lumpy(detail, seed) {
  const key = detail + ':' + (seed & 7);
  let g = _lumpy.get(key);
  if (g) return g;
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute('normal'); base.deleteAttribute('uv');
  g = mergeVertices(base); base.dispose();
  const P = g.attributes.position, k = (seed & 7) * 1.37;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const n = 1 + 0.09 * Math.sin(x * 4.1 + k) * Math.cos(z * 3.7 - k) + 0.06 * Math.sin(y * 5.3 + x * 2.1 + k * 2) - (y < -0.4 ? 0.08 : 0);
    P.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  _lumpy.set(key, g);
  return g;
}
/** HD: oclusão por vértice nas copas (paint = 1): por baixo e por dentro mais escuro, topo claro; leve variação de tom. */
function canopyAO(geo) {
  const C = geo.attributes.color, N = geo.attributes.normal, P = geo.attributes.paint, X = geo.attributes.position;
  for (let i = 0; i < C.count; i++) {
    if (P.getX(i) < 0.5) continue;
    const up = N.getY(i), ao = 0.5 + 0.5 * Math.max(0, Math.min(1, 0.55 + 0.55 * up));
    const j = 0.94 + 0.08 * Math.sin(X.getX(i) * 9.1 + X.getZ(i) * 7.3 + X.getY(i) * 5.1);
    C.setXYZ(i, C.getX(i) * ao * j, C.getY(i) * ao * j, C.getZ(i) * ao * j);
  }
}

/** Ipê: tronco fino com galhos abertos e copa em "guarda-chuva" de vários volumes (floração = cor da instância). */
function ipe(b) {
  b.add(cyl(0.14, 0.24, 3.4, 6), TRUNK, 0, 1.7, 0);
  const rng = makeRng(5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.add(cyl(0.05, 0.09, 1.9, 5), TRUNK, Math.cos(a) * 0.55, 3.6, Math.sin(a) * 0.55, Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75);
  }
  const lobes = [[0, 4.9, 0, 1.6], [1.25, 4.4, 0.4, 1.25], [-1.1, 4.5, -0.5, 1.3], [0.3, 4.3, -1.25, 1.15], [-0.4, 4.4, 1.2, 1.2]];
  for (const [x, y, z, r] of lobes) blob(b, ico1, x, y, z, r * (0.9 + rng() * 0.2), 0.62);
}
/** Mangueira: tronco curto e grosso, copa enorme, densa e arredondada. */
function mangueira(b) {
  b.add(cyl(0.26, 0.38, 2.2, 7), TRUNK_DARK, 0, 1.1, 0);
  for (const [a, l] of [[0.5, 1.4], [2.6, 1.3], [4.4, 1.2]]) b.add(cyl(0.1, 0.17, l, 5), TRUNK_DARK, Math.cos(a) * 0.4, 2.4, Math.sin(a) * 0.4, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
  const lobes = [[0, 3.7, 0, 2.5, 0.82], [1.5, 3.2, 0.6, 1.7, 0.85], [-1.4, 3.3, -0.7, 1.8, 0.85], [0.4, 4.7, -0.4, 1.6, 0.8], [-0.6, 3.0, 1.4, 1.5, 0.8], [0.8, 2.9, -1.5, 1.4, 0.8]];
  for (const [x, y, z, r, sy] of lobes) blob(b, ico1, x, y, z, r, sy);
}
/** Jaqueira: tronco alto e reto com jacas penduradas no tronco, copa escura e alongada. */
function jaqueira(b) {
  b.add(cyl(0.22, 0.32, 3.8, 7), TRUNK_GREY, 0, 1.9, 0);
  const lobes = [[0, 5.4, 0, 2.0, 1.0], [1.0, 4.5, 0.6, 1.45, 0.9], [-1.0, 4.7, -0.5, 1.5, 0.9], [0.1, 6.6, 0.1, 1.3, 0.9], [-0.3, 4.3, 1.1, 1.2, 0.9]];
  for (const [x, y, z, r, sy] of lobes) blob(b, ico1, x, y, z, r, sy);
  const JACA = 0x95a63c;
  for (const [a, y] of [[0.3, 1.6], [1.9, 2.2], [3.4, 1.4], [4.6, 2.8], [5.6, 2.0], [2.7, 3.1]]) {
    b.add(ico0, JACA, Math.cos(a) * 0.36, y, Math.sin(a) * 0.36, 0, a, 0.2, 0.2, 0.34, 0.2, 0);
  }
}
/** Palmeira do cerrado (macaúba/buriti): estipe fino e alto + leque de folhas arqueadas. */
function palmeira(b) {
  b.add(cyl(0.16, 0.22, 7.5, 6), 0x8a7a64, 0, 3.75, 0);
  b.add(cyl(0.26, 0.2, 0.9, 6), 0x6f6450, 0, 7.4, 0);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a), ry = -a + Math.PI / 2;
    // dois segmentos: sobe e depois cai
    b.add(BOXG, 0xffffff, dx * 0.8, 7.95, dz * 0.8, -0.35, ry, 0, 0.5, 0.05, 1.7, 1);
    b.add(BOXG, 0xffffff, dx * 2.1, 7.55, dz * 2.1, 0.45, ry, 0, 0.42, 0.05, 1.5, 1);
  }
  blob(b, ico0, 0, 7.9, 0, 0.55, 0.8, 1);
}
/** Árvore do cerrado: tronco retorcido, copa baixa, rala e irregular (facetada). */
function cerrado(b) {
  b.add(cyl(0.1, 0.16, 1.2, 5), TRUNK_DARK, 0, 0.6, 0, 0.25, 0, 0.1);
  b.add(cyl(0.08, 0.11, 1.1, 5), TRUNK_DARK, 0.25, 1.55, 0.1, -0.35, 0, -0.45);
  b.add(cyl(0.06, 0.08, 0.9, 5), TRUNK_DARK, -0.25, 1.5, -0.1, 0.4, 0, 0.5);
  for (const [x, y, z, r] of [[0.55, 2.4, 0.2, 1.25], [-0.5, 2.25, -0.3, 1.1], [0.0, 2.8, 0.0, 0.95]]) blob(b, ico0, x, y, z, r, 0.58);
}
/** Arbusto baixo (3 volumes facetados). */
function arbusto(b) {
  for (const [x, y, z, r] of [[0, 0.55, 0, 0.75], [0.6, 0.42, 0.2, 0.55], [-0.5, 0.4, -0.2, 0.6]]) blob(b, ico0, x, y, z, r, 0.75);
}
const BOXG = new THREE.BoxGeometry(1, 1, 1);

/** Poste de iluminação com braço curvo e luminária (braço aponta para +Z). double = braço duplo (canteiro). */
function poste(b, double = false) {
  const G = 0x7d8288;
  b.add(cyl(0.08, 0.13, 9, 8), G, 0, 4.5, 0);
  b.add(cyl(0.16, 0.2, 0.5, 8), 0x6a6e73, 0, 0.25, 0);
  for (const s of double ? [1, -1] : [1]) {
    b.add(cyl(0.05, 0.05, 1.4, 5), G, 0, 9.25, s * 0.55, s * 0.9, 0, 0);
    b.add(cyl(0.05, 0.05, 1.3, 5), G, 0, 9.55, s * 1.65, s * Math.PI / 2, 0, 0);
    b.add(CBOXP, 0x55595e, 0, 9.5, s * 2.45, 0, 0, 0, 0.42, 0.16, 0.9);
    b.add(BOXG, 0xf6f2dc, 0, 9.41, s * 2.45, 0, 0, 0, 0.32, 0.02, 0.75);
  }
}
const CBOXP = (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1); g.rotateX(Math.PI / 2); return g; })();

/** Banco de praça (concreto + ripas). Frente +Z. */
function banco(b) {
  for (const x of [-0.7, 0.7]) b.add(BOXG, 0xb9b3a6, x, 0.22, 0, 0, 0, 0, 0.12, 0.44, 0.45);
  b.add(BOXG, 0x9a7b55, 0, 0.47, 0, 0, 0, 0, 1.7, 0.06, 0.45);
  b.add(BOXG, 0x9a7b55, 0, 0.75, -0.2, -0.15, 0, 0, 1.7, 0.3, 0.05);
}
/** Lixeira (cesto laranja em poste). */
function lixeira(b) {
  b.add(cyl(0.035, 0.035, 0.9, 5), 0x555a5f, 0, 0.45, 0);
  b.add(cyl(0.2, 0.17, 0.45, 8), 0xffffff, 0, 0.85, 0.12, 0, 0, 0, 1, 1, 1, 1);
}
/** Poste de placa (o "rosto" da placa é billboard do atlas; aqui só o poste). */
function postePlaca(b) {
  b.add(cyl(0.035, 0.04, 2.6, 6), 0x8d9297, 0, 1.3, 0);
}
/** Mureta/abrigo de ônibus moderno: cobertura, vidro, banco, painel. */
function abrigo(b) {
  const BLUE = 0x2a5d9f, GL = 0x9fc4d6, ST = 0x6d7075;
  for (const z of [-2.1, 2.1]) for (const x of [-0.8, 0.8]) b.add(BOXG, ST, x, 1.3, z, 0, 0, 0, 0.08, 2.6, 0.08);
  b.add(BOXG, GL, 0.85, 1.35, 0, 0, 0, 0, 0.05, 2.1, 4.2);                       // fundo de vidro
  b.add(BOXG, GL, 0, 1.35, 2.15, 0, 0, 0, 1.6, 2.1, 0.05);                       // laterais
  b.add(BOXG, GL, 0, 1.35, -2.15, 0, 0, 0, 1.6, 2.1, 0.05);
  b.add(BOXG, BLUE, -0.1, 2.68, 0, 0, 0, -0.08, 2.3, 0.14, 4.8);                 // cobertura
  b.add(BOXG, 0x9a7b55, 0.5, 0.48, 0, 0, 0, 0, 0.45, 0.07, 3.4);                 // banco
  b.add(BOXG, 0xf1f1ec, 0.84, 1.5, 1.4, 0, 0, 0, 0.07, 1.6, 1.0);                // painel
}

const BUILDERS = { ipe, mangueira, jaqueira, palmeira, cerrado, arbusto, poste: (b) => poste(b, false), poste2: (b) => poste(b, true),
  banco, lixeira, postePlaca, abrigo };

/**
 * Geometria do prop `name` (cacheada). Retorna { geometry, triangles }.
 * lod 'ultra' (HD): copas subdivididas com oclusão por vértice + atributo `surf` (materiais PBR).
 */
const cache = new Map();
export function propGeometry(name, lod = 'high') {
  const key = name + '|' + lod;
  let r = cache.get(key);
  if (!r) {
    const b = new PartBuilder();
    b.ultra = lod === 'ultra';
    BUILDERS[name](b);
    const geometry = b.build();
    if (b.ultra) { canopyAO(geometry); applySurface(geometry, { paintClass: 'foliage', def: 'concrete' }); }
    r = { geometry, triangles: b.triangles };
    cache.set(key, r);
  }
  return r;
}
export const PROP_NAMES = Object.keys(BUILDERS);
