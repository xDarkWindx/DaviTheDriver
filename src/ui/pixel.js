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

// ---- rostos 24x24 (HUD) ------------------------------------------------------
// Cores do Davi em constantes: pele clara; cabelo castanho-escuro quase preto, MUITO cacheado e volumoso (cachos na testa
// e armando para os lados); barba cheia e escura com bigode; nariz reto e marcado; sobrancelhas escuras; sorriso largo.
export const DAVI_SKIN = '#f0c6a2';
export const DAVI_SKIN_SHADE = '#d9a582';
export const DAVI_HAIR = '#22150f';
export const DAVI_HAIR_LIGHT = '#3d281c';
export const DAVI_BEARD = '#24170f';
export const DAVI_HORNS = '#6b6b78'; // chifres de fantasia (cinza, para destacar do cabelo)
export const DAVI_SHIRT = '#f2f2f2';
// Leandro (dono do Cactus): cabelo castanho-escuro CURTO e arrumado (para cima/lado), barba curta aparada (rala), pele
// clara, camisa escura, expressão de base serena — contraste imediato com o Davi (cachos, barbão, sorrisão).
export const DONO_SKIN = '#efc4a0';
export const DONO_HAIR = '#3b2a1e';
export const DONO_HAIR_LIGHT = '#5a412e';
export const DONO_STUBBLE = '#b98d6e';
export const DONO_SHIRT = '#23262d';
const TONE_BG = { calm: '#6fcf8e', anx: '#ffd23a', stress: '#ea5a41', panic: '#b45fe0' };

