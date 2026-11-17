// Texturas geradas em canvas (nada é baixado). Resolução vem do perfil de qualidade.
import * as THREE from 'three';
import { makeRng } from '../core/math.js';

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
// Desenha num espaço lógico 256x256 escalado para S x S.
function logical(S) {
  const c = canvas(S, S), g = c.getContext('2d');
  g.scale(S / 256, S / 256);
  return { c, g };
}
const wrap9 = (fn) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) fn(ox, oy); };

function finish(c, anisotropy, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

function grain(g, S, rng, amp) {
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amp;
    d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

/** Chão do cerrado: capim seco + manchas de terra vermelha + tufos. Repetível. */
export function makeGroundTexture(S = 256, anisotropy = 4) {
  const { c, g } = logical(S);
  const rng = makeRng(42);
  g.fillStyle = '#b5a468'; g.fillRect(0, 0, 256, 256);
  const blot = (n, colors, rMin, rMax, alpha) => {
    for (let i = 0; i < n; i++) {
      const x = rng() * 256, y = rng() * 256, r = rMin + rng() * (rMax - rMin), e = 0.6 + rng() * 0.6, rot = rng() * 3;
      g.globalAlpha = alpha * (0.5 + rng() * 0.5);
      g.fillStyle = colors[Math.floor(rng() * colors.length)];
      wrap9((ox, oy) => { g.beginPath(); g.ellipse(x + ox, y + oy, r, r * e, rot, 0, Math.PI * 2); g.fill(); });
    }
  };
  blot(40, ['#a59659', '#c4b276', '#9b9757', '#b3a465'], 10, 40, 0.5);
  blot(12, ['#a8603a', '#b5683d', '#9c5532'], 6, 24, 0.6);   // terra vermelha
  blot(40, ['#8f9450', '#7f8a48', '#76803f'], 2, 7, 0.55);   // tufos esverdeados
  g.globalAlpha = 0.35;
  for (let i = 0; i < 2200; i++) { g.fillStyle = rng() < 0.5 ? '#86784a' : '#d6c88c'; g.fillRect(rng() * 256, rng() * 256, 0.8, 2.2); }
  g.globalAlpha = 1;
  grain(g, S, rng, 22);
  return finish(c, anisotropy);
}

/**
 * Textura de detalhe do asfalto (tons de cinza ~0.6..1; multiplica a cor por vértice):
 * granulado, remendos, manchas de óleo e trincas. Repetível; aplicada em UV de mundo.
 */
export function makeAsphaltTexture(S = 256, anisotropy = 4) {
  const { c, g } = logical(S);
  const rng = makeRng(7);
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 14; i++) {
    const x = rng() * 256, y = rng() * 256, w = 20 + rng() * 60, h = 10 + rng() * 40, v = 185 + rng() * 55 | 0;
    g.globalAlpha = 0.5; g.fillStyle = `rgb(${v},${v},${v})`;
    wrap9((ox, oy) => g.fillRect(x + ox, y + oy, w, h));
  }
  for (let i = 0; i < 18; i++) {
    const x = rng() * 256, y = rng() * 256, r = 4 + rng() * 18, v = 140 + rng() * 60 | 0, rot = rng() * 3;
    g.globalAlpha = 0.35; g.fillStyle = `rgb(${v},${v},${v})`;
    wrap9((ox, oy) => { g.beginPath(); g.ellipse(x + ox, y + oy, r, r * 0.6, rot, 0, 7); g.fill(); });
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(80,80,80,0.6)'; g.lineWidth = 0.9;
  for (let i = 0; i < 10; i++) {
    let x = rng() * 256, y = rng() * 256;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 30; y += (rng() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  grain(g, S, rng, 50);
  return finish(c, anisotropy);
}

/**
 * Atlas de placas/letreiros. entries: [{ key, text, sub?, bg, fg, w, h }] (w,h em px lógicos).
 * Retorna { texture, uv: { key: [u0,v0,u1,v1] }, aspect: { key: w/h } }.
 */
export function makeSignAtlas(entries, W = 1024, anisotropy = 4) {
  const LW = 1024, k = W / LW;
  let x = 0, y = 0, rowH = 0;
  const place = [];
  for (const e of entries) {
    if (x + e.w > LW) { x = 0; y += rowH + 4; rowH = 0; }
    place.push({ e, x, y });
    x += e.w + 4; rowH = Math.max(rowH, e.h);
  }
  const LH = Math.pow(2, Math.ceil(Math.log2(y + rowH + 4)));
  const c = canvas(W, LH * k), g = c.getContext('2d');
  g.scale(k, k);
  const uv = {}, aspect = {};
  for (const { e, x: px, y: py } of place) {
    g.fillStyle = e.bg; g.fillRect(px, py, e.w, e.h);
    g.strokeStyle = e.fg; g.lineWidth = 4; g.strokeRect(px + 5, py + 5, e.w - 10, e.h - 10);
    g.fillStyle = e.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.floor(e.h * (e.sub ? 0.38 : 0.5));
    g.font = `bold ${fs}px "Segoe UI", Arial, sans-serif`;
    const tw = g.measureText(e.text).width;
    if (tw > e.w - 24) g.font = `bold ${Math.floor(fs * (e.w - 24) / tw)}px "Segoe UI", Arial, sans-serif`;
    g.fillText(e.text, px + e.w / 2, py + e.h * (e.sub ? 0.38 : 0.53));
    if (e.sub) {
      g.font = `${Math.floor(e.h * 0.22)}px "Segoe UI", Arial, sans-serif`;
      g.fillText(e.sub, px + e.w / 2, py + e.h * 0.76);
    }
    uv[e.key] = [px / LW, 1 - (py + e.h) / LH, (px + e.w) / LW, 1 - py / LH];
    aspect[e.key] = e.w / e.h;
  }
  return { texture: finish(c, anisotropy, false), uv, aspect };
}

/** Textura radial suave (sombra "blob"): branco = sombra (usar como alphaMap) */
export function makeBlobTexture(S = 64) {
  const c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
