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
      const col = colors[Math.floor(rng() * colors.length)];
      // mancha com borda esfumada (gradiente radial) — nada de "discos" recortados
      wrap9((ox, oy) => {
        g.save(); g.translate(x + ox, y + oy); g.rotate(rot); g.scale(1, e);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, col); gr.addColorStop(0.6, col + 'aa'); gr.addColorStop(1, col + '00');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
      });
    }
  };
  blot(70, ['#a59659', '#c4b276', '#9b9757', '#b3a465', '#a8a060'], 6, 34, 0.4);
  blot(30, ['#a8603a', '#b5683d', '#9c5532', '#b77a4a'], 3, 12, 0.28);   // terra vermelha
  blot(60, ['#8f9450', '#7f8a48', '#76803f', '#93a052'], 2, 8, 0.55);   // tufos esverdeados
  g.globalAlpha = 0.4;
  for (let i = 0; i < 6000; i++) { const v = rng(); g.fillStyle = v < 0.4 ? '#86784a' : v < 0.8 ? '#d6c88c' : '#7d8a45'; g.fillRect(rng() * 256, rng() * 256, 0.6, 1.4 + rng() * 2); }
  g.globalAlpha = 0.5;
  for (let i = 0; i < 260; i++) { g.fillStyle = rng() < 0.5 ? '#8a5a3a' : '#e3d9b4'; g.fillRect(rng() * 256, rng() * 256, 1, 1); } // pedrinhas
  g.globalAlpha = 1;
  grain(g, S, rng, 22);
  return finish(c, anisotropy);
}

/**
 * Textura de detalhe do asfalto (tons de cinza ~0.55..1; multiplica a cor por vértice, inclusive a pintura,
 * que assim fica naturalmente desgastada): agregado granulado, remendos retangulares, juntas de dilatação,
 * manchas de óleo, trincas e marcas de pneu. Repetível; aplicada em UV de mundo (1 repetição = uvScale m).
 */
export function makeAsphaltTexture(S = 256, anisotropy = 4) {
  const { c, g } = logical(S);
  const rng = makeRng(7);
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, 256, 256);
  // variação de base (manchas grandes e suaves)
  for (let i = 0; i < 26; i++) {
    const x = rng() * 256, y = rng() * 256, r = 20 + rng() * 60, v = 200 + rng() * 50 | 0;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.45)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr; wrap9((ox, oy) => { g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); });
  }
  // remendos (bordas retas, tom diferente) com contorno de selante escuro
  for (let i = 0; i < 7; i++) {
    const x = rng() * 256, y = rng() * 256, w = 18 + rng() * 50, h = 10 + rng() * 26, v = (rng() < 0.5 ? 185 : 228) + rng() * 20 | 0;
    wrap9((ox, oy) => {
      g.globalAlpha = 0.38; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + ox, y + oy, w, h);
      g.globalAlpha = 0.3; g.strokeStyle = '#6a6a6a'; g.lineWidth = 0.7; g.strokeRect(x + ox, y + oy, w, h);
    });
  }
  g.globalAlpha = 1;
  // juntas transversais (concreto/recapeamento) e longitudinais
  g.strokeStyle = 'rgba(95,95,95,0.45)'; g.lineWidth = 0.8;
  for (const yy of [64, 192]) { g.beginPath(); g.moveTo(0, yy + (rng() - 0.5) * 2); g.lineTo(256, yy + (rng() - 0.5) * 2); g.stroke(); }
  // manchas de óleo
  for (let i = 0; i < 16; i++) {
    const x = rng() * 256, y = rng() * 256, r = 2 + rng() * 9, rot = rng() * 3;
    g.globalAlpha = 0.18 + rng() * 0.2; g.fillStyle = '#4a4a4a';
    wrap9((ox, oy) => { g.beginPath(); g.ellipse(x + ox, y + oy, r, r * (0.4 + rng() * 0.5), rot, 0, 7); g.fill(); });
  }
  // marcas de pneu (faixas suaves longitudinais)
  g.globalAlpha = 0.07; g.fillStyle = '#333';
  for (const xx of [70, 110, 150, 190]) g.fillRect(xx + (rng() - 0.5) * 6, 0, 10 + rng() * 6, 256);
  g.globalAlpha = 1;
  // trincas ramificadas
  g.strokeStyle = 'rgba(85,85,85,0.5)'; g.lineWidth = 0.6;
  for (let i = 0; i < 9; i++) {
    let x = rng() * 256, y = rng() * 256;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rng() - 0.5) * 22; y += (rng() - 0.5) * 22; g.lineTo(x, y); }
    g.stroke();
  }
  // agregado: pontinhos claros e escuros
  for (let i = 0; i < 5000; i++) {
    const v = rng() < 0.5 ? 140 + rng() * 40 | 0 : 240 + rng() * 15 | 0;
    g.fillStyle = `rgba(${v},${v},${v},0.55)`; g.fillRect(rng() * 256, rng() * 256, 0.6, 0.6);
  }
  grain(g, S, rng, 34);
  return finish(c, anisotropy);
}

