// Modelos procedurais de veículos e pessoas (sem textura externa, geometria mesclada, cor por vértice).
//
//  • Carros do jogador (tabela MODELS; chave = VEHICLES[*].model): Kwid branco e C4 Cactus THP grafite.
//    Carroceria "lofted": anéis de seção transversal ao longo do comprimento (capô, para-brisa inclinado,
//    colunas, teto e traseira modelados, cantos chanfrados, caixas de roda RECORTADAS no perfil).
//    ~2.000–3.000 triângulos por carro. buildVehicleModel() monta carroceria + vidros (Phong com brilho) +
//    4 rodas instanciadas (pneu + aro, giram e esterçam via player.js) + luzes de freio/ré + sombra blob.
//  • Tráfego (TRAFFIC_MODELS): sedan, hatch, suv, picape, onibus, mudanca, moto, autoescola — ~400–900 tri,
//    pensados para InstancedMesh: buildTrafficModel(kind) devolve geometria com atributo `paint` (1 = lataria,
//    recebe a cor da instância; 0 = vidro/borracha/luzes, não tinge) + material próprio (makeVehicleMaterial).
//  • Pessoas (PEOPLE_MODELS): pedestre e agente de trânsito (colete) — buildPersonModel(kind).
// Convenção: frente para +Z, largura em X, chão em y = 0, dimensões em metros.
import * as THREE from 'three';
import { makeMaskedMaterial, LIVE_SHADOW } from '../render/materials.js';

// ================================================================ builder de triângulos
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _n3 = new THREE.Matrix3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

/** Junta triângulos com cor por vértice + máscara de pintura (paint) numa BufferGeometry. */
class PartBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.paint = []; }
  /** Triângulo com normal plana; `out` = ponto de referência "de dentro" (garante normal para fora). */
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, color, paint = 0, inX = NaN, inY = 0, inZ = 0) {
    _a.set(bx - ax, by - ay, bz - az); _b.set(cx - ax, cy - ay, cz - az); _n.crossVectors(_a, _b);
    const l = _n.length(); if (l < 1e-9) return;
    _n.multiplyScalar(1 / l);
    if (inX === inX) { // !NaN: orienta para fora
      const mx = (ax + bx + cx) / 3 - inX, my = (ay + by + cy) / 3 - inY, mz = (az + bz + cz) / 3 - inZ;
      if (mx * _n.x + my * _n.y + mz * _n.z < 0) { _n.negate(); const tx = bx, ty = by, tz = bz; bx = cx; by = cy; bz = cz; cx = tx; cy = ty; cz = tz; }
    }
    _c.set(color);
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let i = 0; i < 3; i++) { this.nor.push(_n.x, _n.y, _n.z); this.col.push(_c.r, _c.g, _c.b); this.paint.push(paint); }
  }
  quad(a, b, c, d, color, paint, inn) {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], color, paint, inn[0], inn[1], inn[2]);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], color, paint, inn[0], inn[1], inn[2]);
  }
  /** Primitiva three (BoxGeometry etc.) transformada: posição, rotação Euler YXZ, escala. */
  add(geom, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, paint = 0) {
    _p.set(x, y, z); _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz);
    _m4.compose(_p, _q, _s);
    const g = geom.index ? geom.toNonIndexed() : geom;
    const P = g.attributes.position, N = g.attributes.normal;
    // color === null: mantém as cores/paint da própria geometria (peças pré-montadas)
    const CA = color === null ? g.attributes.color : null, PA = color === null ? g.attributes.paint : null;
    _n3.getNormalMatrix(_m4); if (color !== null) _c.set(color);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m4); this.pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); this.nor.push(_n.x, _n.y, _n.z);
      if (CA) this.col.push(CA.getX(i), CA.getY(i), CA.getZ(i)); else this.col.push(_c.r, _c.g, _c.b);
      this.paint.push(PA ? PA.getX(i) : paint);
    }
    if (g !== geom) g.dispose();
    return this;
  }
  box(w, h, d, color, x, y, z, ry = 0, rx = 0, rz = 0, paint = 0) { return this.add(BOX, color, x, y, z, rx, ry, rz, w, h, d, paint); }
  /** Caixa chanfrada (octógono em seção) — cantos "arredondados" baratos. */
  cbox(w, h, d, color, x, y, z, ry = 0, rx = 0, rz = 0, paint = 0) { return this.add(CBOX, color, x, y, z, rx, ry, rz, w, h, d, paint); }
  /** Cilindro com eixo em X (rodas, faróis redondos). */
  cylX(r, w, seg, color, x, y, z, paint = 0, r2 = r) {
    const g = cylGeo(r, r2, w, seg);
    return this.add(g, color, x, y, z, 0, 0, Math.PI / 2, 1, 1, 1, paint);
  }
  /** Disco voltado para +X (aro, flanco, tampa): só a face, `seg` triângulos. */
  discX(r, seg, color, x, y, z, paint = 0) { return this.add(discGeo(seg), color, x, y, z, 0, Math.PI / 2, 0, r, r, 1, paint); }
  cylY(r, h, seg, color, x, y, z, paint = 0, r2 = r) { return this.add(cylGeo(r, r2, h, seg), color, x, y, z, 0, 0, 0, 1, 1, 1, paint); }
  cylZ(r, h, seg, color, x, y, z, paint = 0, r2 = r) { return this.add(cylGeo(r, r2, h, seg), color, x, y, z, Math.PI / 2, 0, 0, 1, 1, 1, paint); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('paint', new THREE.Float32BufferAttribute(this.paint, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  get triangles() { return this.pos.length / 9; }
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CBOX = (() => { // prisma octogonal unitário ao longo de Z (seção chanfrada em X/Y)
  const g = new THREE.CylinderGeometry(0.5 / Math.cos(Math.PI / 8), 0.5 / Math.cos(Math.PI / 8), 1, 8, 1);
  g.rotateY(Math.PI / 8); g.rotateX(Math.PI / 2);
  return g;
})();
const _discCache = new Map();
function discGeo(seg) { let g = _discCache.get(seg); if (!g) { g = new THREE.CircleGeometry(1, seg); _discCache.set(seg, g); } return g; }
const _cylCache = new Map();
function cylGeo(r, r2, h, seg, open = false) {
  const k = `${r}|${r2}|${h}|${seg}|${open}`;
  let g = _cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r, r2, h, seg, 1, open); _cylCache.set(k, g); }
  return g;
}

// ================================================================ carroceria "lofted"
// Anel (meia seção, lado direito, de baixo para cima): 10 pontos => 9 faixas (bands):
//  0 fundo · 1 chanfro inferior · 2 saia/moldura (até yMold) · 3 lateral baixa · 4 lateral alta (até a cintura)
//  5 ombro (cintura → base do vidro) · 6 estufa/vidro lateral · 7 chanfro do teto · 8 teto/capô/para-brisa
function ringPoints(p) {
  const pts = [
    [0, p.yb], [p.ws - 0.07, p.yb], [p.ws, p.yb + 0.06], [p.ws, p.yMold], [p.ws + 0.006, p.yMid],
    [p.ws - 0.012, p.yBelt], [p.wg, p.yBelt + 0.035], [p.wt, p.yTop - p.ch], [p.wt - p.ch * 1.3, p.yTop], [0, p.yTop],
  ];
  for (let i = 1; i < pts.length; i++) if (pts[i][1] < pts[i - 1][1] + 0.004) pts[i][1] = pts[i - 1][1] + 0.004;
  return pts;
}

/**
 * Gera carroceria a partir de `spec`:
 *   stations: z[] (de trás para frente); prof(z) -> { yb, ws, yMold, yMid, yBelt, wg, yTop, wt, ch }
 *   band(k, z) -> [cor, paint] da faixa k entre estações; cap(end, k) -> [cor, paint] ('rear'|'front')
 * Glass (faixas cuja cor === spec.glass) vai para `glassB` se fornecido.
 */
function loft(b, spec, glassB = null) {
  const rings = spec.stations.map((z) => ({ z, pts: ringPoints(spec.prof(z)) }));
  const nb = 9;
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1], zm = (r0.z + r1.z) / 2;
    const yc = (r0.pts[0][1] + r0.pts[9][1]) / 2;
    for (let k = 0; k < nb; k++) {
      const [col, paint] = spec.band(k, zm);
      const tb = glassB && col === spec.glass ? glassB : b;
      for (const sx of [1, -1]) {
        const a = [r0.pts[k][0] * sx, r0.pts[k][1], r0.z], bb = [r0.pts[k + 1][0] * sx, r0.pts[k + 1][1], r0.z];
        const c = [r1.pts[k + 1][0] * sx, r1.pts[k + 1][1], r1.z], d = [r1.pts[k][0] * sx, r1.pts[k][1], r1.z];
        tb.quad(a, bb, c, d, col, paint, [0, yc, zm]);
      }
    }
  }
  for (const [end, r, dz] of [['rear', rings[0], -1], ['front', rings[rings.length - 1], 1]]) {
    for (let k = 0; k < nb; k++) {
      const [col, paint] = spec.cap(end, k);
      const tb = glassB && col === spec.glass ? glassB : b;
      const a = [r.pts[k][0], r.pts[k][1], r.z], bb = [r.pts[k + 1][0], r.pts[k + 1][1], r.z];
      const c = [-r.pts[k + 1][0], r.pts[k + 1][1], r.z], d = [-r.pts[k][0], r.pts[k][1], r.z];
      tb.quad(a, bb, c, d, col, paint, [0, r.pts[k][1], r.z - dz]);
    }
  }
  return rings;
}

