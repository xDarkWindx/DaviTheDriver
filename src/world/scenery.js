// Cenário procedural instanciado: blocos sobre pilotis (Sudoeste/superquadras), setores comerciais,
// Esplanada dos Ministérios, ipês e cerrado, capim, postes, guard-rails, gramados e placas.
// Densidades vêm de quality.density. Tudo é determinístico (seed fixa).
import { makeOBB, makeCircle, makeContact, collide } from '../core/collision.js';
import { samplePts } from './roadNetwork.js';

const GREEN_GLASS_BAND = 0x3f7d6c;
const RES_COLORS = [0xf3ecdf, 0xefe2cf, 0xe9d8c4, 0xf1d6cf, 0xd9e3e6, 0xe7e0c9, 0xf6f3ec, 0xdfd0e0];
const OFFICE_COLORS = [0xe6e3dc, 0xd9d5cc, 0xc9c6c0, 0xeae6de];
const OFFICE_GLASS = [0x3f6f7d, 0x2f5866, 0x4f7a6a, 0x58788a, 0x35505e];
const TREE_COLORS = {
  ipe_rosa: [0xe2649a, 0xec78ae, 0xd5558c],
  ipe_amarelo: [0xf5c518, 0xf0d22a, 0xe8b710],
  ipe_branco: [0xf6f2ec, 0xeee9e2],
  ipe_roxo: [0x9c5ac8, 0xa66ad0],
  cerrado: [0x6f7d3a, 0x7c8a40, 0x667433, 0x84914a],
  mangueira: [0x3f7030, 0x4a7c34, 0x3a682c],
  jaqueira: [0x2c5a2a, 0x33632e, 0x284f25],
  palmeira: [0x6c9a3e, 0x79a646, 0x5f8c38],
  arbusto: [0x5f8a3a, 0x6f9440, 0x587f35, 0x86964a],
};

export class SceneryBuilder {
  constructor({ net, inst, mb, colliders, quality, rng }) {
    Object.assign(this, { net, inst, mb, colliders, quality, rng });
    this.dens = quality.density;
    this._tmp = []; this._c = makeContact();
    this.stats = { buildings: 0, trees: 0, tufts: 0, lamps: 0 };
  }

  /** true se a área (círculo r) está livre de colisores existentes. */
  free(x, z, r) {
    const n = this.colliders.query(x, z, r + 2, this._tmp);
    const probe = makeCircle(x, z, r);
    for (let i = 0; i < n; i++) if (collide(probe, this._tmp[i], this._c)) return false;
    return true;
  }

