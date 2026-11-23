// Cenário EXTRA do perfil HD — só decorativo: sem colisor, sorteio próprio (não consome o rng do mundo), então a
// simulação e a posição de tudo que tem colisor são idênticas às do perfil leve.
//  - capim do cerrado mais denso e variado (tufos verdes/secos/avermelhados)
//  - flores (arbustos floridos baixos) nos gramados e no cerrado
//  - cupinzeiros de terra vermelha no cerrado aberto
//  - "tapete" de flores caídas sob os ipês (rosa/amarelo/branco/roxo), o que a câmera de cima mais vê
import * as THREE from 'three';
import { makeRng } from '../core/math.js';

const TUFT_COLS = [0xb9a75c, 0x9d9c55, 0xc8b46a, 0x8f9a4e, 0xa7a14f, 0xc2a463, 0x7f8f45, 0xb08850];
const FLOWER_COLS = [0xe2649a, 0xf5c518, 0xf6f2ec, 0x9c5ac8, 0xf08a3c, 0xe94f5b];
const MOUND_COLS = [0xa85a35, 0xb4653c, 0x9b5232, 0xa96a45];

/** Geometria de cupinzeiro (cone irregular, base em y = 0). */
export function moundGeometry() {
  const g = new THREE.ConeGeometry(0.55, 1, 9, 3); g.translate(0, 0.5, 0);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.18 * Math.sin(a * 3 + y * 4) + 0.1 * Math.sin(a * 5 - y * 7);
    P.setXYZ(i, x * k, y * (1 + 0.15 * Math.sin(a * 2)), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Textura do tapete de flores (alpha: pontinhos densos no centro, ralos na borda). */
export function makePetalTexture(S = 256) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = makeRng(91);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const a = rng() * Math.PI * 2, r = Math.pow(rng(), 0.7) * S * 0.48, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    const fall = 1 - r / (S * 0.5);
    g.fillStyle = `rgba(255,255,255,${(0.35 + rng() * 0.65) * Math.min(1, fall * 1.6)})`;
    g.beginPath(); g.ellipse(x, y, 1.2 + rng() * 2.2, 0.9 + rng() * 1.4, rng() * 3, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * Acrescenta o cenário extra. sb = SceneryBuilder (usa net, inst, colliders só para LER), extra = quality.extraScenery.
 * Tipos usados: 'tuft', 'tree_arbusto' (flores), 'mound', 'petal' (registrados em world.js no HD).
 */
export function buildHdScenery(sb, extra, ipes) {
  const { net, inst } = sb;
  const rng = makeRng(20260); // independente do rng do mundo
  const B = net.bounds;
  const stats = { tufts: 0, flowers: 0, mounds: 0, petals: 0 };
  const rx = () => B.minX + rng() * (B.maxX - B.minX), rz = () => B.minZ + rng() * (B.maxZ - B.minZ);
  // capim: grupos de tufos com cor variada
  const nT = Math.round(2600 * (extra.tufts || 0));
  for (let i = 0; i < nT; i++) {
    const x = rx(), z = rz();
    if (net.clearance(x, z, 6) < 1.4) continue;
    const g = 2 + Math.floor(rng() * 5), base = TUFT_COLS[Math.floor(rng() * TUFT_COLS.length)];
    for (let k = 0; k < g; k++) {
      const s = 0.6 + rng() * 0.8;
      inst.add('tuft', x + (rng() - 0.5) * 3.4, 0, z + (rng() - 0.5) * 3.4, rng() * 6, 0.45 * s + rng() * 0.3, 0.55 * s + rng() * 0.7, 0.45 * s + rng() * 0.3,
        rng() < 0.75 ? base : TUFT_COLS[Math.floor(rng() * TUFT_COLS.length)]);
      stats.tufts++;
    }
  }
  // flores: arbustos baixos floridos em grupos
  const nF = Math.round(700 * (extra.flowers || 0));
  for (let i = 0; i < nF; i++) {
    const x = rx(), z = rz();
    if (net.clearance(x, z, 8) < 2.2 || !sb.free(x, z, 1.2)) continue;
    const col = FLOWER_COLS[Math.floor(rng() * FLOWER_COLS.length)], g = 1 + Math.floor(rng() * 4);
    for (let k = 0; k < g; k++) {
      const s = 0.32 + rng() * 0.25;
      inst.add('tree_arbusto', x + (rng() - 0.5) * 2.5, 0, z + (rng() - 0.5) * 2.5, rng() * 6, s, s * (0.8 + rng() * 0.4), s, col);
      stats.flowers++;
    }
  }
  // cupinzeiros no cerrado aberto (longe das vias e de prédios)
  const nM = Math.round(320 * (extra.mounds || 0));
  for (let i = 0; i < nM; i++) {
    const x = rx(), z = rz();
    if (net.clearance(x, z, 12) < 6 || !sb.free(x, z, 2.5)) continue;
    const h = 0.5 + rng() * 1.1, w = 0.6 + rng() * 0.6;
    inst.add('mound', x, 0, z, rng() * 6, w, h, w * (0.8 + rng() * 0.4), MOUND_COLS[Math.floor(rng() * MOUND_COLS.length)]);
    stats.mounds++;
  }
  // tapete de flores caídas sob cada ipê (posição/cor/escala anotadas pelo SceneryBuilder; não altera o sorteio)
  if (extra.petals && ipes) {
    for (let i = 0; i < ipes.length; i += 4) {
      const x = ipes[i], z = ipes[i + 1], sc = ipes[i + 2], col = ipes[i + 3];
      if (net.clearance(x, z, 6) < 0.6) continue; // não pinta o asfalto
      const r = (2.6 + rng() * 1.2) * sc;
      inst.add('petal', x + (rng() - 0.5) * 0.8, 0.034, z + (rng() - 0.5) * 0.8, rng() * 6, r * 2, 1, r * 2 * (0.8 + rng() * 0.3), col);
      stats.petals++;
    }
  }
  return stats;
}
