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
  ipe_rosa: [0xe8649f, 0xf07ab4, 0xd9558f],
  ipe_amarelo: [0xf5c518, 0xf0d22a, 0xe8b710],
  ipe_branco: [0xf6f2ec, 0xeee9e2],
  ipe_roxo: [0x9c5ac8, 0xa66ad0],
  cerrado: [0x6f7d3a, 0x7c8a40, 0x667433, 0x84914a],
  mangueira: [0x4f7d36, 0x5b8a3c, 0x46742f],
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
  /** Bloco genérico. opts: { pilotis, floors, floorH, bandColor, roof, color, minClear } */
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
    if (pil) {
      const nx = Math.max(2, Math.round(w / 7));
      for (let i = 0; i <= nx; i++) for (const k of [-1, 1]) {
        const lx = -w / 2 + 0.6 + (w - 1.2) * (i / nx), lz = k * (d / 2 - 1.2);
        I.add('box', x + lx * c + lz * s, 0, z - lx * s + lz * c, rot, 0.7, pil, 0.7, 0xd8d2c4);
      }
      I.add('box', x, 0, z, rot, Math.min(4, w * 0.15), pil, d * 0.6, 0x9aa3a6); // hall de vidro
    }
    I.add('box', x, pil, z, rot, w, H, d, color);
    const band = opts.bandColor ?? 0x3e5560;
    for (let f = 0; f < floors; f++) I.add('box', x, pil + f * fh + fh * 0.45, z, rot, w + 0.15, fh * 0.38, d + 0.15, band);
    I.add('box', x, pil + H, z, rot, w + 0.4, 0.5, d + 0.4, opts.roof ?? 0xcfc6b4);
    // sombra (sol de Brasília vem do norte: sombra levemente ao sul)
    if (this.quality.shadows === 'blob') I.add('blob', x, 0.04, z + 2 + H * 0.06, rot, w + 4 + H * 0.1, 1, d + 4 + H * 0.15, 0);
    this.stats.buildings++;
    return true;
  }

  // ------------------------------------------------------------------ vegetação
  tree(x, z, kind, scale = 1, needClear = 2.5) {
    if (this.net.clearance(x, z, 12) < needClear) return false;
    if (!this.free(x, z, 1.2)) return false;
    const rng = this.rng, cols = TREE_COLORS[kind];
    const isCerrado = kind === 'cerrado';
    const trunkH = (isCerrado ? 1.4 + rng() * 1.2 : 2.6 + rng() * 2.2) * scale;
    const cr = (isCerrado ? 1.8 + rng() * 1.6 : 2.2 + rng() * 1.6) * scale;
    const lean = isCerrado ? (rng() - 0.5) * 0.5 : 0;
    this.inst.addEuler('trunk', x, 0, z, lean, rng() * 6, 0, 1.2 * scale, trunkH + cr * 0.3, 1.2 * scale, isCerrado ? 0x4b3a2a : 0x5a4634);
    const cc = cols[Math.floor(rng() * cols.length)];
    const sy = isCerrado ? 0.55 + rng() * 0.2 : 0.75 + rng() * 0.2;
    this.inst.addEuler('crown', x + lean * trunkH * 0.5, trunkH + cr * sy * 0.6, z, 0, rng() * 6, 0, cr, cr * sy, cr * (0.85 + rng() * 0.3), cc);
    if (!isCerrado && rng() < 0.5) // segundo tufo de copa
      this.inst.addEuler('crown', x + (rng() - 0.5) * cr, trunkH + cr * sy * 0.9, z + (rng() - 0.5) * cr, 0, rng() * 6, 0, cr * 0.7, cr * 0.6 * sy, cr * 0.7, cc);
    if (this.quality.shadows === 'blob') this.inst.add('blob', x + 0.6, 0.03, z + 1.2, 0, cr * 2.3, 1, cr * 2.3, 0);
    const col = makeCircle(x, z, 0.45 * scale); col.kind = 'tree'; this.colliders.add(col);
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
        const h = Math.atan2(T.tx, T.tz);
        this.inst.add('box', x, 0, z, h, 0.22, 9, 0.22, 0x7d8085);
        // braço: aponta para a pista
        const arm = side === 0 ? [1, -1] : [side > 0 ? -1 : 1];
        for (const a of arm) {
          const ax = x - T.tz * a * 1.3, az = z + T.tx * a * 1.3;
          this.inst.add('box', ax, 8.8, az, h + Math.PI / 2, 0.14, 0.14, 2.6, 0x7d8085);
          this.inst.add('box', x - T.tz * a * 2.5, 8.6, z + T.tx * a * 2.5, h + Math.PI / 2, 0.35, 0.22, 0.9, 0xf2f0e0);
        }
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
  mb.rect(-350, 0, Math.PI / 2, 1100, 33.5, 0.02, LAWN);
  mb.rect(560, 72, Math.PI / 2, 200, 24, 0.02, LAWN2);
  mb.rect(560, -72, Math.PI / 2, 200, 24, 0.02, LAWN2);
  mb.rect(-720, 440, 0, 300, 230, 0.015, PARK);
  mb.rect(-1130, 560, 0, 60, 70, 0.015, PARK);
  // lago do Parque da Cidade
  mb.disc(-800, 420, 36, 0.03, 0x4f86a0, 28);
  mb.ring(-800, 420, 36, 38, 0.031, 0xcfc8b0, 28);
  const lake = makeCircle(-800, 420, 36); lake.kind = 'water'; sb.colliders.add(lake);

  // --- Sudoeste: projeções de 6 andares sobre pilotis (QRSW 1/2 etc.) + comércio local (CCSW)
  for (let z = 110; z <= 600; z += 44) {
    for (let x = -1470; x <= -1090; x += 62) {
      if (Math.abs(x + 1390) < 40 && Math.abs(z - 165) < 30) continue; // casa
      sb.building(x + rng.range(-5, 5), z + rng.range(-4, 4), 44 + rng() * 8, 12, rng() < 0.8 ? 0 : Math.PI / 2, { pilotis: true, floors: 6, minClear: 6 });
    }
  }
  for (let x = -1330; x <= -1270; x += 30) { // CCSW (comércio local), toldos coloridos
    for (const zz of [228, 268]) {
      if (sb.building(x, zz, 24, 10, 0, { floors: 2, floorH: 3.4, color: 0xe9e2d2, bandColor: rng.pick([0xc9443a, 0x2f7fb5, 0xe0a52a, 0x3f9b55]), minClear: 2.6 })) {
        sb.inst.add('box', x, 3.2, zz - 5.6, 0, 22, 0.25, 2.2, rng.pick([0xd8573e, 0x3b88c4, 0xe9b33b, 0x55a868]));
      }
    }
  }
  sb.forest(-1490, 90, -1080, 620, 260, { ipe_rosa: 2, ipe_amarelo: 2, mangueira: 4, cerrado: 1, ipe_branco: 1 });
  sb.forest(-1170, 520, -1080, 620, 40, { ipe_amarelo: 2, ipe_roxo: 1, mangueira: 2 });     // Parque Urbano do Sudoeste
  // Cruzeiro (a oeste da Jaqueiras): casas baixas
  for (let i = 0; i < 70; i++) {
    sb.building(-1760 + rng() * 220, 120 + rng() * 950, 12 + rng() * 8, 10 + rng() * 6, rng() < 0.5 ? 0 : Math.PI / 2,
      { floors: 1, floorH: 3.2, color: rng.pick([0xf2e3c8, 0xe8c9a8, 0xd9e6e8, 0xf0d0c0]), bandColor: 0x6b5b4b, roof: 0xb4553a, minClear: 4 });
  }

  // --- Setor de Indústrias Gráficas (SIG): galpões baixos entre EPIG e Parque, perto do Eixo
  for (let i = 0; i < 22; i++) {
    sb.building(-960 + rng() * 380, 90 + rng() * 90, 26 + rng() * 20, 18 + rng() * 10, 0,
      { floors: 2, floorH: 4, color: rng.pick([0xd8d5cc, 0xc9c4b8, 0xe2ded4]), bandColor: 0x7a8a96, roof: 0x9a9890, minClear: 5 });
  }

  // --- Parque da Cidade (enorme, ao sul do Eixo, entre EPIG e W3)
  sb.forest(-990, 190, -460, 800, 620, { mangueira: 4, cerrado: 3, ipe_amarelo: 1.5, ipe_rosa: 1, ipe_roxo: 0.6 });

  // --- Superquadras Sul (entre W3 e Eixão; entre Eixão e L2; além da L2)
  const superquadra = (x0, z0, x1, z1) => {
    for (let x = x0 + 30; x < x1 - 20; x += 62) {
      for (let z = z0 + 26; z < z1 - 14; z += 48) {
        const rot = rng() < 0.65 ? 0 : Math.PI / 2;
        sb.building(x + rng.range(-6, 6), z + rng.range(-5, 5), 44 + rng() * 10, 12, rot, { pilotis: true, floors: 6, minClear: 8 });
      }
    }
    sb.forest(x0, z0, x1, z1, ((x1 - x0) * (z1 - z0)) / 900, { mangueira: 4, ipe_rosa: 1.5, ipe_amarelo: 1.5, ipe_branco: 0.6, cerrado: 1 });
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
      if (sb.building(x, z, w, d, rng() < 0.5 ? 0 : Math.PI / 2, { floors: 8 + Math.floor(rng() * 9), floorH: 3.4,
        color: rng.pick(OFFICE_COLORS), bandColor: rng.pick(OFFICE_GLASS), roof: 0xb9b4a8, minClear: 6 })) n--;
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
    for (const zz of [122, -122]) sb.building(x, zz, 15, 64, 0, { floors: 10, floorH: 3.4, color: 0xe4e2da, bandColor: GREEN_GLASS_BAND, roof: 0xcbc6b8, minClear: 3 });
  }

  // --- Eixo: ipês no gramado central
  for (let x = -1380; x < 720; x += 55) {
    if (Math.abs(x + 330) < 30 || Math.abs(x - 60) < 50) continue;
    sb.tree(x + rng.range(-8, 8), rng.range(-22, 22), rng.pick(['ipe_amarelo', 'ipe_rosa', 'ipe_branco', 'ipe_roxo']), 0.9);
  }

  // --- cerrado aberto nas sobras do mapa
  const B = net.bounds;
  sb.forest(B.minX, B.minZ, B.maxX, -380, 260, { cerrado: 6, ipe_amarelo: 1, ipe_roxo: 0.5 });
  sb.forest(-1450, -360, -760, -60, 160, { cerrado: 5, ipe_amarelo: 1 });
  sb.forest(1000, -700, B.maxX, 240, 100, { cerrado: 5, ipe_amarelo: 1 });
  sb.forest(-1480, 640, -1080, B.maxZ, 160, { cerrado: 5, ipe_amarelo: 1, mangueira: 1 });

  // capim do cerrado (tufos baixos) — sensação de velocidade à beira da pista
  sb.scrub(B.minX, B.minZ, B.maxX, B.maxZ, 2600);
  sb.scrub(-1500, 0, 0, 700, 500);

  // --- fileiras de árvores à beira das vias
  for (const id of ['qrsw2', 'quarta_av', 'terceira_w', 'terceira_e', 'eqrsw', 'jaq_n', 'jaq_m', 'jaq_s', 'jaq_far', 'primeira_av',
    'w3_n', 'w3_m', 'w3_s', 'l2_n', 'l2_b', 'l2_m', 'l2_s', 'ent_w', 'ent_e', 'ent_far', 's3_safs', 's3_saus', 's3_mid_e', 's3_mid', 's3_scs',
    's2_a', 's2_b', 's2_c', 'safs_n', 'l2m_east', 'safs_east'])
    sb.rowAlong(id, 6.5, 13);
  sb.rowAlong('parque', 5, 9, ['mangueira', 'ipe_amarelo', 'ipe_rosa', 'cerrado', 'mangueira']);
  for (const id of ['epig_n', 'epig_m', 'epig_s', 'epig_far', 'rw_north', 'rw_west', 're_north'])
    sb.rowAlong(id, 9, 16, ['cerrado', 'cerrado', 'ipe_amarelo', 'ipe_roxo']);
  for (const id of ['eixao_n', 'eixao_m', 'eixao_s']) sb.rowAlong(id, 10, 15, ['mangueira', 'ipe_rosa', 'ipe_amarelo', 'cerrado']);
  for (const id of ['eixo_s1_a', 'eixo_s1_b', 'eixo_n1']) sb.rowAlong(id, 9, 22, ['ipe_amarelo', 'ipe_rosa', 'ipe_branco', 'cerrado']);

  // --- postes e guard-rails
  for (const id of ['eixo_s1_a', 'eixo_s1_b', 'eixo_s1_c', 'eixo_s1_d', 'eixo_n1']) sb.lampsAlong(id, 42, [1, -1]);
  for (const id of ['eixao_n', 'eixao_m', 'eixao_s']) sb.lampsAlong(id, 50, [0]);
  for (const id of ['w3_n', 'w3_m', 'w3_s', 'l2_n', 'l2_b', 'l2_m', 'l2_s', 'epig_n', 'epig_m', 'epig_s', 'jaq_n', 'jaq_m', 'jaq_s', 's2_a', 's2_b', 's2_c'])
    sb.lampsAlong(id, 46, [0]);
  for (const id of ['qrsw2', 's3_safs', 's3_saus', 's3_mid_e', 's3_scs', 'safs_n', 'ent_w', 'ent_e', 'parque']) sb.lampsAlong(id, 36, [1, -1]);
  for (const id of ['eixao_n', 'eixao_m', 'eixao_s', 'epig_n', 'epig_m', 'epig_s', 'epig_far', 'rw_north', 'rw_west']) { sb.guardrail(id, 1); sb.guardrail(id, -1); }
  for (const id of ['tes', 'eixao_ramp']) { sb.guardrail(id, 1, 3); sb.guardrail(id, -1, 3); }
}