  // ------------------------------------------------------------------ prédios
  /**
   * Bloco genérico. opts: { pilotis, floors, floorH, facade: 'res'|'office'|'office2'|null, roof, color, minClear,
   * balconies (lajes de varanda na fachada principal), stair (caixa de escada/elevador no telhado) }.
   * Fachada = textura gerada em canvas repetida em metros pelo shader (render/materials.js makeFacadeMaterial).
   */
  building(x, z, w, d, rot, opts = {}) {
    const floors = opts.floors || 6, fh = opts.floorH || 3, pil = opts.pilotis ? 3.2 : 0;
    const H = floors * fh;
    const r = Math.hypot(w, d) / 2;
    if (this.dens.buildings < 1 && this.rng() > this.dens.buildings) return false;
    if (this.net.clearance(x, z, r + 20) < r * 0.75 + (opts.minClear ?? 5)) return false;
    const col = makeOBB(x, z, w / 2, d / 2, rot);
    const n = this.colliders.query(x, z, r + 2, this._tmp);
    for (let i = 0; i < n; i++) if (collide(col, this._tmp[i], this._c)) return false;
    col.kind = 'building'; col.id = 'b' + this.stats.buildings;
    this.colliders.add(col);
    const I = this.inst, color = opts.color ?? this.rng.pick(RES_COLORS);
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    if (pil) {
      const nx = Math.max(2, Math.round(w / 7));
      for (let i = 0; i <= nx; i++) for (const k of [-1, 1]) {
        const [px, pz] = at(-w / 2 + 0.6 + (w - 1.2) * (i / nx), k * (d / 2 - 1.2));
        I.add('box', px, 0, pz, rot, 0.7, pil, 0.7, 0xd8d2c4);
      }
      I.add('box', x, 0, z, rot, Math.min(5, w * 0.16), pil, d * 0.62, 0x8fa7ae); // hall de vidro
      I.add('box', x, pil - 0.45, z, rot, w + 0.3, 0.45, d + 0.3, 0xcfc8ba);      // laje de transição
    }
    const facade = opts.facade === undefined ? 'res' : opts.facade;
    if (facade) I.add(facade === 'res' ? 'bres' : facade === 'office' ? 'boff' : 'boff2', x, pil, z, rot, w, H, d, color);
    else {
      I.add('box', x, pil, z, rot, w, H, d, color);
      const band = opts.bandColor ?? 0x3e5560;
      for (let f = 0; f < floors; f++) I.add('box', x, pil + f * fh + fh * 0.45, z, rot, w + 0.15, fh * 0.38, d + 0.15, band);
    }
    I.add('box', x, pil + H, z, rot, w + 0.4, 0.45, d + 0.4, opts.roof ?? 0xcfc6b4);    // platibanda
    if (opts.balconies) {                                                                // lajes de varanda (relevo)
      for (let f = 1; f <= floors; f++) for (const k of [1, -1]) {
        const [bx, bz] = at(0, k * (d / 2 + 0.45));
        I.add('box', bx, pil + f * fh - 0.18, bz, rot, w - 2, 0.16, 0.9, 0xe9e4d8);
      }
    }
    if (opts.stair !== false && H > 10) {                                                // caixa de escada / casa de máquinas
      const [sx, sz] = at(w * 0.18, 0);
      I.add('box', sx, pil + H, sz, rot, 4.2, 2.8, Math.min(d - 2, 6), 0xd9d3c5);
      const [tx, tz] = at(-w * 0.22, 0);
      I.add('box', tx, pil + H, tz, rot, 3, 1.6, 3, 0xbab4a6);                       // caixa d'água
    }
    if (this.quality.shadows !== 'none') I.add('blob', x, 0.04, z + 2 + H * 0.06, rot, w + 4 + H * 0.1, 1, d + 4 + H * 0.15, 0);
    this.stats.buildings++;
    return true;
  }

  // ------------------------------------------------------------------ vegetação
  /** Árvore por espécie (ver world/props.js). kind: ipe_rosa|ipe_amarelo|ipe_branco|ipe_roxo|mangueira|jaqueira|cerrado|palmeira|arbusto */
  tree(x, z, kind, scale = 1, needClear = 2.5) {
    if (this.net.clearance(x, z, 12) < needClear) return false;
    if (!this.free(x, z, 1.2)) return false;
    const rng = this.rng, cols = TREE_COLORS[kind];
    const type = kind.startsWith('ipe') ? 'tree_ipe' : 'tree_' + kind;
    const sc = scale * (0.85 + rng() * 0.3);
    this.inst.add(type, x, 0, z, rng() * 6.283, sc, sc * (0.9 + rng() * 0.2), sc, cols[Math.floor(rng() * cols.length)]);
    const cr = kind === 'arbusto' ? 0.8 : kind === 'palmeira' ? 1.6 : kind === 'cerrado' ? 1.6 : kind === 'mangueira' ? 3.2 : 2.4;
    if (this.quality.shadows !== 'none') this.inst.add('blob', x + 0.8 * sc, 0.03, z + 1.4 * sc, 0, cr * 2.2 * sc, 1, cr * 2.2 * sc, 0);
    if (kind !== 'arbusto') {
      const col = makeCircle(x, z, (kind === 'mangueira' || kind === 'jaqueira' ? 0.5 : 0.35) * scale); col.kind = 'tree'; this.colliders.add(col);
    }
    this.stats.trees++;
    return true;
  }

  tuft(x, z, s = 1) {
    const rng = this.rng;
    const col = rng() < 0.5 ? 0xb9a75c : rng() < 0.5 ? 0x9d9c55 : 0xc8b46a;
    this.inst.add('tuft', x, 0, z, rng() * 6, 0.5 * s + rng() * 0.4, 0.5 * s + rng() * 0.6, 0.5 * s + rng() * 0.4, col);
    this.stats.tufts++;
  }