/** Curva por partes (lista [[z, valor], ...] crescente em z), interpolação suave (smoothstep). */
function curve(pts) {
  return (z) => {
    if (z <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (z <= pts[i][0]) {
        const t = (z - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]), u = t * t * (3 - 2 * t);
        return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u;
      }
    }
    return pts[pts.length - 1][1];
  };
}
/** Estações: base uniforme + pontos extras nas caixas de roda (recorte suave) e nas quebras do perfil. */
function stationsFor(L, wheelZ, archR, n, extra = [], arch = 6) {
  const set = new Set();
  for (let i = 0; i <= n; i++) set.add(+(-L / 2 + (L * i) / n).toFixed(4));
  for (const zw of wheelZ) for (let i = -arch; i <= arch; i++) {
    const z = zw + (archR * i) / arch;
    if (Math.abs(z) < L / 2 - 0.02) set.add(+z.toFixed(4));
  }
  for (const z of extra) if (Math.abs(z) < L / 2) set.add(+z.toFixed(4));
  const arr = [...set].sort((a, b) => a - b);
  const out = [arr[0]];
  const minGap = Math.max(0.035, L / 70);
  for (let i = 1; i < arr.length; i++) if (arr[i] - out[out.length - 1] > minGap) out.push(arr[i]); else if (i === arr.length - 1) out[out.length - 1] = arr[i];
  return out;
}
/** Altura da borda inferior com recorte da caixa de roda. */
function archBottom(z, base, wheelZ, R, archR) {
  let y = base;
  for (const zw of wheelZ) {
    const d = z - zw;
    if (Math.abs(d) < archR) y = Math.max(y, R + Math.sqrt(archR * archR - d * d) * 0.98);
  }
  return y;
}
function nearArch(z, wheelZ, r) { for (const zw of wheelZ) if (Math.abs(z - zw) < r) return true; return false; }

// ================================================================ rodas
/** Roda: pneu + flanco + aro (estilo por `rim`). Eixo em X, face externa em +X. */
function wheelGeo(b, R, W, rim, seg = 14) {
  const TIRE = 0x1a1a1b, SIDE = 0x252527;
  b.add(cylGeo(R, R, W, seg, true), TIRE, 0, 0, 0, 0, 0, Math.PI / 2);        // banda de rodagem (tubo aberto)
  b.discX(R * 0.97, seg, SIDE, W / 2, 0, 0);                                   // flanco
  const rr = R * rim.size;
  b.discX(rr, seg, rim.base, W / 2 + 0.008, 0, 0);                             // aro
  const n = rim.spokes;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (rim.twin) b.add(BOX, rim.spoke, W / 2 + 0.018, Math.cos(a) * rr * 0.46, Math.sin(a) * rr * 0.46, a, 0, 0, 0.012, rr * 0.9, 0.09);
    else b.add(BOX, rim.spoke, W / 2 + 0.018, Math.cos(a) * rr * 0.45, Math.sin(a) * rr * 0.45, a, 0, 0, 0.012, rr * 0.88, rim.spokeW || 0.05);
  }
  b.discX(rr * 0.24, 8, rim.hub || rim.base, W / 2 + 0.026, 0, 0);            // cubo
}

// ================================================================ Renault Kwid (facelift), BRANCO
const K = { WHITE: 0xf3f4f1, BLACK: 0x161718, TRIM: 0x1e1f21, GLASS: 0x26333f, UNDER: 0x111111, RED: 0xc0141c, RED2: 0x8e0f15,
  LENS: 0xf4f6f8, DRL: 0xe8f4ff, CHROME: 0xc9cdd2, PLATE: 0xf2f2ee, BLUE: 0x1f4fa8 };

function kwidSpec(v) {
  const L = v.length, W = v.width, H = v.height, R = 0.29, archR = 0.375, wz = [-v.wheelbase / 2, v.wheelbase / 2];
  const zR = -L / 2, zF = L / 2;
  // hatch CURTO: traseira quase vertical logo atrás da roda, teto que cai um pouco para trás, capô curto e para-brisa
  // bem inclinado; duas janelas laterais com coluna C larga na cor da carroceria (sem "cara de perua")
  const zRW = zR + 0.22; // fim do vidro traseiro (quase vertical)
  const yTop = curve([[zR, 1.08], [zR + 0.10, H - 0.10], [zRW, H - 0.05], [zR + 0.55, H - 0.015], [-0.20, H], [0.18, H - 0.01], [0.95, 1.0], [1.55, 0.885], [zF, 0.79]]);
  const zC = zR + 0.66; // fim da janela traseira (começo da coluna C)
  const hw = W / 2;
  const plan = (z) => { const t = Math.abs(z) / (L / 2); return hw - (t > 0.82 ? 0.11 * ((t - 0.82) / 0.18) ** 2 : 0) - (z > 0 && t > 0.9 ? 0.04 * (t - 0.9) / 0.1 : 0); };
  const spec = {
    glass: K.GLASS,
    stations: stationsFor(L, wz, archR, 24, [zRW, zR + 0.55, zC, 0.18, 0.95, 1.55, -0.36, -0.26], 4),
    prof(z) {
      const ws = plan(z), top = yTop(z);
      const roof = z < 0.18, hood = z > 0.95;
      const yb = archBottom(z, 0.22, wz, R, archR);
      const bumper = Math.abs(z) > v.wheelbase / 2 + archR;
      const yMold = bumper ? (z > 0 ? 0.50 : 0.53) : nearArch(z, wz, archR + 0.08) ? yb + 0.10 : 0.37;
      let yBelt = 0.93 + (z < 0 ? -z * 0.06 : 0); // linha de cintura subindo para trás (vidro traseiro pequeno)
      if (yBelt > top - 0.06) yBelt = top - 0.06;
      const wt = roof ? hw - 0.21 : hood ? ws - 0.05 : hw - 0.21 + (z - 0.18) / 0.77 * 0.16;
      const wg = hood ? ws - 0.03 : hw - 0.10;
      return { yb, ws, yMold, yMid: (yMold + yBelt) / 2 + 0.05, yBelt, wg, yTop: top, wt: Math.min(wt, wg), ch: hood ? 0.03 : 0.06 };
    },
    band(k, z) {
      if (k === 0) return [K.UNDER, 0];
      if (k <= 2) return [K.TRIM, 0];                                  // molduras grossas pretas, soleira e para-choques
      if (k <= 5) return [K.WHITE, 0];
      const ws = z > 0.18 && z <= 0.95, cabin = z <= 0.18;
      if (k === 6) {
        if (cabin && z > zC && !(z > -0.38 && z < -0.24) && z < 0.14) return [K.GLASS, 0];
        if (cabin && z > -0.38 && z < -0.24) return [K.BLACK, 0];      // coluna B preta
        return [K.WHITE, 0];
      }
      if (k === 8 && ws) return [K.GLASS, 0];                           // para-brisa inclinado
      if (k === 8 && z < zRW - 0.03) return [K.GLASS, 0];               // vidro traseiro (tampa inclinada)
      return [K.WHITE, 0];                                              // teto branco sólido
    },
    cap(end, k) {
      if (k === 0) return [K.UNDER, 0];
      if (end === 'rear') return k <= 2 ? [K.TRIM, 0] : [K.WHITE, 0];
      return k <= 3 ? [K.TRIM, 0] : [K.WHITE, 0];
    },
  };
  return { spec, R, archR, wz, zRW };
}

