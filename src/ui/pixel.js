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

// ---- rostos (HUD, balões, fim) e avatar do menu: DADOS em ui/faces.js ------------
// O desenho é dado (paleta + matriz de strings por expressão), não código: edite ui/faces.js. Aqui só se pinta.
import { DAVI_FACE, DONO_FACE, DAVI_HELMET, FACE_SIZE, AVATAR_SIZE } from './faces.js';
export { FACE_SIZE, AVATAR_SIZE };

/** Pinta uma matriz de strings (1 caractere = 1 pixel; '.' = transparente) com a paleta dada. */
export function paintRows(c, rows, palette, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) { const col = palette[r[x]]; if (col) px(c, ox + x, oy + y, 1, 1, col); }
  }
}

/** Rosto 24×24. who: 'davi' | 'dono'; tone: 'calm' | 'anx' | 'stress' | 'panic'. */
export function drawFace(cv, who, tone, extra = null) {
  const set = who === 'davi' ? DAVI_FACE : DONO_FACE;
  const c = ctx2(cv, FACE_SIZE, FACE_SIZE);
  paintRows(c, set.faces[tone] || set.faces.calm, set.palette);
}

/** Avatar provisório do menu (Davi de capacete), 32×32. */
export function drawDaviHelmet(cv) {
  const c = ctx2(cv, AVATAR_SIZE, AVATAR_SIZE);
  paintRows(c, DAVI_HELMET.rows, DAVI_HELMET.palette);
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