  /** Espalha n árvores num retângulo (x0..x1, z0..z1) com mistura de espécies. */
  forest(x0, z0, x1, z1, n, mix) {
    const rng = this.rng;
    const kinds = Object.keys(mix), weights = kinds.map((k) => mix[k]);
    const tot = weights.reduce((a, b) => a + b, 0);
    n = Math.round(n * this.dens.trees);
    for (let i = 0; i < n * 2 && n > 0; i++) {
      let r = rng() * tot, k = 0;
      while (r > weights[k]) { r -= weights[k]; k++; }
      if (this.tree(x0 + rng() * (x1 - x0), z0 + rng() * (z1 - z0), kinds[k])) n--;
    }
  }

  scrub(x0, z0, x1, z1, n) {
    const rng = this.rng;
    n = Math.round(n * this.dens.scrub);
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
      if (this.net.clearance(x, z, 6) < 1.2) continue;
      // tufos em grupos
      const g = 1 + Math.floor(rng() * 4);
      for (let k = 0; k < g; k++) this.tuft(x + (rng() - 0.5) * 3, z + (rng() - 0.5) * 3, 0.8 + rng() * 0.6);
    }
  }

  // ------------------------------------------------------------------ mobiliário de via
  /** Postes ao longo de um segmento (lado(s) indicados), a cada `step` m. side: 1 direita, -1 esquerda, 0 canteiro. */
  lampsAlong(segId, step = 40, sides = [1, -1]) {
    const seg = this.net.getSegment(segId), T = { x: 0, z: 0, tx: 0, tz: 0 };
    step /= Math.max(0.2, this.dens.lamps);
    const nA = this.net.getNode(seg.from), nB = this.net.getNode(seg.to);
    for (let s = nA.radius + 10; s < seg.length - nB.radius - 10; s += step) {
      samplePts(seg.pts, seg.cum, s, T);
      for (const side of sides) {
        const off = side === 0 ? 0 : side > 0 ? seg.edgeR + 1.4 : seg.edgeL - 1.4;
        const x = T.x - T.tz * off, z = T.z + T.tx * off;
        if (side !== 0 && this.net.clearance(x, z, 6) < 0.6) continue;
        if (side === 0 && this.net.roadInfoAt(x, z, this._info || (this._info = {})).onRoad) continue; // canteiro cruzando outra via
        // braço aponta para a pista: poste simples à direita/esquerda, duplo no canteiro
        const h = Math.atan2(T.tx, T.tz) + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
        this.inst.add(side === 0 ? 'poste2' : 'poste', x, 0, z, h, 1, 1, 1, 0xffffff);
        const col = makeCircle(x, z, 0.3); col.kind = 'pole'; this.colliders.add(col);
        this.stats.lamps++;
      }
    }
  }

  /** Fileira de árvores ao longo de uma via (offset m além da borda), dá sensação de velocidade. */
  rowAlong(segId, offset = 7, step = 14, kinds = ['ipe_amarelo', 'ipe_rosa', 'mangueira'], sides = [1, -1]) {
    const seg = this.net.getSegment(segId), T = { x: 0, z: 0, tx: 0, tz: 0 };
    step /= Math.max(0.2, this.dens.trees);
    for (let s = 8; s < seg.length - 8; s += step) {
      samplePts(seg.pts, seg.cum, s, T);
      for (const side of sides) {
        const off = side > 0 ? seg.edgeR + offset : seg.edgeL - offset;
        const j = (this.rng() - 0.5) * 3;
        this.tree(T.x - T.tz * (off + j * side), T.z + T.tx * (off + j * side), this.rng.pick(kinds), 0.9 + this.rng() * 0.3, 3);
      }
    }
  }

  /** Bancos e lixeiras na calçada (lado direito e esquerdo alternados), a cada ~step m. */
  furnitureAlong(segId, step = 50) {
    const seg = this.net.getSegment(segId), T = { x: 0, z: 0, tx: 0, tz: 0 };
    const dens = this.dens.furniture ?? 1;
    if (dens <= 0) return;
    step /= dens;
    const nA = this.net.getNode(seg.from), nB = this.net.getNode(seg.to);
    let k = 0;
    for (let s = nA.radius + 12 + this.rng() * 10; s < seg.length - nB.radius - 12; s += step, k++) {
      samplePts(seg.pts, seg.cum, s, T);
      const side = k % 2 ? 1 : -1, off = side > 0 ? seg.edgeR + 2.0 : seg.edgeL - 2.0;
      const x = T.x - T.tz * off, z = T.z + T.tx * off;
      if (this.net.clearance(x, z, 6) < 0.9 || !this.free(x, z, 1)) continue;
      const h = Math.atan2(T.tx, T.tz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2); // banco de frente para a rua
      if (k % 3 === 2) this.inst.add('lixeira', x, 0, z, h, 1, 1, 1, this.rng.pick([0xe2702a, 0x3f8f4a]));
      else {
        this.inst.add('banco', x, 0, z, h, 1, 1, 1, 0xffffff);
        const c = makeOBB(x, z, 0.9, 0.3, h); c.kind = 'pole'; this.colliders.add(c);
      }
    }
  }

  /** Guard-rail contínuo ao longo da borda de um segmento (side 1 = direita, -1 = esquerda). */
  guardrail(segId, side, gap = 6) {
    if (this.dens.guardrails <= 0) return;
    const seg = this.net.getSegment(segId);
    const nA = this.net.getNode(seg.from), nB = this.net.getNode(seg.to);
    const T0 = { x: 0, z: 0, tx: 0, tz: 0 }, T1 = { x: 0, z: 0, tx: 0, tz: 0 };
    const off = side > 0 ? seg.edgeR + 0.9 : seg.edgeL - 0.9;
    const s0 = nA.radius + gap, s1 = seg.length - nB.radius - gap;
    const piece = 8;
    for (let s = s0; s < s1 - 1; s += piece) {
      const e = Math.min(s + piece, s1);
      samplePts(seg.pts, seg.cum, s, T0); samplePts(seg.pts, seg.cum, e, T1);
      const ax = T0.x - T0.tz * off, az = T0.z + T0.tx * off, bx = T1.x - T1.tz * off, bz = T1.z + T1.tx * off;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, len = Math.hypot(bx - ax, bz - az), h = Math.atan2(bx - ax, bz - az);
      if (this.net.clearance(mx, mz, 8) < 0.3) continue; // não invade outra via (cruzamentos)
      this.inst.add('box', mx, 0.45, mz, h, 0.12, 0.32, len + 0.1, 0xd7dadd);   // lâmina
      this.inst.add('box', ax, 0, az, h, 0.14, 0.75, 0.14, 0x6d7075);           // poste
      const col = makeOBB(mx, mz, 0.25, len / 2, h); col.kind = 'guardrail'; this.colliders.add(col);
    }
  }
}