function kwidBody(b, v, g) {
  const { spec, wz, zRW } = kwidSpec(v);
  loft(b, spec, g);
  const L = v.length, W = v.width, H = v.height, zF = L / 2, zR = -L / 2, hw = W / 2;
  // caixas de roda: forro escuro interno
  for (const zw of wz) b.box(W - 0.42, 0.42, 0.74, 0x0c0c0c, 0, 0.47, zw);
  // ---- frente: grade preta larga ligando os filetes de DRL no alto; faróis mais abaixo em nichos pretos
  b.cbox(W - 0.46, 0.17, 0.05, K.BLACK, 0, 0.74, zF - 0.035);
  for (let i = 0; i < 3; i++) b.box(W - 0.56, 0.012, 0.02, 0x2c2e31, 0, 0.69 + i * 0.045, zF - 0.008);
  b.add(new THREE.OctahedronGeometry(0.06, 0), K.CHROME, 0, 0.76, zF - 0.005, 0, 0, 0, 1, 1.1, 0.3); // losango Renault
  for (const s of [-1, 1]) {
    b.box(0.36, 0.035, 0.03, K.DRL, s * (hw - 0.27), 0.835, zF - 0.035, s * 0.12);       // filete de luz diurna (alto)
    b.box(0.38, 0.05, 0.03, K.BLACK, s * (hw - 0.27), 0.80, zF - 0.045, s * 0.12);
    b.cbox(0.30, 0.17, 0.06, K.BLACK, s * (hw - 0.25), 0.60, zF - 0.06, s * 0.15);       // nicho preto
    b.cylZ(0.055, 0.03, 10, K.LENS, s * (hw - 0.31), 0.60, zF - 0.02);                 // farol principal
    b.cylZ(0.045, 0.03, 10, K.LENS, s * (hw - 0.19), 0.605, zF - 0.035);
    b.box(0.12, 0.05, 0.03, 0x2a2a2a, s * (hw - 0.23), 0.40, zF - 0.02);                // nicho de neblina
    b.box(0.07, 0.03, 0.06, K.TRIM, s * (hw + 0.005), 0.98, 0.52);                       // pisca lateral/retrovisor base
    // retrovisor (corpo branco, base preta)
    b.box(0.05, 0.05, 0.10, K.BLACK, s * (hw + 0.01), 0.99, 0.40);
    b.cbox(0.17, 0.10, 0.07, K.WHITE, s * (hw + 0.09), 1.03, 0.38, 0, 0, s * 0.08);
    b.box(0.13, 0.07, 0.01, K.GLASS, s * (hw + 0.09), 1.03, 0.34);
    // maçanetas
    for (const zz of [0.10, -0.62]) b.box(0.025, 0.025, 0.12, K.TRIM, s * (hw + 0.005), 0.91, zz);
  }
  // placa dianteira (Mercosul)
  b.box(0.40, 0.13, 0.02, K.PLATE, 0, 0.42, zF + 0.005); b.box(0.40, 0.025, 0.022, K.BLUE, 0, 0.475, zF + 0.006);
  // ---- traseira: lanternas vermelhas grandes nos cantos (dobram para a lateral); aerofólio; placa
  for (const s of [-1, 1]) {
    b.cbox(0.30, 0.24, 0.05, K.RED, s * (hw - 0.19), 0.99, zR + 0.012);
    b.box(0.16, 0.06, 0.052, 0xe8e8e8, s * (hw - 0.20), 0.93, zR + 0.010);              // ré/pisca
    b.cbox(0.05, 0.22, 0.24, K.RED, s * (hw - 0.025), 0.99, zR + 0.13);
    b.box(0.03, 0.15, 0.20, K.RED2, s * (hw - 0.01), 0.99, zR + 0.13);
  }
  b.box(0.42, 0.14, 0.02, K.PLATE, 0, 0.66, zR - 0.006); b.box(0.42, 0.028, 0.022, K.BLUE, 0, 0.72, zR - 0.007);
  b.add(new THREE.OctahedronGeometry(0.05, 0), K.CHROME, 0, 0.90, zR - 0.004, 0, 0, 0, 1, 1.1, 0.3);
  b.box(0.20, 0.03, 0.01, K.CHROME, 0, 0.82, zR - 0.004);                                // "KWID"
  b.cbox(W - 0.40, 0.04, 0.16, K.WHITE, 0, H + 0.005, zRW + 0.02, 0, 0.12);              // pequeno aerofólio sobre o vidro
  b.box(0.30, 0.02, 0.02, 0xb81a20, 0, H - 0.03, zRW - 0.07);                           // brake light alto
  b.box(0.26, 0.012, 0.02, K.BLACK, 0.05, 1.24, zR + 0.14, 0, -0.95);                    // limpador traseiro
  // antena no teto, na frente (fina e inclinada para trás)
  b.box(0.06, 0.03, 0.08, K.BLACK, 0.16, H + 0.005, 0.05);
  b.add(cylGeo(0.006, 0.01, 0.42, 4), K.BLACK, 0.16, H + 0.17, -0.04, -0.55, 0, 0);
  // limpadores dianteiros
  for (const s of [-1, 1]) b.box(0.45, 0.012, 0.02, K.BLACK, s * 0.22, 1.0, 0.98, 0, 0, s * 0.05);
}

// ================================================================ Citroën C4 Cactus THP, CINZA GRAFITE metálico
const C = { GRAPHITE: 0x868d96, GRAPHITE2: 0x737a83, ROOF: 0x141518, BLACK: 0x151618, TRIM: 0x1b1c1e, GLASS: 0x2a3846, UNDER: 0x101010,
  ORANGE: 0xff6a12, RED: 0xc8141e, LENS: 0xf2f4f6, DRL: 0xe6f3ff, CHROME: 0xcdd1d6, PLATE: 0xf2f2ee, BLUE: 0x1f4fa8 };

