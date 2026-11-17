// Texturas geradas em canvas (nada é baixado).
import * as THREE from 'three';
import { makeRng } from '../core/math.js';

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}

/** Chão do cerrado: capim seco + manchas de terra vermelha. Repetível. */
export function makeGroundTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const rng = makeRng(42);
  g.fillStyle = '#b8a76a'; g.fillRect(0, 0, S, S);
  const blot = (n, colors, rMin, rMax, alpha) => {
    for (let i = 0; i < n; i++) {
      const x = rng() * S, y = rng() * S, r = rMin + rng() * (rMax - rMin);
      g.globalAlpha = alpha * (0.5 + rng() * 0.5);
      g.fillStyle = colors[Math.floor(rng() * colors.length)];
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.beginPath(); g.ellipse(x + ox, y + oy, r, r * (0.6 + rng() * 0.6), rng() * 3, 0, Math.PI * 2); g.fill();
      }
    }
  };
  blot(40, ['#a99a5c', '#c4b276', '#9e9a58', '#b3a465'], 10, 40, 0.5);
  blot(10, ['#a8603a', '#b5683d', '#9c5532'], 6, 22, 0.55);   // terra vermelha
  blot(30, ['#8f9450', '#7f8a48'], 3, 9, 0.5);               // tufos esverdeados
  g.globalAlpha = 0.25;
  for (let i = 0; i < 1600; i++) { g.fillStyle = rng() < 0.5 ? '#8d7f4c' : '#d1c287'; g.fillRect(rng() * S, rng() * S, 1, 2); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

/**
 * Atlas de placas/letreiros. entries: [{ key, text, sub?, bg, fg, w, h }] (w,h em px).
 * Retorna { texture, uv: { key: [u0,v0,u1,v1] }, aspect: { key: w/h } }.
 */
export function makeSignAtlas(entries) {
  const W = 1024;
  let x = 0, y = 0, rowH = 0;
  const place = [];
  for (const e of entries) {
    if (x + e.w > W) { x = 0; y += rowH + 4; rowH = 0; }
    place.push({ e, x, y });
    x += e.w + 4; rowH = Math.max(rowH, e.h);
  }
  const H = Math.pow(2, Math.ceil(Math.log2(y + rowH + 4)));
  const c = canvas(W, H), g = c.getContext('2d');
  const uv = {}, aspect = {};
  for (const { e, x: px, y: py } of place) {
    g.fillStyle = e.bg; g.fillRect(px, py, e.w, e.h);
    g.strokeStyle = e.fg; g.lineWidth = 4; g.strokeRect(px + 5, py + 5, e.w - 10, e.h - 10);
    g.fillStyle = e.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.floor(e.h * (e.sub ? 0.38 : 0.5));
    g.font = `bold ${fs}px "Segoe UI", Arial, sans-serif`;
    let tw = g.measureText(e.text).width;
    if (tw > e.w - 24) { g.font = `bold ${Math.floor(fs * (e.w - 24) / tw)}px "Segoe UI", Arial, sans-serif`; }
    g.fillText(e.text, px + e.w / 2, py + e.h * (e.sub ? 0.38 : 0.53));
    if (e.sub) {
      g.font = `${Math.floor(e.h * 0.22)}px "Segoe UI", Arial, sans-serif`;
      g.fillText(e.sub, px + e.w / 2, py + e.h * 0.76);
    }
    uv[e.key] = [px / W, 1 - (py + e.h) / H, (px + e.w) / W, 1 - py / H];
    aspect[e.key] = e.w / e.h;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { texture: t, uv, aspect };
}
