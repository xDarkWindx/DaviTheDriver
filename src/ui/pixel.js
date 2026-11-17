// Pixel art desenhada em canvas (nenhuma imagem externa). Tudo em grades pequenas, ampliadas com image-rendering: pixelated.

const px = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const ctx2 = (cv, w, h) => { cv.width = w; cv.height = h; const c = cv.getContext('2d'); c.clearRect(0, 0, w, h); return c; };

// ---- fonte 5x7 (só as letras do título) ------------------------------------
const GLYPH = {
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  ',': ['000', '000', '000', '000', '000', '010', '100'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
};

function textCells(text) {
  const cells = []; let x = 0;
  for (const ch of text) {
    const g = GLYPH[ch] || GLYPH[' '];
    for (let r = 0; r < 7; r++) for (let q = 0; q < g[r].length; q++) if (g[r][q] === '1') cells.push([x + q, r]);
    x += g[0].length + 1;
  }
  return { cells, w: x - 1 };
}

/** Desenha uma linha do título com extrusão, contorno e degradê em faixas. */
function titleLine(c, text, ox, oy, s, top, bot, depthCol, depth) {
  const { cells } = textCells(text);
  for (let d = depth; d >= 1; d--) for (const [cx, cy] of cells) px(c, ox + cx * s + d, oy + cy * s + d, s, s, depthCol);
  for (const [cx, cy] of cells) { // contorno de 1px lógico
    px(c, ox + cx * s - 1, oy + cy * s, s + 2, s, '#1b1230');
    px(c, ox + cx * s, oy + cy * s - 1, s, s + 2, '#1b1230');
  }
  for (const [cx, cy] of cells) px(c, ox + cx * s, oy + cy * s, s, s, cy < 4 ? top : bot);
  for (const [cx, cy] of cells) if (cy === 0) px(c, ox + cx * s, oy + cy * s, s, 1, 'rgba(255,255,255,.7)');
}

export function drawTitle(cv) {
  const W = 132, H = 58;
  const c = ctx2(cv, W, H);
  titleLine(c, 'DAVI,', 4, 3, 4, '#ffe45e', '#ffb12a', '#c4452b', 3);
  titleLine(c, 'THE DRIVER', 4, 38, 2, '#7fd0ff', '#3a8fe0', '#1b3f8a', 2);
}

// ---- rosto de 16x16 ---------------------------------------------------------
const TONE_BG = { calm: '#6fcf8e', anx: '#ffd23a', stress: '#ea5a41', panic: '#b45fe0' };

export function drawFace(cv, who, tone) {
  const c = ctx2(cv, 16, 16);
  tone = TONE_BG[tone] ? tone : 'calm';
  px(c, 0, 0, 16, 16, TONE_BG[tone]);
  const davi = who === 'davi';
  const skin = tone === 'stress' ? '#d9684e' : davi ? '#c98a5a' : '#ecc095';
  const hair = davi ? '#2a1a12' : '#9aa0aa';
  px(c, 2, 13, 12, 3, davi ? '#f2f2f2' : '#2b5d9f');          // camiseta / camisa
  px(c, 6, 12, 4, 2, skin);                                    // pescoço
  px(c, 4, 3, 8, 9, skin); px(c, 3, 6, 1, 3, skin); px(c, 12, 6, 1, 3, skin); // rosto + orelhas
  px(c, 4, 2, 8, 2, hair); px(c, 3, 3, 1, 3, hair); px(c, 12, 3, 1, 3, hair);   // cabelo
  if (davi) { px(c, 4, 4, 1, 2, hair); px(c, 11, 4, 1, 2, hair); }
  else { px(c, 4, 6, 3, 2, '#1c1c24'); px(c, 9, 6, 3, 2, '#1c1c24'); px(c, 7, 6, 2, 1, '#1c1c24'); } // óculos
  const eye = '#1c1c24';
  // sobrancelhas + olhos
  if (tone === 'calm') {
    if (davi) { px(c, 5, 5, 2, 1, hair); px(c, 9, 5, 2, 1, hair); }
    px(c, 5, 7, 1, 1, eye); px(c, 10, 7, 1, 1, eye);
    if (!davi) { px(c, 5, 7, 1, 1, '#9fd4ff'); px(c, 10, 7, 1, 1, '#9fd4ff'); }
  } else if (tone === 'anx') {
    px(c, 5, 4, 2, 1, hair); px(c, 9, 4, 2, 1, hair);
    if (davi) { px(c, 5, 6, 2, 2, '#fff'); px(c, 9, 6, 2, 2, '#fff'); px(c, 6, 7, 1, 1, eye); px(c, 9, 7, 1, 1, eye); }
    else { px(c, 5, 7, 1, 1, eye); px(c, 10, 7, 1, 1, eye); }
  } else if (tone === 'stress') {
    px(c, 5, 5, 1, 1, hair); px(c, 6, 6, 1, 1, hair); px(c, 10, 5, 1, 1, hair); px(c, 9, 6, 1, 1, hair);
    px(c, 5, 7, 2, 1, eye); px(c, 9, 7, 2, 1, eye);
  } else { // panic
    px(c, 5, 4, 2, 1, hair); px(c, 9, 4, 2, 1, hair);
    if (davi) { px(c, 5, 5, 3, 3, '#fff'); px(c, 8, 5, 3, 3, '#fff'); px(c, 6, 6, 1, 1, eye); px(c, 9, 6, 1, 1, eye); }
    else { px(c, 4, 5, 3, 3, '#fff'); px(c, 9, 5, 3, 3, '#fff'); px(c, 5, 6, 1, 1, eye); px(c, 10, 6, 1, 1, eye); }
  }
  // boca
  if (tone === 'calm') { px(c, 6, 10, 1, 1, '#7a2e2e'); px(c, 9, 10, 1, 1, '#7a2e2e'); px(c, 7, 11, 2, 1, '#7a2e2e'); }
  else if (tone === 'anx') { px(c, 6, 11, 1, 1, '#7a2e2e'); px(c, 7, 10, 1, 1, '#7a2e2e'); px(c, 8, 11, 1, 1, '#7a2e2e'); px(c, 9, 10, 1, 1, '#7a2e2e'); }
  else if (tone === 'stress') { px(c, 5, 10, 6, 3, '#3a0f0f'); px(c, 6, 10, 4, 1, '#fff'); px(c, 6, 12, 4, 1, '#fff'); }
  else { px(c, 7, 10, 2, 3, '#3a0f0f'); px(c, 7, 11, 2, 1, '#e8556a'); }
  // detalhes
  if (tone === 'anx' || tone === 'panic') { px(c, 13, 3, 1, 2, '#bfe9ff'); px(c, 2, 4, 1, 2, '#bfe9ff'); if (tone === 'panic') px(c, 13, 8, 1, 2, '#bfe9ff'); }
  if (tone === 'stress') { px(c, 11, 2, 2, 1, '#e00'); px(c, 12, 1, 1, 3, '#e00'); }
}

// ---- Davi de capacete (placeholder da foto), 32x32 ---------------------------
export function drawDaviHelmet(cv) {
  const c = ctx2(cv, 32, 32);
  px(c, 0, 0, 32, 32, '#7cc4f2');
  px(c, 0, 24, 32, 8, '#c4452b');                     // terra vermelha
  px(c, 0, 22, 32, 2, '#8fcf6a');
  px(c, 24, 4, 5, 5, '#fff7c2'); px(c, 25, 5, 3, 3, '#ffe45e'); // sol
  // ombros / camiseta
  px(c, 6, 27, 20, 5, '#f2f2f2'); px(c, 12, 26, 8, 2, '#c98a5a');
  // rosto
  px(c, 10, 14, 12, 12, '#c98a5a'); px(c, 9, 17, 1, 4, '#c98a5a'); px(c, 22, 17, 1, 4, '#c98a5a');
  // capacete
  px(c, 8, 6, 16, 3, '#e8c21c'); px(c, 7, 8, 18, 9, '#ffd21f'); px(c, 6, 11, 1, 8, '#ffd21f'); px(c, 25, 11, 1, 8, '#ffd21f');
  px(c, 7, 8, 18, 1, '#fff2a0'); px(c, 15, 6, 2, 11, '#c4452b'); // faixa central
  px(c, 8, 16, 16, 2, '#1b1230');                     // viseira levantada (sombra)
  px(c, 8, 17, 16, 1, '#3a8fe0');
  px(c, 8, 18, 2, 6, '#e8c21c'); px(c, 22, 18, 2, 6, '#e8c21c'); // jugulares
  px(c, 10, 24, 12, 1, '#2a1a12');                    // tira do queixo
  // olhos arregalados (ansioso) + sobrancelhas
  px(c, 11, 19, 4, 3, '#fff'); px(c, 17, 19, 4, 3, '#fff'); px(c, 13, 20, 2, 2, '#1c1c24'); px(c, 17, 20, 2, 2, '#1c1c24');
  px(c, 11, 18, 4, 1, '#2a1a12'); px(c, 17, 18, 4, 1, '#2a1a12');
  px(c, 14, 23, 4, 1, '#7a2e2e'); px(c, 15, 24, 2, 1, '#7a2e2e');
  px(c, 22, 14, 1, 2, '#bfe9ff');                     // gota de suor
}

// ---- carros 32x16 ------------------------------------------------------------
export function drawCar(cv, kind) {
  const c = ctx2(cv, 32, 16);
  const kwid = kind === 'kwid';
  const body = kwid ? '#f5f5f2' : '#8d939c', shade = kwid ? '#c9cbc8' : '#656b74';
  px(c, 3, 14, 26, 1, 'rgba(0,0,0,.25)');
  if (kwid) { px(c, 8, 3, 15, 5, body); px(c, 9, 2, 12, 1, body); px(c, 2, 8, 28, 5, body); px(c, 2, 12, 28, 1, shade); }
  else { px(c, 8, 4, 14, 4, body); px(c, 10, 3, 9, 1, body); px(c, 2, 8, 28, 5, body); px(c, 2, 12, 28, 1, shade); px(c, 9, 10, 14, 2, '#3a3d44'); px(c, 11, 10, 2, 2, '#9bd05a'); px(c, 16, 10, 2, 2, '#9bd05a'); }
  px(c, 10, kwid ? 4 : 5, 5, 3, '#9fd8f5'); px(c, 16, kwid ? 4 : 5, 5, 3, '#9fd8f5');
  px(c, 28, 9, 2, 2, '#ffe27a'); px(c, 2, 9, 1, 2, '#e23a3a');
  for (const wx of [6, 22]) { px(c, wx, 11, 5, 5, '#15151c'); px(c, wx + 1, 12, 3, 3, '#aeb4bd'); px(c, wx + 2, 13, 1, 1, '#15151c'); }
}

// ---- silhueta de Brasília (rodapé do menu) -----------------------------------
export function drawSkyline(cv) {
  const W = 320, H = 72;
  const c = ctx2(cv, W, H);
  const sil = 'rgba(27,18,48,.88)';
  px(c, 0, 62, W, 10, '#9b3a24'); px(c, 0, 62, W, 1, '#c4452b');
  // Torre de TV
  px(c, 30, 14, 2, 48, sil); px(c, 26, 30, 10, 3, sil); px(c, 28, 33, 6, 2, sil); px(c, 31, 6, 1, 8, sil);
  // Congresso: duas torres + laje + cúpulas
  px(c, 150, 16, 6, 46, sil); px(c, 159, 16, 6, 46, sil); px(c, 156, 40, 3, 2, sil);
  px(c, 118, 54, 92, 8, sil);
  for (let i = 0; i < 12; i++) { const w = Math.round(Math.sqrt(144 - (i - 12) * (i - 12) * 1)); px(c, 134 - w + 1, 54 - i, w * 2 - 2, 1, sil); } // cúpula (câmara)
  for (let i = 0; i < 10; i++) { const w = 10 - i; px(c, 190 - w, 54 - 10 + i, w * 2, 1, sil); }                                                      // tigela (senado, invertida)
  // Catedral (hipérbole)
  for (let i = 0; i < 18; i++) { const sp = 6 + Math.round(Math.abs(i - 9) * 0.5); px(c, 250 - sp, 44 + i - 0, 1, 1, sil); px(c, 250 + sp, 44 + i - 0, 1, 1, sil); }
  px(c, 242, 58, 16, 4, sil); for (const k of [-6, -3, 0, 3, 6]) px(c, 250 + k, 42, 1, 18, sil);
  // ipês amarelos
  for (const [tx, ty] of [[78, 50], [96, 54], [284, 52], [302, 56], [8, 54]]) {
    px(c, tx, ty + 6, 2, 12, '#4a2a1a'); px(c, tx - 5, ty, 12, 7, '#ffc928'); px(c, tx - 3, ty - 3, 8, 4, '#ffd95a'); px(c, tx - 7, ty + 3, 4, 3, '#ffb000');
  }
}