/** Calçada de placas de concreto (1 repetição ≈ 4 m): juntas, placas com tons diferentes, manchas. */
export function makeSidewalkTexture(S = 256, anisotropy = 4) {
  const { c, g } = logical(S);
  const rng = makeRng(11);
  g.fillStyle = '#e8e5de'; g.fillRect(0, 0, 256, 256);
  const n = 4, cell = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 214 + rng() * 34 | 0;
    g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2);
    if (rng() < 0.3) { g.globalAlpha = 0.15; g.fillStyle = '#7a705e'; g.beginPath(); g.ellipse(i * cell + rng() * cell, j * cell + rng() * cell, 6 + rng() * 10, 4 + rng() * 6, rng() * 3, 0, 7); g.fill(); g.globalAlpha = 1; }
    if (rng() < 0.2) { g.strokeStyle = 'rgba(90,90,90,0.4)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(i * cell + rng() * cell, j * cell); g.lineTo(i * cell + rng() * cell, (j + 1) * cell); g.stroke(); }
  }
  g.strokeStyle = 'rgba(120,115,105,0.9)'; g.lineWidth = 1.6;
  for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(k * cell, 0); g.lineTo(k * cell, 256); g.stroke(); g.beginPath(); g.moveTo(0, k * cell); g.lineTo(256, k * cell); g.stroke(); }
  grain(g, S, rng, 26);
  return finish(c, anisotropy);
}

/** Grama (detalhe que multiplica a cor por vértice dos gramados/canteiros): folhas, falhas de terra. */
export function makeGrassTexture(S = 256, anisotropy = 4) {
  const { c, g } = logical(S);
  const rng = makeRng(23);
  g.fillStyle = '#e9efe0'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    const x = rng() * 256, y = rng() * 256, r = 8 + rng() * 30, v = rng();
    g.globalAlpha = 0.25; g.fillStyle = v < 0.4 ? '#cdd8b0' : v < 0.8 ? '#ffffff' : '#d9c7a0';
    wrap9((ox, oy) => { g.beginPath(); g.ellipse(x + ox, y + oy, r, r * 0.7, rng() * 3, 0, 7); g.fill(); });
  }
  g.globalAlpha = 0.5;
  for (let i = 0; i < 4500; i++) {
    const x = rng() * 256, y = rng() * 256, v = rng();
    g.fillStyle = v < 0.5 ? '#b9c79a' : v < 0.85 ? '#fbfff0' : '#a99e78';
    g.fillRect(x, y, 0.7, 1.6 + rng() * 1.6);
  }
  g.globalAlpha = 1;
  grain(g, S, rng, 18);
  return finish(c, anisotropy);
}

/**
 * Fachadas (uma célula = 1 pavimento × 1 módulo; repetida pelo shader em metros de mundo).
 * kind: 'res' (bloco residencial: janelas, brises verticais, peitoril de varanda) |
 *       'office' (pele de vidro com faixa de peitoril) | 'office2' (vidro esverdeado + montantes).
 * A cor da instância multiplica o branco das paredes. Canto inferior esquerdo (≈0.0–0.06) = parede lisa (topo/teto).
 */