function cactusSpec(v) {
  const L = v.length, W = v.width, H = v.height, R = 0.33, archR = 0.43, wz = [-v.wheelbase / 2, v.wheelbase / 2];
  const zR = -L / 2, zF = L / 2, hw = W / 2;
  const yTop = curve([[zR, 1.12], [zR + 0.36, H - 0.03], [zR + 0.5, H], [0.32, H - 0.005], [1.12, 1.03], [1.92, 0.93], [zF, 0.84]]);
  const plan = (z) => { const t = Math.abs(z) / (L / 2); return hw - (t > 0.8 ? 0.12 * ((t - 0.8) / 0.2) ** 2 : 0); };
  const rearGlass = (z) => z < zR + 0.36;
  const spec = {
    glass: C.GLASS,
    stations: stationsFor(L, wz, archR, 26, [zR + 0.36, zR + 0.5, 0.32, 1.12, 1.92], 4),
    prof(z) {
      const ws = plan(z), top = yTop(z), roof = z < 0.32, hood = z > 1.12;
      const yb = archBottom(z, 0.26, wz, R, archR);
      const bumperF = z > v.wheelbase / 2 + archR, bumperR = z < -v.wheelbase / 2 - archR;
      const yMold = bumperR ? 0.64 : bumperF ? 0.50 : nearArch(z, wz, archR + 0.09) ? yb + 0.11 : 0.44;
      let yBelt = 1.0 + (z < 0 ? -z * 0.02 : 0);
      if (yBelt > top - 0.06) yBelt = top - 0.06;
      const wt = roof ? hw - 0.24 : hood ? ws - 0.05 : hw - 0.24 + (z - 0.32) / 0.80 * 0.19;
      const wg = hood ? ws - 0.03 : hw - 0.12;
      return { yb, ws, yMold, yMid: yMold + (yBelt - yMold) * 0.55, yBelt, wg, yTop: top, wt: Math.min(wt, wg), ch: hood ? 0.03 : 0.07 };
    },
    band(k, z) {
      if (k === 0) return [C.UNDER, 0];
      if (k <= 2) return [C.TRIM, 0];
      if (k <= 5) return [k === 3 ? C.GRAPHITE2 : C.GRAPHITE, 0];
      const cabin = z <= 0.32, hood = z > 1.12;
      if (hood) return [C.GRAPHITE, 0];
      if (k === 6) return cabin ? (rearGlass(z) ? [C.BLACK, 0] : [C.GLASS, 0]) : [C.BLACK, 0]; // estufa escura "flutuante"
      if (rearGlass(z)) return [C.GLASS, 0];
      if (!cabin) return k === 8 ? [C.GLASS, 0] : [C.BLACK, 0];       // para-brisa + coluna A preta
      return [C.ROOF, 0];                                              // teto PRETO
    },
    cap(end, k) {
      if (k === 0) return [C.UNDER, 0];
      if (end === 'rear') return k <= 3 ? [C.TRIM, 0] : k <= 5 ? [C.GRAPHITE, 0] : [C.ROOF, 0];
      return k <= 3 ? [C.TRIM, 0] : [C.GRAPHITE, 0];
    },
  };
  return { spec, R, archR, wz };
}

function cactusBody(b, v, g) {
  const { spec, wz } = cactusSpec(v);
  loft(b, spec, g);
  const L = v.length, W = v.width, H = v.height, zF = L / 2, zR = -L / 2, hw = W / 2;
  for (const zw of wz) b.box(W - 0.46, 0.48, 0.84, 0x0c0c0c, 0, 0.55, zw);
  // ---- teto preto com barras longitudinais (pés + barra)
  for (const s of [-1, 1]) {
    b.cbox(0.05, 0.05, 1.70, C.BLACK, s * (hw - 0.30), H + 0.075, -0.62);
    for (const zz of [-1.42, 0.18]) b.cbox(0.07, 0.07, 0.14, C.BLACK, s * (hw - 0.30), H + 0.03, zz);
  }
  b.box(0.05, 0.05, 0.15, C.BLACK, 0, H + 0.025, -1.55);                                  // antena "barbatana"
  // ---- frente em dois andares: DRL fino no alto ligado aos chevrons; farol abaixo em nicho preto
  b.box(0.30, 0.06, 0.03, C.CHROME, 0, 0.90, zF - 0.012);                                 // chevrons
  b.box(0.30, 0.012, 0.032, C.CHROME, 0, 0.865, zF - 0.012);
  for (const s of [-1, 1]) {
    b.box(0.46, 0.022, 0.03, C.DRL, s * (hw - 0.40), 0.885, zF - 0.03, s * 0.14);         // DRL fino
    b.box(0.46, 0.012, 0.03, C.CHROME, s * (hw - 0.40), 0.865, zF - 0.03, s * 0.14);
    b.cbox(0.42, 0.17, 0.06, C.BLACK, s * (hw - 0.30), 0.70, zF - 0.06, s * 0.2);         // nicho
    b.cylZ(0.06, 0.03, 10, C.LENS, s * (hw - 0.36), 0.70, zF - 0.035);
    b.cylZ(0.05, 0.03, 10, C.LENS, s * (hw - 0.22), 0.705, zF - 0.06);
    // moldura LARANJA do farol de neblina (canto inferior)
    b.cbox(0.24, 0.12, 0.05, C.ORANGE, s * (hw - 0.24), 0.40, zF - 0.035, s * 0.2);
    b.cylZ(0.035, 0.03, 8, C.LENS, s * (hw - 0.24), 0.40, zF - 0.008);
    // aro laranja na parte baixa da porta dianteira
    b.cbox(0.03, 0.06, 0.20, C.ORANGE, s * (hw + 0.012), 0.50, 0.42);
    b.box(0.02, 0.03, 0.12, C.TRIM, s * (hw + 0.022), 0.50, 0.42);
    // retrovisor preto
    b.box(0.05, 0.05, 0.10, C.BLACK, s * (hw + 0.005), 1.06, 0.46);
    b.cbox(0.19, 0.11, 0.08, C.BLACK, s * (hw + 0.10), 1.10, 0.44, 0, 0, s * 0.08);
    for (const zz of [0.12, -0.72]) b.box(0.025, 0.025, 0.13, C.TRIM, s * (hw + 0.005), 0.97, zz);   // maçanetas
    // "airbump" discreto (faixa baixa nas portas)
    b.cbox(0.02, 0.05, 1.30, C.TRIM, s * (hw + 0.008), 0.56, -0.15);
  }
  b.cbox(W - 0.52, 0.15, 0.05, 0x1f2022, 0, 0.52, zF - 0.02);                              // grade inferior
  b.box(0.40, 0.13, 0.02, C.PLATE, 0, 0.53, zF + 0.012); b.box(0.40, 0.025, 0.022, C.BLUE, 0, 0.585, zF + 0.013);
  // ---- traseira: lanternas vermelhas horizontais finas, para-choque preto grosso, placa, vidro inclinado
  for (const s of [-1, 1]) {
    b.cbox(0.48, 0.09, 0.05, C.RED, s * (hw - 0.30), 0.98, zR + 0.02);
    b.cbox(0.05, 0.08, 0.20, C.RED, s * (hw - 0.03), 0.98, zR + 0.12);
    b.box(0.08, 0.025, 0.02, 0xc81018, s * (hw - 0.30), 0.27, zR + 0.0);                 // refletor no para-choque
  }
  b.box(0.42, 0.14, 0.02, C.PLATE, 0, 0.80, zR - 0.006); b.box(0.42, 0.028, 0.022, C.BLUE, 0, 0.855, zR - 0.007);
  b.box(0.18, 0.07, 0.01, C.CHROME, 0, 0.94, zR - 0.006);
  b.cbox(W - 0.40, 0.05, 0.14, C.ROOF, 0, H - 0.03, zR + 0.32, 0, -0.1);               // spoiler preto sobre o vidro
  for (const s of [-1, 1]) b.box(0.50, 0.012, 0.02, C.BLACK, s * 0.24, 1.06, 1.11, 0, 0, s * 0.05);
}

// ================================================================ tabela dos carros do jogador
export const MODELS = {
  kwid: { body: kwidBody, wheelR: 0.29, wheelW: 0.165,
    rim: { size: 0.62, base: 0x2b2e33, lip: 0x3a3e44, spoke: 0x3c4046, spokes: 4, spokeW: 0.07, hub: 0x55595f },
    // luzes de freio/ré: [x (lado +), y, z, w, h] (espelhadas)
    brake: [[0.0, 0.99, -0.01, 0.30, 0.24]], reverse: [[0.0, 0.93, -0.012, 0.16, 0.06]], brakeInset: 0.19 },
  cactus: { body: cactusBody, wheelR: 0.33, wheelW: 0.2,
    rim: { size: 0.66, base: 0x1d1e21, lip: 0xd9dce0, spoke: 0xe2e5e9, spokes: 5, twin: true, hub: 0x2a2b2e },
    brake: [[0.0, 0.98, -0.005, 0.48, 0.09]], reverse: [[0.0, 0.27, -0.005, 0.10, 0.03]], brakeInset: 0.30 },
};