/** Monta todo o cenário. */
export function buildScenery(sb) {
  const { net, mb, rng } = sb;
  const LAWN = 0x93a453, LAWN2 = 0x8a9c4c, PARK = 0x9fa85a;

  // --- gramados: canteiro central do Eixo, Esplanada, Parque da Cidade, Parque Urbano do Sudoeste
  // gramado com borda suave: duas franjas em tons intermediários entre a grama e o cerrado
  const GROUNDISH = 0xb7aa72;
  const mix = (a, b, t) => { const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255; return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t); };
  const soft = (x, z, h, hl, hw, y, col) => {
    mb.rect(x, z, h, hl + 5, hw + 5, y - 0.008, mix(col, GROUNDISH, 0.72));
    mb.rect(x, z, h, hl + 2.5, hw + 2.5, y - 0.004, mix(col, GROUNDISH, 0.4));
    mb.rect(x, z, h, hl, hw, y, col);
  };
  soft(-350, 0, Math.PI / 2, 1100, 33.5, 0.02, LAWN);
  soft(560, 72, Math.PI / 2, 200, 24, 0.02, LAWN2);
  soft(560, -72, Math.PI / 2, 200, 24, 0.02, LAWN2);
  soft(-720, 440, 0, 300, 230, 0.02, PARK);
  soft(-1130, 560, 0, 60, 70, 0.02, PARK);
  // lago do Parque da Cidade
  mb.disc(-800, 420, 36, 0.03, 0x4f86a0, 28);
  mb.ring(-800, 420, 36, 38, 0.031, 0xcfc8b0, 28);
  const lake = makeCircle(-800, 420, 36); lake.kind = 'water'; sb.colliders.add(lake);

  // Av. das Jaqueiras: mangueiras e jaqueiras SÓLIDAS rente ao meio-fio (posições em net.avenueTreeSlots)
  for (const t of net.avenueTreeSlots) sb.tree(t.x, t.z, t.kind, 1.05, 0.8);

  // --- Sudoeste: projeções de 6 andares sobre pilotis (QRSW 1/2 etc.) + comércio local (CCSW)
  for (let z = 110; z <= 600; z += 44) {
    for (let x = -1470; x <= -1090; x += 62) {
      if (Math.abs(x + 1390) < 40 && Math.abs(z - 165) < 30) continue; // casa
      sb.building(x + rng.range(-5, 5), z + rng.range(-4, 4), 44 + rng() * 8, 12, rng() < 0.8 ? 0 : Math.PI / 2, { pilotis: true, floors: 6, minClear: 6, balconies: true });
    }
  }
  for (let x = -1330; x <= -1270; x += 30) { // CCSW (comércio local), toldos coloridos
    for (const zz of [228, 268]) {
      if (sb.building(x, zz, 24, 10, 0, { facade: null, floors: 2, floorH: 3.4, color: 0xe9e2d2, bandColor: rng.pick([0xc9443a, 0x2f7fb5, 0xe0a52a, 0x3f9b55]), minClear: 2.6 })) {
        sb.inst.add('box', x, 3.2, zz - 5.6, 0, 22, 0.25, 2.2, rng.pick([0xd8573e, 0x3b88c4, 0xe9b33b, 0x55a868]));
      }
    }
  }
  sb.forest(-1490, 90, -1080, 620, 260, { ipe_rosa: 2, ipe_amarelo: 2, mangueira: 4, cerrado: 1, ipe_branco: 1, palmeira: 0.8, arbusto: 2 });
  sb.forest(-1170, 520, -1080, 620, 40, { ipe_amarelo: 2, ipe_roxo: 1, mangueira: 2 });     // Parque Urbano do Sudoeste
  // Cruzeiro (a oeste da Jaqueiras): casas baixas
  for (let i = 0; i < 70; i++) {
    sb.building(-1760 + rng() * 220, 120 + rng() * 950, 12 + rng() * 8, 10 + rng() * 6, rng() < 0.5 ? 0 : Math.PI / 2,
      { facade: null, stair: false, floors: 1, floorH: 3.2, color: rng.pick([0xf2e3c8, 0xe8c9a8, 0xd9e6e8, 0xf0d0c0]), bandColor: 0x6b5b4b, roof: 0xb4553a, minClear: 4 });
  }

  // --- Setor de Indústrias Gráficas (SIG): galpões baixos entre EPIG e Parque, perto do Eixo
  for (let i = 0; i < 22; i++) {
    sb.building(-960 + rng() * 380, 90 + rng() * 90, 26 + rng() * 20, 18 + rng() * 10, 0,
      { facade: null, stair: false, floors: 2, floorH: 4, color: rng.pick([0xd8d5cc, 0xc9c4b8, 0xe2ded4]), bandColor: 0x7a8a96, roof: 0x9a9890, minClear: 5 });
  }

  // --- Parque da Cidade (enorme, ao sul do Eixo, entre EPIG e W3)
  sb.forest(-990, 190, -460, 800, 620, { mangueira: 4, cerrado: 3, ipe_amarelo: 1.5, ipe_rosa: 1, ipe_roxo: 0.6, palmeira: 1, jaqueira: 0.6, arbusto: 2 });

  // --- Superquadras Sul (entre W3 e Eixão; entre Eixão e L2; além da L2)
  const superquadra = (x0, z0, x1, z1) => {
    for (let x = x0 + 30; x < x1 - 20; x += 62) {
      for (let z = z0 + 26; z < z1 - 14; z += 48) {
        const rot = rng() < 0.65 ? 0 : Math.PI / 2;
        sb.building(x + rng.range(-6, 6), z + rng.range(-5, 5), 44 + rng() * 10, 12, rot, { pilotis: true, floors: 6, minClear: 8, balconies: true });
      }
    }
    sb.forest(x0, z0, x1, z1, ((x1 - x0) * (z1 - z0)) / 900, { mangueira: 4, ipe_rosa: 1.5, ipe_amarelo: 1.5, ipe_branco: 0.6, cerrado: 1, jaqueira: 0.5, palmeira: 0.4, arbusto: 1.5 });
  };
  superquadra(-400, 300, -30, 680);
  superquadra(-400, 720, -30, 1150);
  superquadra(30, 300, 470, 680);
  superquadra(120, 805, 470, 1150);
  superquadra(530, 520, 1150, 680);
  superquadra(530, 730, 1150, 1150);
  superquadra(-1000, 820, -460, 1150);

  // --- Setores comerciais/autarquias (prédios altos de vidro)
  const setor = (x0, z0, x1, z1, n) => {
    for (let i = 0; i < n * 3 && n > 0; i++) {
      const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
      const w = 22 + rng() * 22, d = 16 + rng() * 10;
      if (sb.building(x, z, w, d, rng() < 0.5 ? 0 : Math.PI / 2, { floors: 8 + Math.floor(rng() * 9), floorH: 3.4, facade: rng() < 0.6 ? 'office' : 'office2',
        color: rng.pick(OFFICE_COLORS), roof: 0xb9b4a8, minClear: 6 })) n--;
    }
  };
  setor(-400, 70, -40, 200, 14);    // Setor Comercial Sul (SCS) / Hoteleiro Sul
  setor(-400, 250, -40, 290, 4);
  setor(130, 175, 470, 240, 8);     // SAUS
  setor(530, 175, 770, 240, 5);
  setor(-460, -340, -60, -70, 22);  // Setor Comercial/Hoteleiro Norte
  setor(60, -340, 330, -170, 10);
  setor(-560, -700, -60, -380, 18);
  setor(860, 300, 1150, 420, 6);    // SAFS: TST, TSE e vizinhos
  setor(840, 60, 1000, 130, 3);

  // --- Esplanada dos Ministérios: duas fileiras de blocos idênticos (eixo longo N-S)
  for (let i = 0; i < 8; i++) {
    const x = 380 + i * 46;
    for (const zz of [122, -122]) sb.building(x, zz, 15, 64, 0, { floors: 10, floorH: 3.4, facade: 'office2', color: 0xe4e2da, roof: 0xcbc6b8, minClear: 3 });
  }

  // --- Eixo: ipês no gramado central
  for (let x = -1380; x < 720; x += 55) {
    if (Math.abs(x + 330) < 30 || Math.abs(x - 60) < 50) continue;
    sb.tree(x + rng.range(-8, 8), rng.range(-22, 22), rng.pick(['ipe_amarelo', 'ipe_rosa', 'ipe_branco', 'ipe_roxo']), 0.9);
  }

  // --- cerrado aberto nas sobras do mapa
  const B = net.bounds;
  sb.forest(B.minX, B.minZ, B.maxX, -380, 260, { cerrado: 6, ipe_amarelo: 1, ipe_roxo: 0.5, palmeira: 1, arbusto: 3 });
  sb.forest(-1450, -360, -760, -60, 160, { cerrado: 5, ipe_amarelo: 1, palmeira: 1, arbusto: 3 });
  sb.forest(1000, -700, B.maxX, 240, 100, { cerrado: 5, ipe_amarelo: 1 });
  sb.forest(-1480, 640, -1080, B.maxZ, 160, { cerrado: 5, ipe_amarelo: 1, mangueira: 1 });

  // capim do cerrado (tufos baixos) — sensação de velocidade à beira da pista
  sb.scrub(B.minX, B.minZ, B.maxX, B.maxZ, 2600);
  sb.scrub(-1500, 0, 0, 700, 500);

  // --- fileiras de árvores à beira das vias
  for (const id of ['qrsw2', 'qrsw2_e', 'quarta_av', 'quarta_av_s', 'terceira_w', 'terceira_m', 'terceira_e', 'segunda_w', 'segunda_e', 'eqrsw',
    'rua_q1', 'rua_q34', 'rua_q56', 'clsw', 'primeira_av',
    'w3_n', 'w3_m', 'w3_s', 'l2_n', 'l2_b', 'l2_m', 'l2_s', 'ent_w', 'ent_e', 'ent_far', 's3_safs', 's3_saus', 's3_saus_w', 's3_mid_e', 's3_mid', 's3_scs',
    's2_alca', 's2_a', 's2_b', 'safs_n', 'l2m_east', 'safs_east'])
    sb.rowAlong(id, 6.5, 13);
  sb.rowAlong('parque', 5, 9, ['mangueira', 'ipe_amarelo', 'ipe_rosa', 'cerrado', 'mangueira']);
  for (const id of ['epig_n', 'epig_m', 'epig_s', 'epig_far', 'rw_north', 'rw_west', 're_north'])
    sb.rowAlong(id, 9, 16, ['cerrado', 'cerrado', 'ipe_amarelo', 'ipe_roxo']);
  for (const id of ['eixao_n', 'eixao_n2', 'eixao_m', 'eixao_s']) sb.rowAlong(id, 10, 15, ['mangueira', 'ipe_rosa', 'ipe_amarelo', 'cerrado']);
  for (const id of ['eixo_s1_a', 'eixo_s1_b', 'eixo_n1', 'eixo_n1_e']) sb.rowAlong(id, 9, 22, ['ipe_amarelo', 'ipe_rosa', 'ipe_branco', 'cerrado']);

  // --- postes e guard-rails
  for (const id of ['eixo_s1_a', 'eixo_s1_b', 'eixo_s1_c0', 'eixo_s1_c', 'eixo_s1_d', 'eixo_n1', 'eixo_n1_e']) sb.lampsAlong(id, 42, [1, -1]);
  for (const id of ['eixao_n', 'eixao_n2', 'eixao_m', 'eixao_s']) sb.lampsAlong(id, 50, [0]);
  for (const id of ['w3_n', 'w3_m', 'w3_s', 'l2_n', 'l2_b', 'l2_m', 'l2_s', 'epig_n', 'epig_m', 'epig_s', 'jaq_n', 'jaq_m', 'jaq_s', 'jaq_s2', 's2_alca', 's2_a', 's2_b'])
    sb.lampsAlong(id, 46, [0]);
  for (const id of ['qrsw2', 'qrsw2_e', 'segunda_w', 'terceira_w', 's3_safs', 's3_saus', 's3_saus_w', 's3_mid_e', 's3_scs', 'safs_n', 'ent_w', 'ent_e', 'parque']) sb.lampsAlong(id, 36, [1, -1]);
  for (const id of ['eixao_n', 'eixao_n2', 'eixao_m', 'eixao_s', 'epig_n', 'epig_m', 'epig_s', 'epig_far', 'rw_north', 'rw_west']) { sb.guardrail(id, 1); sb.guardrail(id, -1); }
  for (const id of ['tes', 'eixao_ramp', 'alca_eixao', 'alca_rodo']) { sb.guardrail(id, 1, 3); sb.guardrail(id, -1, 3); }

  // --- mobiliário urbano nas calçadas (bancos e lixeiras) e arbustos nos canteiros
  for (const id of ['qrsw2', 'qrsw2_e', 'segunda_w', 'terceira_w', 'terceira_m', 's3_safs', 's3_saus', 's3_saus_w', 's3_mid_e', 's3_mid', 's3_scs', 'w3_m', 'w3_n', 'ent_e', 'parque', 'jaq_m', 'jaq_s'])
    sb.furnitureAlong(id, 55);
  for (const b of net.busStops) {
    const h = b.heading, fx = Math.sin(h), fz = Math.cos(h);
    sb.inst.add('lixeira', b.shelterX + fx * 3.4, 0, b.shelterZ + fz * 3.4, h + Math.PI, 1, 1, 1, 0xe2702a);
  }
}