/** extra.horns: chifrinhos de fantasia (segredo: aparecem quando o estresse do Davi bate no máximo). */
export function drawFace(cv, who, tone, extra = null) {
  const c = ctx2(cv, 24, 24);
  tone = TONE_BG[tone] ? tone : 'calm';
  px(c, 0, 0, 24, 24, TONE_BG[tone]);
  const davi = who === 'davi';
  const skin = tone === 'stress' ? (davi ? '#eaa486' : '#e0957a') : davi ? DAVI_SKIN : DONO_SKIN;
  const shade = davi ? DAVI_SKIN_SHADE : '#cf9f78';
  const hair = davi ? DAVI_HAIR : DONO_HAIR, hairL = davi ? DAVI_HAIR_LIGHT : '#c6cbd2';
  const ink = '#1c1c24', lip = '#9a4a42';
  // ombros + pescoço
  px(c, 3, 20, 18, 4, davi ? DAVI_SHIRT : DONO_SHIRT);
  if (davi) { px(c, 9, 20, 6, 1, '#d8d8d8'); } else { px(c, 9, 20, 6, 1, '#3a3e47'); px(c, 11, 20, 2, 2, '#14161a'); }
  px(c, 9, 17, 6, 4, shade);
  // rosto (oval) + orelhas
  px(c, 6, 5, 12, 12, skin); px(c, 7, 17, 10, 1, skin); px(c, 8, 18, 8, 1, skin);
  px(c, 5, 10, 1, 3, skin); px(c, 18, 10, 1, 3, skin);
  if (davi) {
    // cabelo cacheado e volumoso: massa larga em cima e dos lados, cachos soltos caindo na testa
    px(c, 4, 1, 16, 5, hair); px(c, 2, 3, 3, 11, hair); px(c, 19, 3, 3, 11, hair);
    px(c, 1, 5, 1, 7, hair); px(c, 22, 5, 1, 7, hair); px(c, 3, 2, 1, 2, hair); px(c, 20, 2, 1, 2, hair);
    for (const [x, y] of [[5, 0], [9, 0], [13, 0], [17, 1], [1, 4], [22, 4], [2, 13], [20, 13]]) px(c, x, y, 2, 1, hair);   // contorno irregular
    for (const [x, y] of [[5, 2], [8, 1], [11, 2], [14, 1], [17, 3], [3, 6], [20, 6], [2, 9], [21, 10], [3, 12], [19, 12]]) { px(c, x, y, 1, 1, hairL); px(c, x + 1, y + 1, 1, 1, hairL); } // cachos
    px(c, 6, 6, 2, 1, hair); px(c, 9, 6, 1, 2, hair); px(c, 12, 6, 2, 1, hair); px(c, 15, 6, 1, 2, hair); px(c, 17, 6, 1, 1, hair); // cachos na testa
    px(c, 5, 10, 1, 3, skin); px(c, 18, 10, 1, 3, skin);                           // orelha aparecendo
  } else {
    // curto e arrumado, topete penteado para cima/lado
    px(c, 6, 3, 12, 3, hair); px(c, 5, 4, 1, 4, hair); px(c, 18, 4, 1, 4, hair);
    px(c, 7, 2, 10, 1, hair); px(c, 9, 1, 7, 1, hair); px(c, 13, 0, 3, 1, hair);
    px(c, 10, 1, 4, 1, DONO_HAIR_LIGHT); px(c, 8, 3, 6, 1, DONO_HAIR_LIGHT);
    // barba curta e rala (pontilhada) no queixo e nas laterais
    for (let y = 13; y <= 18; y++) for (let x = 6; x <= 17; x++) {
      const edge = x <= 7 || x >= 16 || y >= 17;
      if (edge && ((x + y) % 2 === 0) && !(y <= 14 && x > 7 && x < 16)) px(c, x, y, 1, 1, DONO_STUBBLE);
    }
    px(c, 10, 15, 4, 1, DONO_STUBBLE);
  }
  // nariz: reto e marcado (ponte longa com sombra lateral, ponta e narinas)
  px(c, 11, 9, 2, 6, skin); px(c, 13, 9, 1, 5, shade); px(c, 10, 14, 4, 1, skin); px(c, 10, 15, 4, 1, shade);
  px(c, 10, 15, 1, 1, '#a8705a'); px(c, 13, 15, 1, 1, '#a8705a');
  if (davi) { // barba cheia e fechada (laterais, queixo) + bigode
    px(c, 5, 12, 2, 6, DAVI_BEARD); px(c, 17, 12, 2, 6, DAVI_BEARD); px(c, 6, 17, 12, 2, DAVI_BEARD); px(c, 8, 19, 8, 1, DAVI_BEARD);
    px(c, 7, 15, 2, 3, DAVI_BEARD); px(c, 15, 15, 2, 3, DAVI_BEARD);
    px(c, 9, 15, 1, 1, DAVI_BEARD); px(c, 14, 15, 1, 1, DAVI_BEARD); px(c, 9, 16, 6, 1, DAVI_BEARD);   // bigode
    px(c, 6, 18, 1, 1, '#3a281c'); px(c, 16, 18, 1, 1, '#3a281c');
  }
  const brow = hair;
  // sobrancelhas (definidas) + olhos por expressão
  if (tone === 'calm') {
    px(c, 7, 8, 3, 1, brow); px(c, 14, 8, 3, 1, brow);
    px(c, 8, 10, 2, 1, '#fff'); px(c, 14, 10, 2, 1, '#fff'); px(c, 9, 10, 1, 1, ink); px(c, 14, 10, 1, 1, ink);
  } else if (tone === 'anx') {
    px(c, 7, 7, 3, 1, brow); px(c, 10, 8, 1, 1, brow); px(c, 14, 7, 3, 1, brow); px(c, 13, 8, 1, 1, brow);
    px(c, 7, 9, 3, 3, '#fff'); px(c, 14, 9, 3, 3, '#fff'); px(c, 8, 10, 1, 1, ink); px(c, 15, 10, 1, 1, ink);
  } else if (tone === 'stress') {
    px(c, 7, 8, 1, 1, brow); px(c, 8, 8, 2, 1, brow); px(c, 9, 9, 1, 1, brow); px(c, 16, 8, 1, 1, brow); px(c, 14, 8, 2, 1, brow); px(c, 14, 9, 1, 1, brow);
    px(c, 7, 10, 3, 1, ink); px(c, 14, 10, 3, 1, ink);
  } else { // pânico
    px(c, 7, 6, 3, 1, brow); px(c, 14, 6, 3, 1, brow);
    px(c, 7, 8, 3, 4, '#fff'); px(c, 14, 8, 3, 4, '#fff'); px(c, 8, 9, 1, 2, ink); px(c, 15, 9, 1, 2, ink);
  }
  // boca
  if (tone === 'calm' && davi) { px(c, 9, 17, 6, 2, '#5a1e1e'); px(c, 9, 17, 6, 1, '#fff'); px(c, 8, 16, 1, 1, lip); px(c, 15, 16, 1, 1, lip); } // sorriso largo
  else if (tone === 'calm') { px(c, 10, 17, 4, 1, lip); } // sereno
  else if (tone === 'anx') { px(c, 9, 17, 1, 1, lip); px(c, 10, 16, 1, 1, lip); px(c, 11, 17, 2, 1, lip); px(c, 13, 16, 1, 1, lip); px(c, 14, 17, 1, 1, lip); }
  else if (tone === 'stress') { px(c, 8, 16, 8, 3, '#3a0f0f'); px(c, 9, 16, 6, 1, '#fff'); px(c, 9, 18, 6, 1, '#fff'); }
  else { px(c, 10, 16, 4, 3, '#3a0f0f'); px(c, 11, 17, 2, 1, '#e8556a'); }
  // detalhes
  if (tone === 'anx' || tone === 'panic') { px(c, 19, 5, 1, 2, '#bfe9ff'); px(c, 4, 6, 1, 2, '#bfe9ff'); if (tone === 'panic') px(c, 19, 12, 1, 2, '#bfe9ff'); }
  if (tone === 'stress' && !(extra && extra.horns)) { px(c, 17, 3, 3, 1, '#e00'); px(c, 18, 2, 1, 3, '#e00'); }
  if (extra && extra.horns && davi) { // chifrinhos curvos de fantasia saindo dos cachos
    for (const sgn of [-1, 1]) {
      const bx = sgn < 0 ? 3 : 20;
      px(c, bx, 2, 1, 2, DAVI_HORNS); px(c, bx - sgn, 1, 1, 2, DAVI_HORNS); px(c, bx - 2 * sgn, 0, 1, 2, DAVI_HORNS); px(c, bx - 3 * sgn, 1, 1, 1, DAVI_HORNS);
      px(c, bx + sgn, 4, 1, 1, DAVI_HORNS);
    }
  }
}