/** Geometria mesclada da carroceria (com vidros). Atributos: position, normal, color, paint. */
export function buildBodyGeometry(vehicle) {
  const b = new PartBuilder();
  MODELS[vehicle.model].body(b, vehicle, null);
  return b.build();
}

/** Materiais de veículo: Phong com cor por vértice; com InstancedMesh, a cor da instância só tinge onde paint = 1. */
export function makeVehicleMaterial(opts = {}) {
  return makeMaskedMaterial('phong', { shininess: opts.shininess ?? 38, specular: opts.specular ?? 0x3a3a3a });
}
export function makeGlassMaterial() {
  return new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 110, specular: 0xb4c2cc, emissive: 0x05080b });
}

const _o = new THREE.Vector3(), _f = new THREE.Vector3();
/**
 * Constrói o modelo completo do veículo do jogador.
 * Retorna { root, body, wheels, wheelSlots, brake, reverse, shadow, wheelR, triangles }.
 *  root: Object3D posicionado pelo player (x,z,heading); body: Group com rolagem.
 *  brake.visible é ligado pelo player; a luz de ré acende sozinha quando o carro anda para trás.
 */
export function buildVehicleModel(vehicle, quality, blobTexture) {
  const M = MODELS[vehicle.model];
  const root = new THREE.Group(); root.name = 'vehicle:' + vehicle.id;
  const body = new THREE.Group(); root.add(body);
  const b = new PartBuilder(), g = new PartBuilder();
  M.body(b, vehicle, g);
  const castShadow = quality.shadows === 'shadowmap';
  const bodyMesh = new THREE.Mesh(b.build(), makeVehicleMaterial({ shininess: vehicle.model === 'cactus' ? 55 : 30, specular: vehicle.model === 'cactus' ? 0x5a5a5a : 0x2e2e2e }));
  bodyMesh.name = 'body'; bodyMesh.castShadow = castShadow;
  const glassMesh = new THREE.Mesh(g.build(), makeGlassMaterial());
  glassMesh.name = 'glass'; glassMesh.castShadow = castShadow;
  body.add(bodyMesh, glassMesh);
  // rodas instanciadas (pneu + aro)
  const wb = new PartBuilder(); wheelGeo(wb, M.wheelR, M.wheelW, M.rim, 18);
  const wheels = new THREE.InstancedMesh(wb.build(), makeVehicleMaterial({ shininess: 60, specular: 0x555555 }), 4);
  wheels.frustumCulled = false; wheels.castShadow = castShadow; wheels.name = 'wheels';
  root.add(wheels);
  const tx = vehicle.width / 2 - M.wheelW / 2 - 0.05;
  const wheelSlots = [
    { x: -tx, z: vehicle.wheelbase / 2, front: true, side: -1 }, { x: tx, z: vehicle.wheelbase / 2, front: true, side: 1 },
    { x: -tx, z: -vehicle.wheelbase / 2, front: false, side: -1 }, { x: tx, z: -vehicle.wheelbase / 2, front: false, side: 1 },
  ];
  // luzes de freio e ré (malhas separadas, sem iluminação)
  const lamp = (list, color) => {
    const lb = new PartBuilder();
    for (const [, y, dz, w, h] of list) for (const s of [-1, 1]) lb.cbox(w + 0.02, h + 0.02, 0.03, color, s * (vehicle.width / 2 - M.brakeInset), y, -vehicle.length / 2 + dz - 0.012);
    const mesh = new THREE.Mesh(lb.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    return mesh;
  };
  const brake = lamp(M.brake, 0xff2020); brake.visible = false; brake.name = 'brake';
  const reverse = lamp(M.reverse, 0xffffff); reverse.name = 'reverse';
  // ré: detecta movimento para trás no próprio render (sem depender de estado externo)
  reverse.material.transparent = true; reverse.material.opacity = 0;
  let px = NaN, pz = NaN, lit = 0;
  reverse.onBeforeRender = () => {
    root.getWorldPosition(_o);
    if (px === px) {
      const h = root.rotation.y, mv = (_o.x - px) * Math.sin(h) + (_o.z - pz) * Math.cos(h);
      lit = mv < -0.004 ? 1 : mv > 0.004 ? 0 : lit;
    }
    px = _o.x; pz = _o.z;
    reverse.material.opacity = lit;
  };
  reverse.renderOrder = 3;
  body.add(brake, reverse);
  // sombra blob (alternativa ao shadow map)
  let shadow = null;
  if (quality.shadows !== 'none') {
    const sg = new THREE.PlaneGeometry(vehicle.width * 1.75, vehicle.length * 1.32); sg.rotateX(-Math.PI / 2);
    shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture, transparent: true, opacity: 0.6, depthWrite: false }));
    shadow.position.set(0.1, 0.1, 0.1); shadow.renderOrder = 2; shadow.name = 'shadow';
    // com shadow map ativo vira só "oclusão de contato" fraca; se o ajuste automático desligar a sombra, volta a blob
    shadow.onBeforeRender = () => { shadow.material.opacity = LIVE_SHADOW.map ? 0.3 : 0.6; };
    root.add(shadow);
  }
  const triangles = b.triangles + g.triangles + wb.triangles * 4;
  return { root, body, wheels, wheelSlots, brake, reverse, shadow, wheelR: M.wheelR, triangles };
}

// ================================================================ TRÁFEGO (instanciável)
const T = { BLACK: 0x161718, TRIM: 0x1d1e20, GLASS: 0x26323d, UNDER: 0x111111, RED: 0xb8141b, LENS: 0xeef1f4, CHROME: 0xc4c8cd,
  PLATE: 0xf0f0ec, WHITE: 0xffffff };

/**
 * Carro genérico lofted. o = { L, W, H, wb, R, clear, hood (comprimento do capô), ws (z fim do para-brisa),
 *   rearDrop (queda do teto atrás), deck (comprimento do porta-malas: sedã), pickupBed, stations }
 * Lataria = branco com paint 1 (tinge com a cor da instância).
 */