export function makeFacadeTexture(kind = 'res', S = 256, anisotropy = 4) {
  const { c, g } = logical(S);
  const rng = makeRng(kind === 'res' ? 31 : kind === 'office' ? 37 : 41);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  if (kind === 'res') {
    // 2 módulos de largura (célula = 2 × 3,2 m), 1 andar (3 m). Janela recuada, brises, peitoril
    for (const ox of [0, 128]) {
      g.fillStyle = '#d7d2c6'; g.fillRect(ox + 10, 38, 108, 176);                       // recuo da varanda
      g.fillStyle = '#3c5262'; g.fillRect(ox + 22, 52, 84, 120);                        // vidro
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(ox + 22, 52, 30, 120);          // reflexo
      g.fillStyle = '#e9e4d8'; for (let k = 0; k < 6; k++) g.fillRect(ox + 16 + k * 18, 40, 5, 132); // brises verticais
      g.fillStyle = '#f3efe6'; g.fillRect(ox + 6, 176, 116, 40);                         // peitoril
      g.fillStyle = '#a9a294'; g.fillRect(ox + 6, 214, 116, 4);
      if (rng() < 0.6) { g.fillStyle = ['#c9443a', '#2f7fb5', '#e0a52a', '#3f9b55'][Math.floor(rng() * 4)]; g.globalAlpha = 0.65; g.fillRect(ox + 26, 120, 30, 50); g.globalAlpha = 1; } // cortina/toalha
    }
    g.fillStyle = '#bdb6a6'; g.fillRect(0, 248, 256, 8);                                   // laje
  } else {
    const glass = kind === 'office' ? '#3d6170' : '#3f6f5e';
    g.fillStyle = glass; g.fillRect(0, 56, 256, 200);
    const gr = g.createLinearGradient(0, 56, 256, 256);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.02)'); gr.addColorStop(1, 'rgba(255,255,255,0.12)');
    g.fillStyle = gr; g.fillRect(0, 56, 256, 200);
    g.fillStyle = kind === 'office' ? '#d9d6cf' : '#cfd3cc'; g.fillRect(0, 0, 256, 56);   // peitoril/viga
    g.fillStyle = '#8c9296'; for (let k = 0; k <= 4; k++) g.fillRect(k * 64 - 2, 56, 4, 200); // montantes
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 56, 256, 6);
  }
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 14, 14);                                       // área lisa (teto)
  grain(g, S, rng, 10);
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
    uv[e.key] = [px / LW, 1 - (py + e.h) / LH, (px + e.w) / LW, 1 - py / LH];
    aspect[e.key] = e.w / e.h;
    if (e.draw) { g.save(); e.draw(g, px, py, e.w, e.h); g.restore(); continue; } // ícone desenhado à mão
    g.fillStyle = e.bg; g.fillRect(px, py, e.w, e.h);
    if (!e.noBorder) { g.strokeStyle = e.fg; g.lineWidth = 4; g.strokeRect(px + 5, py + 5, e.w - 10, e.h - 10); }
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

// ---------------------------------------------------------------- placas de trânsito (desenhos p/ o atlas)
/** Regulamentação de velocidade (R-19): círculo branco, borda vermelha, número preto. */
export function drawSpeedSign(kmh) {
  return (g, x, y, w, h) => {
    g.clearRect(x, y, w, h);
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 2;
    g.fillStyle = '#d0202a'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, r * 0.74, 0, 7); g.fill();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.floor(r * 0.85)}px Arial, sans-serif`; g.fillText(String(kmh), cx, cy + r * 0.04);
    g.font = `bold ${Math.floor(r * 0.22)}px Arial, sans-serif`; g.fillText('km/h', cx, cy + r * 0.5);
  };
}
/** PARE (R-1): octógono vermelho. */
export function drawStopSign(g, x, y, w, h) {
  g.clearRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 2;
  const oct = (rr) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); };
  g.fillStyle = '#ffffff'; oct(r); g.fill();
  g.fillStyle = '#c8161e'; oct(r * 0.9); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.floor(r * 0.62)}px Arial, sans-serif`; g.fillText('PARE', cx, cy + 2);
}
/** Dê a preferência (R-2): triângulo invertido. */
export function drawYieldSign(g, x, y, w, h) {
  g.clearRect(x, y, w, h);
  const tri = (m) => { g.beginPath(); g.moveTo(x + m, y + m * 0.8); g.lineTo(x + w - m, y + m * 0.8); g.lineTo(x + w / 2, y + h - m); g.closePath(); };
  g.fillStyle = '#c8161e'; tri(3); g.fill();
  g.fillStyle = '#ffffff'; tri(18); g.fill();
}
/** Faixa de pedestre (A-32b): quadrado azul com pedestre. */
export function drawPedSign(g, x, y, w, h) {
  g.clearRect(x, y, w, h);
  g.fillStyle = '#ffffff'; g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle = '#1f56b0'; g.fillRect(x + 7, y + 7, w - 14, h - 14);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x + w / 2, y + 14); g.lineTo(x + w - 16, y + h - 16); g.lineTo(x + 16, y + h - 16); g.closePath(); g.fill();
  g.fillStyle = '#111'; const cx = x + w / 2, cy = y + h * 0.5;
  g.beginPath(); g.arc(cx, cy - 12, 5, 0, 7); g.fill();
  g.lineWidth = 4; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx - 2, cy + 8); g.lineTo(cx - 9, cy + 20); g.moveTo(cx - 2, cy + 8); g.lineTo(cx + 7, cy + 19); g.moveTo(cx - 9, cy + 1); g.lineTo(cx + 9, cy - 2); g.stroke();
  for (let k = 0; k < 4; k++) g.fillRect(x + 20 + k * 14, y + h - 22, 8, 4);
}

/** Textura radial suave (sombra "blob"): branco = sombra (usar como alphaMap) */
export function makeBlobTexture(S = 64) {
  const c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