// ---- Davi de capacete (provisório da foto), 32x32 ------------------------------
export function drawDaviHelmet(cv) {
  const c = ctx2(cv, 32, 32);
  px(c, 0, 0, 32, 32, '#7cc4f2');
  px(c, 0, 24, 32, 8, '#c4452b');                     // terra vermelha
  px(c, 0, 22, 32, 2, '#8fcf6a');
  px(c, 24, 4, 5, 5, '#fff7c2'); px(c, 25, 5, 3, 3, '#ffe45e'); // sol
  // ombros / camiseta
  px(c, 5, 27, 22, 5, DAVI_SHIRT); px(c, 13, 26, 6, 2, DAVI_SKIN_SHADE);
  // cachos volumosos escapando por baixo e pelos lados do capacete
  px(c, 4, 13, 5, 13, DAVI_HAIR); px(c, 23, 13, 5, 13, DAVI_HAIR); px(c, 3, 16, 1, 8, DAVI_HAIR); px(c, 28, 16, 1, 8, DAVI_HAIR);
  for (const [x, y] of [[4, 25], [7, 26], [23, 26], [26, 25], [3, 14], [28, 14]]) px(c, x, y, 2, 1, DAVI_HAIR);
  for (const [x, y] of [[5, 15], [6, 19], [4, 22], [24, 16], [26, 20], [24, 23]]) { px(c, x, y, 1, 1, DAVI_HAIR_LIGHT); px(c, x + 1, y + 1, 1, 1, DAVI_HAIR_LIGHT); }
  // rosto
  px(c, 9, 14, 14, 12, DAVI_SKIN); px(c, 10, 26, 12, 1, DAVI_SKIN);
  // capacete
  px(c, 8, 5, 16, 3, '#e8c21c'); px(c, 7, 7, 18, 8, '#ffd21f'); px(c, 6, 10, 1, 6, '#ffd21f'); px(c, 25, 10, 1, 6, '#ffd21f');
  px(c, 7, 7, 18, 1, '#fff2a0'); px(c, 15, 5, 2, 10, '#c4452b'); // faixa central
  px(c, 8, 14, 16, 2, '#1b1230');                     // viseira levantada (sombra)
  px(c, 8, 15, 16, 1, '#3a8fe0');
  // barba cheia + bigode (a tira do capacete some na barba)
  px(c, 9, 21, 2, 5, DAVI_BEARD); px(c, 21, 21, 2, 5, DAVI_BEARD); px(c, 10, 24, 12, 3, DAVI_BEARD); px(c, 13, 23, 6, 1, DAVI_BEARD);
  // sobrancelhas definidas, olhos atentos, nariz reto e marcado, sorriso de canto
  px(c, 11, 17, 4, 1, DAVI_HAIR); px(c, 17, 17, 4, 1, DAVI_HAIR);
  px(c, 11, 19, 3, 2, '#fff'); px(c, 18, 19, 3, 2, '#fff'); px(c, 12, 19, 1, 2, '#1c1c24'); px(c, 19, 19, 1, 2, '#1c1c24');
  px(c, 15, 18, 2, 5, DAVI_SKIN); px(c, 17, 18, 1, 4, DAVI_SKIN_SHADE); px(c, 14, 22, 4, 1, DAVI_SKIN_SHADE);
  px(c, 13, 24, 6, 2, '#5a1e1e'); px(c, 13, 24, 6, 1, '#fff');   // sorriso largo dentro da barba
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

// ---- ícones de gesto 14x14 (balões de fala) ------------------------------------
export function drawGesture(cv, kind) {
  const c = ctx2(cv, 14, 14);
  const sk = '#d9a066', ol = '#1b1230';
  const hand = (x, y) => { px(c, x - 1, y - 1, 6, 6, ol); px(c, x, y, 4, 4, sk); };
  if (kind === 'bracoPraFora') { px(c, 0, 3, 14, 1, '#8fcf6a'); px(c, 0, 4, 5, 6, '#3a8fe0'); px(c, 5, 6, 6, 3, sk); hand(9, 4); px(c, 11, 3, 1, 2, sk); }
  else if (kind === 'buzinaImaginaria') { px(c, 2, 2, 10, 10, ol); px(c, 3, 3, 8, 8, '#ffd23a'); px(c, 5, 5, 4, 4, ol); px(c, 6, 6, 2, 2, '#ffd23a'); px(c, 0, 0, 1, 3, ol); px(c, 13, 0, 1, 3, ol); }
  else if (kind === 'maosNaCabeca') { px(c, 4, 4, 6, 7, ol); px(c, 5, 5, 4, 5, sk); px(c, 5, 5, 4, 1, '#2a1a12'); px(c, 1, 2, 3, 5, sk); px(c, 10, 2, 3, 5, sk); px(c, 1, 2, 3, 1, ol); px(c, 10, 2, 3, 1, ol); }
  else if (kind === 'apontando') { px(c, 1, 5, 6, 4, ol); px(c, 2, 6, 5, 2, sk); px(c, 7, 6, 6, 2, sk); px(c, 7, 5, 6, 1, ol); px(c, 7, 8, 6, 1, ol); px(c, 2, 8, 4, 3, sk); }
  else if (kind === 'joinha') { px(c, 2, 6, 8, 6, ol); px(c, 3, 7, 6, 4, sk); px(c, 5, 1, 3, 6, ol); px(c, 6, 2, 1, 5, sk); px(c, 10, 7, 2, 4, '#3a8fe0'); }
  else if (kind === 'banana') { px(c, 1, 8, 4, 4, sk); px(c, 3, 3, 3, 6, sk); px(c, 3, 2, 8, 3, sk); px(c, 3, 1, 8, 1, ol); px(c, 11, 2, 1, 4, ol); px(c, 5, 5, 2, 4, ol); }
  else px(c, 4, 4, 6, 6, '#bbb');
}