function genericCar(b, o) {
  const L = o.L, W = o.W, H = o.H, R = o.R, archR = R + 0.07, wz = [-o.wb / 2 + (o.wbOff || 0), o.wb / 2 + (o.wbOff || 0)];
  const zR = -L / 2, zF = L / 2, hw = W / 2, P = T.WHITE;
  const zHood = zF - o.hood, zWs = zHood - o.wsLen;           // início do capô; início do para-brisa (topo)
  const zDeck = o.deck ? zR + o.deck : null;                  // fim do porta-malas (sedã)
  const zBed = o.bed ? zR + o.bed : null;                     // fim da caçamba (picape)
  const yHood = o.yHood;
  const pts = [[zR, zDeck ? yHood + 0.02 : zBed ? o.yBelt + 0.02 : H - (o.rearDrop || 0.12)]];
  if (zDeck) pts.push([zDeck - 0.02, yHood + 0.05], [zDeck + 0.42, H - 0.02]);
  else if (zBed) pts.push([zBed - 0.01, o.yBelt + 0.02], [zBed + 0.01, H - 0.06], [zBed + 0.12, H]);
  else pts.push([zR + (o.rearSlope || 0.12), H - 0.02]);
  pts.push([zWs, H - 0.01], [zHood, yHood + 0.03], [zF - 0.08, yHood - 0.06], [zF, yHood - 0.14]);
  const yTop = curve(pts);
  const plan = (z) => { const t = Math.abs(z) / (L / 2); return hw - (t > 0.84 ? 0.10 * ((t - 0.84) / 0.16) ** 2 : 0); };
  const spec = {
    glass: -1,
    stations: stationsFor(L, wz, archR, o.n || 7, pts.map((p) => p[0]), 2),
    prof(z) {
      const ws = plan(z), top = yTop(z), hood = z > zHood, deck = zDeck !== null && z < zDeck, bed = zBed !== null && z < zBed;
      const yb = archBottom(z, o.clear, wz, R, archR);
      const bump = z > wz[1] + archR || z < wz[0] - archR;
      const yMold = bump ? o.clear + 0.22 : nearArch(z, wz, archR + 0.06) ? yb + 0.07 : o.clear + 0.10;
      let yBelt = o.yBelt;
      if (yBelt > top - 0.05) yBelt = top - 0.05;
      const flat = hood || deck || bed;
      const wt = flat ? ws - 0.05 : hw - 0.2;
      const wg = flat ? ws - 0.03 : hw - 0.09;
      return { yb, ws, yMold, yMid: (yMold + yBelt) / 2, yBelt, wg, yTop: top, wt: Math.min(wt, wg), ch: flat ? 0.03 : 0.06 };
    },
    band(k, z) {
      if (k === 0) return [T.UNDER, 0];
      if (k <= 2) return o.cladding ? [T.TRIM, 0] : k === 1 ? [T.TRIM, 0] : [P, 1];
      if (k <= 5) return [P, 1];
      const hood = z > zHood, deck = zDeck !== null && z < zDeck, bed = zBed !== null && z < zBed;
      if (hood || deck) return [P, 1];
      if (bed) return k === 8 ? [0x2a2a2a, 0] : [P, 1];
      const wsZone = z > zWs;
      if (k === 6) return wsZone ? [P, 1] : (Math.abs(z - (zWs - (zWs - (zDeck || zBed || zR)) * 0.45)) < 0.06 ? [T.BLACK, 0] : [T.GLASS, 0]);
      if (k === 8 && wsZone) return [T.GLASS, 0];
      if (zDeck !== null && z < zDeck + 0.42 && k === 8) return [T.GLASS, 0]; // vidro traseiro do sedã
      return [o.roofColor ?? P, o.roofColor !== undefined ? 0 : 1];
    },
    cap(end, k) {
      if (k === 0) return [T.UNDER, 0];
      if (k <= 2) return [T.TRIM, 0];
      if (end === 'rear' && k === 6 && !zDeck && !zBed) return [T.GLASS, 0];
      return [P, 1];
    },
  };
  loft(b, spec);
  for (const zw of wz) b.box(W - 0.4, archR, archR * 2, 0x0c0c0c, 0, R + archR * 0.35, zw);
  // faróis, grade, lanternas, retrovisores, placas
  for (const s of [-1, 1]) {
    b.box(0.30, 0.10, 0.04, T.LENS, s * (hw - 0.24), yHood - 0.15, zF - 0.03);
    b.box(0.26, 0.10, 0.04, T.RED, s * (hw - 0.2), (zDeck ? yHood - 0.08 : o.yBelt + 0.06), zR + 0.01);
    b.box(0.14, 0.08, 0.10, o.mirror ?? T.BLACK, s * (hw + 0.06), o.yBelt + 0.08, zHood - 0.05);
  }
  b.box(W - 0.75, 0.10, 0.03, T.BLACK, 0, yHood - 0.17, zF - 0.01);
  b.box(0.36, 0.12, 0.02, T.PLATE, 0, o.clear + 0.18, zF + 0.004);
  b.box(0.36, 0.12, 0.02, T.PLATE, 0, o.clear + 0.30, zR - 0.004);
  if (zBed) { // laterais e tampa da caçamba
    for (const s of [-1, 1]) b.box(0.05, 0.10, o.bed - 0.05, P, s * (hw - 0.04), o.yBelt + 0.07, zR + o.bed / 2, 0, 0, 0, 1);
    b.box(W - 0.1, 0.10, 0.05, P, 0, o.yBelt + 0.07, zR + 0.03, 0, 0, 0, 1);
  }
  return wz;
}

/** Roda simples para tráfego (8–10 segmentos). */
function trafficWheel(b, R, W, color = 0x9aa0a6) {
  b.add(cylGeo(R, R, W, 8, true), 0x1a1a1b, 0, 0, 0, 0, 0, Math.PI / 2);
  b.discX(R, 8, 0x202022, W / 2, 0, 0);
  b.discX(R * 0.6, 6, color, W / 2 + 0.006, 0, 0);
}
function bakeWheels(b, slots, R, W, rimColor) {
  const wb = new PartBuilder(); trafficWheel(wb, R, W, rimColor);
  const wg = wb.build();
  for (const s of slots) b.add(wg, null, s.x, R, s.z, 0, s.side < 0 ? Math.PI : 0, 0, 1, 1, 1, 0);
  wg.dispose();
}

function personGeo(b, o) {
  // o = { shirt (paint 1 quando null), pants, skin, hair, vest, cap, scale, bag }
  const sk = o.skin, h = o.scale || 1, paintShirt = o.shirt == null;
  const shirt = o.shirt ?? 0xffffff;
  for (const s of [-1, 1]) {
    b.box(0.13, 0.80, 0.15, o.pants, s * 0.1, 0.42, 0);                       // pernas
    b.box(0.13, 0.07, 0.24, o.shoes ?? 0x222222, s * 0.1, 0.035, 0.04);          // sapatos
    b.box(0.10, 0.58, 0.11, shirt, s * 0.27, 1.14, 0, 0, 0, s * 0.08, paintShirt ? 1 : 0); // braços
    b.box(0.08, 0.10, 0.08, sk, s * 0.29, 0.80, 0);
  }
  b.box(0.44, 0.62, 0.24, shirt, 0, 1.13, 0, 0, 0, 0, paintShirt ? 1 : 0);    // tronco
  b.box(0.40, 0.12, 0.22, o.pants, 0, 0.84, 0);
  b.box(0.1, 0.1, 0.1, sk, 0, 1.48, 0);
  b.add(new THREE.IcosahedronGeometry(0.13, 0), sk, 0, 1.62, 0.0, 0, 0, 0, 1, 1.12, 1);
  b.add(new THREE.IcosahedronGeometry(0.135, 0), o.hair, 0, 1.68, -0.02, 0, 0, 0, 1, 0.75, 1.02);
  if (o.vest) {
    b.box(0.47, 0.50, 0.27, o.vest, 0, 1.17, 0);
    for (const y of [1.04, 1.24]) b.box(0.48, 0.04, 0.28, 0xd8dde2, 0, y, 0);  // faixas refletivas
  }
  if (o.cap) { b.cylY(0.15, 0.08, 7, o.cap, 0, 1.74, 0); b.box(0.2, 0.02, 0.14, o.cap, 0, 1.71, 0.13); }
  if (o.bag) b.box(0.30, 0.36, 0.14, o.bag, 0, 1.18, -0.19);
  if (h !== 1) for (let i = 0; i < b.pos.length; i++) b.pos[i] *= h;
}

/**
 * Modelos de tráfego. Dimensões = caixa de colisão (OBB: hx = width/2, hz = length/2).
 * colors: sugestões de cor de lataria (instanceColor). massKg para colisões.
 */
export const TRAFFIC_MODELS = {
  sedan: { label: 'Sedã', length: 4.45, width: 1.75, height: 1.46, massKg: 1150, wheelR: 0.31, wheelW: 0.2,
    colors: [0xd8d8d6, 0x9ea4aa, 0x2b2d30, 0x7a1d1f, 0x1f3550, 0xe9e7e2],
    build: (b) => genericCar(b, { L: 4.45, W: 1.75, H: 1.46, wb: 2.6, R: 0.31, clear: 0.22, hood: 0.95, wsLen: 0.75, deck: 0.85, yHood: 0.96, yBelt: 0.95 }) },
  hatch: { label: 'Hatch', length: 3.95, width: 1.70, height: 1.48, massKg: 1000, wheelR: 0.30, wheelW: 0.19,
    colors: [0xd03a2f, 0xf1f1ee, 0x9aa0a6, 0x35393e, 0x2d5aa0, 0xd9c7a0],
    build: (b) => genericCar(b, { L: 3.95, W: 1.70, H: 1.48, wb: 2.5, R: 0.30, clear: 0.22, hood: 0.80, wsLen: 0.72, yHood: 0.96, yBelt: 0.95, rearSlope: 0.18 }) },
  suv: { label: 'SUV', length: 4.45, width: 1.82, height: 1.68, massKg: 1450, wheelR: 0.35, wheelW: 0.22,
    colors: [0x1e1f22, 0xe6e6e3, 0x6c7178, 0x4a3b2e, 0x8a1c1c],
    build: (b) => genericCar(b, { L: 4.45, W: 1.82, H: 1.68, wb: 2.7, R: 0.35, clear: 0.28, hood: 0.95, wsLen: 0.70, yHood: 1.10, yBelt: 1.08, cladding: true, rearSlope: 0.1 }) },
  picape: { label: 'Picape', length: 5.3, width: 1.86, height: 1.80, massKg: 1900, wheelR: 0.38, wheelW: 0.24,
    colors: [0xf0f0ee, 0x2a2b2e, 0x8d9399, 0x5b2a1f],
    build: (b) => genericCar(b, { L: 5.3, W: 1.86, H: 1.80, wb: 3.1, R: 0.38, clear: 0.32, hood: 1.15, wsLen: 0.62, bed: 1.70, yHood: 1.18, yBelt: 1.16, cladding: true, n: 8 }) },
  autoescola: { label: 'Autoescola (hatch com placa no teto)', length: 3.95, width: 1.70, height: 1.48, massKg: 1000, wheelR: 0.30, wheelW: 0.19,
    colors: [0xf4f4f2],
    build: (b) => {
      const wz = genericCar(b, { L: 3.95, W: 1.70, H: 1.48, wb: 2.5, R: 0.30, clear: 0.22, hood: 0.80, wsLen: 0.72, yHood: 0.96, yBelt: 0.95, rearSlope: 0.18 });
      // placa "AUTOESCOLA" no teto (amarela com tarja preta) + faixa lateral amarela
      for (const s of [-1, 1]) { // placa em "A" (cavalete) amarela com tarja preta "AUTOESCOLA"
        b.box(0.95, 0.34, 0.03, 0xf6c400, 0, 1.69, -0.1 + s * 0.09, 0, s * 0.42);
        b.box(0.80, 0.08, 0.035, 0x161616, 0, 1.69, -0.1 + s * 0.092, 0, s * 0.42);
      }
      b.box(0.08, 0.12, 0.08, 0x333333, -0.3, 1.52, -0.1); b.box(0.08, 0.12, 0.08, 0x333333, 0.3, 1.52, -0.1);
      for (const s of [-1, 1]) b.box(0.012, 0.12, 2.4, 0xf6c400, s * 0.857, 0.62, 0);
      return wz; // posições dos eixos: sem isto o modelo saía SEM RODAS
    } },
  onibus: { label: 'Ônibus urbano', length: 12.2, width: 2.5, height: 3.15, massKg: 13000, wheelR: 0.52, wheelW: 0.3,
    colors: [0x2c7a3f, 0x1f5fa8, 0xd7a21a, 0xb52b2b],
    build: (b) => {
      const L = 12.2, W = 2.5, H = 3.15, hw = W / 2, R = 0.52, wz = [-3.0, 3.55];
      const spec = {
        glass: -1, stations: stationsFor(L, wz, R + 0.08, 8, [L / 2 - 0.25, -L / 2 + 0.2], 2),
        prof(z) {
          const yb = archBottom(z, 0.34, wz, R, R + 0.08);
          return { yb, ws: hw - (Math.abs(z) > L / 2 - 0.2 ? 0.05 : 0), yMold: 0.62, yMid: 0.95, yBelt: 1.25, wg: hw - 0.015, yTop: H - (z > L / 2 - 0.25 ? 0.08 : 0), wt: hw - 0.1, ch: 0.1 };
        },
        band(k, z) {
          if (k === 0) return [T.UNDER, 0];
          if (k <= 1) return [T.TRIM, 0];
          if (k === 3) return [0xf2f2ee, 0];                    // faixa clara baixa
          if (k === 6) return (Math.abs(((z + 6.1) % 1.6) - 0.8) < 0.07 || z > 4.6) ? [T.BLACK, 0] : [T.GLASS, 0];
          if (k >= 7) return [0xe8e8e4, 0];                     // teto claro
          return [T.WHITE, 1];
        },
        cap(end, k) { if (k === 0) return [T.UNDER, 0]; if (k === 6) return [T.GLASS, 0]; return k >= 7 ? [0xe8e8e4, 0] : [T.WHITE, 1]; },
      };
      loft(b, spec);
      for (const zw of wz) b.box(W - 0.6, 0.6, 1.2, 0x0c0c0c, 0, 0.75, zw);
      for (const s of [-1, 1]) {
        b.cbox(0.34, 0.14, 0.04, T.LENS, s * (hw - 0.32), 0.85, L / 2 + 0.01);
        b.cbox(0.20, 0.36, 0.04, T.RED, s * (hw - 0.18), 1.0, -L / 2 - 0.01);
        b.box(0.10, 0.10, 0.36, T.BLACK, s * (hw + 0.12), 2.25, L / 2 - 0.25);       // retrovisor "orelha"
      }
      b.box(1.6, 0.26, 0.05, 0x111111, 0, H - 0.25, L / 2 + 0.01);                  // letreiro
      b.box(1.4, 0.16, 0.06, 0xffa21a, 0, H - 0.25, L / 2 + 0.012);
      b.box(1.0, 0.22, 0.02, T.PLATE, 0, 0.55, L / 2 + 0.01);
      b.box(1.2, 0.24, 0.36, 0xd9d9d6, 0, H + 0.12, -3.5);                          // ar-condicionado
      return wz;
    } },
  mudanca: { label: 'Caminhão de mudança', length: 7.4, width: 2.3, height: 3.3, massKg: 6500, wheelR: 0.47, wheelW: 0.28,
    colors: [0xf1f1ee, 0xe7c21f, 0x2e6fb0],
    build: (b) => {
      const L = 7.4, W = 2.3, hw = W / 2, zF = L / 2, R = 0.47, wz = [-2.1, 2.55];
      // cabine (lofted, branca) — sem paint (a cor varia no baú)
      const cab = { glass: -1, stations: stationsFor(1.9, [0.65 - 0.0], R + 0.08, 5, [], 2).map((z) => z + zF - 0.95),
        prof(z) { const zz = z - (zF - 0.95); const yb = archBottom(z, 0.45, [wz[1]], R, R + 0.08);
          const top = zz > 0.55 ? 2.65 - (zz - 0.55) * 0.9 : 2.65;
          return { yb, ws: hw - (zz > 0.85 ? 0.06 : 0), yMold: 0.85, yMid: 1.1, yBelt: 1.45, wg: hw - 0.04, yTop: top, wt: hw - 0.12, ch: 0.1 }; },
        band(k, z) { if (k === 0) return [T.UNDER, 0]; if (k <= 2) return [0x2a2a2a, 0]; if (k === 6) return z > zF - 0.75 ? [T.GLASS, 0] : [0xf2f2f0, 0]; return [0xf2f2f0, 0]; },
        cap(end, k) { if (k === 0) return [T.UNDER, 0]; if (end === 'front' && k === 6) return [T.GLASS, 0]; if (k <= 2) return [0x2a2a2a, 0]; return [0xf2f2f0, 0]; } };
      loft(b, cab);
      // baú (caixa com cantos chanfrados) + faixa
      const boxL = 5.25, bz = -L / 2 + boxL / 2;
      b.cbox(W, 2.55, boxL, T.WHITE, 0, 0.62 + 2.55 / 2, bz, 0, 0, 0, 1);
      b.box(W + 0.01, 0.22, boxL - 0.2, 0xd23b2a, 0, 2.2, bz);
      b.box(W - 0.2, 2.3, 0.03, 0xcfcfcb, 0, 1.9, -L / 2 - 0.01);                   // portas traseiras
      b.box(0.04, 2.2, 0.035, 0x777777, 0, 1.9, -L / 2 - 0.02);
      b.box(W - 0.3, 0.36, 4.4, 0x222222, 0, 0.52, -0.6);                            // chassi
      for (const s of [-1, 1]) {
        b.cbox(0.26, 0.12, 0.04, T.LENS, s * (hw - 0.25), 0.95, zF + 0.01);
        b.cbox(0.18, 0.2, 0.04, T.RED, s * (hw - 0.2), 0.8, -L / 2 - 0.02);
        b.box(0.08, 0.32, 0.08, T.BLACK, s * (hw + 0.1), 1.95, zF - 0.3);
      }
      b.box(W - 0.2, 0.3, 0.06, 0x222222, 0, 0.6, zF + 0.01);
      return wz;
    } },
};

/** Motoboy com baú (modelo próprio; sem lofting). */
TRAFFIC_MODELS.moto = { label: 'Moto (motoboy com baú)', length: 2.05, width: 0.8, height: 1.75, massKg: 230, wheelR: 0.3, wheelW: 0.11,
  colors: [0xc81e1e, 0xe7e7e3, 0x1d1d1d, 0xf2b300],
  build: (b) => {
    const R = 0.3;
    for (const z of [-0.68, 0.70]) { b.cylX(R, 0.11, 12, 0x1a1a1a, 0, R, z); b.cylX(R * 0.55, 0.115, 8, 0x8d9399, 0, R, z); }
    b.cbox(0.24, 0.26, 0.85, T.WHITE, 0, 0.72, 0.1, 0, -0.1, 0, 1);                  // tanque/carenagem (cor)
    b.cbox(0.22, 0.10, 0.62, 0x1b1b1b, 0, 0.84, -0.32);                             // banco
    b.box(0.12, 0.42, 0.10, 0x2a2a2a, 0, 0.58, 0.62, 0, -0.35);                     // garfo
    b.box(0.62, 0.04, 0.04, 0x222222, 0, 1.06, 0.55);                               // guidão
    b.cbox(0.16, 0.16, 0.10, T.LENS, 0, 0.92, 0.70);
    b.box(0.18, 0.08, 0.40, 0x333333, 0.1, 0.42, -0.3);                             // escapamento/motor
    b.cbox(0.48, 0.44, 0.46, 0xd31f1f, 0, 1.12, -0.80);                             // baú
    b.box(0.14, 0.06, 0.02, T.RED, 0, 0.82, -1.04);
    // motoboy: pernas, tronco, braços, capacete
    const rider = new PartBuilder();
    personGeo(rider, { shirt: 0x2b2f36, pants: 0x1f2a3a, skin: 0xb07a55, hair: 0x111111 });
    // sentado: só aproveita tronco/cabeça (desloca e inclina)
    b.add(rider.build(), null, 0, 0.30, -0.15, 0.18, 0, 0, 1, 0.9, 1);
    b.add(new THREE.IcosahedronGeometry(0.17, 1), 0xf0f0f0, 0, 1.80, -0.05, 0, 0, 0, 1, 1.05, 1.1); // capacete
    b.box(0.22, 0.06, 0.03, 0x222222, 0, 1.80, 0.12);
    return null;
  } };

/**
 * Constrói um modelo de tráfego. Retorna:
 *  { kind, geometry (com rodas fixas; atributos position/normal/color/paint), bodyGeometry (sem rodas),
 *    wheelGeometry, wheelSlots [{x, z, side, front}], wheelR, length, width, height, obb: {hx, hz}, massKg,
 *    colors, triangles }
 * Uso: new THREE.InstancedMesh(m.geometry, makeVehicleMaterial(), n) + setColorAt(i, cor) (só a lataria tinge).
 * Modelos olham para +Z (rotation.y = heading). Base em y = 0.
 */
export function buildTrafficModel(kind) {
  const def = TRAFFIC_MODELS[kind];
  if (!def) throw new Error('modelo de tráfego desconhecido: ' + kind);
  const bb = new PartBuilder();
  const wz = def.build(bb);
  const bodyGeometry = bb.build();
  const wb = new PartBuilder(); trafficWheel(wb, def.wheelR, def.wheelW);
  const wheelGeometry = wb.build();
  const tx = def.width / 2 - def.wheelW / 2 - 0.05;
  const wheelSlots = [];
  if (wz) {
    for (let i = 0; i < wz.length; i++) for (const side of [-1, 1]) wheelSlots.push({ x: side * tx, z: wz[i], side, front: i === wz.length - 1 });
    if (kind === 'mudanca' || kind === 'onibus') for (const side of [-1, 1]) wheelSlots.push({ x: side * (tx - def.wheelW - 0.02), z: wz[0], side, front: false }); // rodado duplo
  }
  const full = new PartBuilder();
  full.pos = bb.pos.slice(); full.nor = bb.nor.slice(); full.col = bb.col.slice(); full.paint = bb.paint.slice();
  if (wheelSlots.length) bakeWheels(full, wheelSlots, def.wheelR, def.wheelW);
  return {
    kind, label: def.label, geometry: full.build(), bodyGeometry, wheelGeometry, wheelSlots, wheelR: def.wheelR,
    length: def.length, width: def.width, height: def.height, obb: { hx: def.width / 2, hz: def.length / 2 },
    massKg: def.massKg, colors: def.colors.slice(), triangles: full.triangles,
  };
}

// ================================================================ PESSOAS
export const PEOPLE_MODELS = {
  pedestre: { label: 'Pedestre', radius: 0.3, height: 1.75,
    variants: [
      { pants: 0x2c3e66, skin: 0xc68e62, hair: 0x2a1c12 }, { pants: 0x3b3b3b, skin: 0x8d5a3b, hair: 0x111111 },
      { pants: 0x6b5a45, skin: 0xe2b28f, hair: 0x6b4423 }, { pants: 0x1d2633, skin: 0x5e3b26, hair: 0x0e0e0e, bag: 0x7a3b22 },
    ],
    shirts: [0xd23b3b, 0x2f7fb5, 0xf0f0ea, 0x3f9b55, 0xe0a52a, 0x7d4fa0, 0x333333] },
  agente: { label: 'Agente de trânsito (colete)', radius: 0.3, height: 1.8,
    variants: [{ shirt: 0x1d3f7a, pants: 0x1a2438, skin: 0xb07a55, hair: 0x111111, vest: 0xc8f000, cap: 0x1d3f7a, shoes: 0x0e0e0e }],
    shirts: [0xffffff] },
};

/**
 * Pessoa (~250–330 tri). kind: 'pedestre' | 'agente'; variant = índice em PEOPLE_MODELS[kind].variants.
 * Pedestre: camisa com paint = 1 (cor da instância = cor da camisa). Agente: cores fixas (paint 0).
 * Retorna { kind, geometry, radius, height, triangles }. Olha para +Z, pés em y = 0.
 */
export function buildPersonModel(kind = 'pedestre', variant = 0) {
  const def = PEOPLE_MODELS[kind];
  if (!def) throw new Error('pessoa desconhecida: ' + kind);
  const v = def.variants[variant % def.variants.length];
  const b = new PartBuilder();
  personGeo(b, { shirt: v.shirt ?? null, ...v });
  return { kind, geometry: b.build(), radius: def.radius, height: def.height, shirts: def.shirts.slice(), triangles: b.triangles };
}

export { PartBuilder };
