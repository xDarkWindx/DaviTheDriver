// Geometria das vias a partir da RoadNetwork: asfalto, canteiros, calçadas, rotatórias,
// marcações (bordas, eixo amarelo, tracejado), faixas de pedestre (zebra) e linhas de retenção.
// Tudo vira triângulos com cor por vértice em ChunkedMeshBuilder (poucos draw calls).
import { offsetPolyline, samplePts } from './roadNetwork.js';

export const ROAD_COLORS = {
  asphalt: 0x505257, asphaltDark: 0x3a3b3f, ringAsphalt: 0x55565b,
  white: 0xf4f4f0, yellow: 0xf0c03a, sidewalk: 0xc9c1b0, median: 0x8e9f55, island: 0x7f9a4c, curb: 0xdedad0,
  underShadow: 0x2c2d31, busLane: 0x77736f, busLine: 0xf2f2ee, // ônibus: padrão de Brasília (linha branca contínua; asfalto só um tom mais claro)
  curbFace: 0xbdb7aa, gutter: 0xb4afa3, verge: 0xa9b46a, shoulder: 0xc3b583, shoulder2: 0xbcb27c, manhole: 0x3b3c3e, manholeRim: 0x77777a,
};

/** y de cada camada. Camada = viaduto visual (0 chão, 1, 2). */
export function layerY(layer) { return layer * 0.09; }
const Y = { sidewalk: 0.03, asphalt: 0.05, median: 0.065, marking: 0.075, zebra: 0.08 };
/** Altura do meio-fio (calçadas e canteiros elevados das vias urbanas). Só visual: a física é 2D. */
export const CURB_H = 0.15;

function sub(seg, t0, t1) {
  // sub-polilinha da linha central entre t0 e (L - t1)
  const L = seg.length, a = Math.min(t0, L * 0.45), b = Math.max(L - t1, L * 0.55);
  const pts = [], T = { x: 0, z: 0, tx: 0, tz: 0 };
  samplePts(seg.pts, seg.cum, a, T); pts.push(T.x, T.z);
  for (let i = 0; i < seg.cum.length; i++) if (seg.cum[i] > a + 0.01 && seg.cum[i] < b - 0.01) pts.push(seg.pts[i * 2], seg.pts[i * 2 + 1]);
  samplePts(seg.pts, seg.cum, b, T); pts.push(T.x, T.z);
  const P = new Float64Array(pts);
  const cum = new Float64Array(P.length / 2);
  for (let i = 1; i < cum.length; i++) cum[i] = cum[i - 1] + Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1]);
  return { pts: P, cum, length: cum[cum.length - 1] };
}

function band(mb, pts, o1, o2, y, color) {
  mb.strip(offsetPolyline(pts, o1), offsetPolyline(pts, o2), y, color);
}

function dashes(mb, line, off, y, color, dash = 3, gap = 6, halfW = 0.08) {
  const T0 = { x: 0, z: 0, tx: 0, tz: 0 }, T1 = { x: 0, z: 0, tx: 0, tz: 0 };
  for (let s = 2; s + dash < line.length - 2; s += dash + gap) {
    samplePts(line.pts, line.cum, s, T0); samplePts(line.pts, line.cum, s + dash, T1);
    const ax = T0.x - T0.tz * off, az = T0.z + T0.tx * off, bx = T1.x - T1.tz * off, bz = T1.z + T1.tx * off;
    const nx = -T0.tz * halfW, nz = T0.tx * halfW;
    mb.quad(ax - nx, az - nz, bx - nx, bz - nz, bx + nx, bz + nz, ax + nx, az + nz, y, color);
  }
}

/**
 * Constrói a malha das vias. `mb` = ChunkedMeshBuilder; `inst` = ChunkedInstancer (para guarda-corpos 3D).
 */
export function buildRoadMeshes(net, mb, inst, plain = mb, walk = plain) {
  const C = ROAD_COLORS;
  const T = { x: 0, z: 0, tx: 0, tz: 0 };
  for (const seg of net.segments.values()) {
    const ly = layerY(seg.layer);
    const nA = net.getNode(seg.from), nB = net.getNode(seg.to);
    const full = { pts: seg.pts, cum: seg.cum, length: seg.length };
    const trimmed = sub(seg, nA.radius, nB.radius);
    const isRing = seg.kind === 'ring';
    const asph = isRing ? C.ringAsphalt : C.asphalt;
    const urban = seg.kind === 'urban' || seg.kind === 'local';
    const cy = ly + CURB_H;
    // asfalto
    if (!seg.oneWay && seg.median > 0) {
      band(mb, full.pts, seg.median / 2 - 0.01, seg.edgeR, ly + Y.asphalt, asph);
      band(mb, full.pts, seg.edgeL, -seg.median / 2 + 0.01, ly + Y.asphalt, asph);
      const raised = urban || seg.median <= 4;
      const my = raised ? cy : ly + Y.median;
      band(plain, trimmed.pts, -seg.median / 2, seg.median / 2, my, seg.median > 4 ? C.median : C.curb);
      if (raised) { // canteiro com meio-fio de verdade
        walk.wallStrip(offsetPolyline(trimmed.pts, seg.median / 2), ly + Y.asphalt, my, C.curb, 1);
        walk.wallStrip(offsetPolyline(trimmed.pts, -seg.median / 2), ly + Y.asphalt, my, C.curb, -1);
      }
      if (seg.median > 4) {
        band(walk, trimmed.pts, -seg.median / 2, -seg.median / 2 + 0.3, my + 0.004, C.curb);
        band(walk, trimmed.pts, seg.median / 2 - 0.3, seg.median / 2, my + 0.004, C.curb);
      }
    } else {
      band(mb, full.pts, seg.edgeL, seg.edgeR, ly + Y.asphalt, asph);
    }
    // calçadas elevadas (placas de concreto) com meio-fio e sarjeta; vias rápidas: acostamento + transição de terra
    if (urban) {
      for (const [e0, e1, inner, outer] of [[seg.edgeR, seg.edgeR + 2.6, -1, 1], [seg.edgeL - 2.6, seg.edgeL, 1, -1]]) {
        band(walk, trimmed.pts, e0, e1, cy, C.sidewalk);
        const ein = inner < 0 ? e0 : e1, eout = inner < 0 ? e1 : e0;
        walk.wallStrip(offsetPolyline(trimmed.pts, ein), ly + Y.asphalt, cy, C.curbFace, inner);   // meio-fio (face da rua)
        walk.wallStrip(offsetPolyline(trimmed.pts, eout), 0, cy, C.curbFace, outer);              // borda externa
        band(walk, trimmed.pts, Math.min(ein, ein - inner * 0.16), Math.max(ein, ein - inner * 0.16), cy + 0.003, C.curb); // pedra do meio-fio
        band(walk, trimmed.pts, Math.min(ein, ein + inner * 0.35), Math.max(ein, ein + inner * 0.35), ly + Y.asphalt + 0.006, C.gutter); // sarjeta
        band(plain, trimmed.pts, Math.min(eout, eout + outer * 1.6), Math.max(eout, eout + outer * 1.6), 0.012, C.verge); // gramado de transição
      }
    } else if (!isRing) { // acostamento claro estreito + faixa de terra/capim que se funde ao cerrado
      band(walk, trimmed.pts, seg.edgeR, seg.edgeR + 0.6, ly + Y.sidewalk, C.curb);
      band(walk, trimmed.pts, seg.edgeL - 0.6, seg.edgeL, ly + Y.sidewalk, C.curb);
      band(plain, trimmed.pts, seg.edgeR + 0.6, seg.edgeR + 2.4, 0.014, C.shoulder);
      band(plain, trimmed.pts, seg.edgeL - 2.4, seg.edgeL - 0.6, 0.014, C.shoulder);
      band(plain, trimmed.pts, seg.edgeR + 2.4, seg.edgeR + 4.4, 0.011, C.shoulder2);
      band(plain, trimmed.pts, seg.edgeL - 4.4, seg.edgeL - 2.4, 0.011, C.shoulder2);
    }
    // tampas de bueiro / poços de visita nas vias urbanas
    if (urban && seg.length > 40) {
      for (let s0 = 18 + (seg.length % 17); s0 < seg.length - 15; s0 += 47) {
        samplePts(seg.pts, seg.cum, s0, T);
        const off = (seg.edgeR - seg.laneW * 0.5) * (Math.floor(s0) % 2 ? 1 : -1) * (seg.oneWay ? 0.5 : 1);
        mb.disc(T.x - T.tz * off, T.z + T.tx * off, 0.42, ly + Y.marking - 0.004, C.manholeRim, 10);
        mb.disc(T.x - T.tz * off, T.z + T.tx * off, 0.34, ly + Y.marking - 0.002, C.manhole, 10);
        // boca de lobo na sarjeta
        if (!seg.oneWay) { const o2 = seg.edgeR - 0.25; mb.rect(T.x - T.tz * o2, T.z + T.tx * o2, Math.atan2(T.tx, T.tz), 0.5, 0.18, ly + Y.marking - 0.002, C.manhole); }
      }
    }
    // marcações
    const my = ly + Y.marking;
    const ei = urban ? 0.55 : 0.2;
    band(mb, trimmed.pts, seg.edgeR - ei - 0.15, seg.edgeR - ei, my, C.white);
    band(mb, trimmed.pts, seg.edgeL + ei, seg.edgeL + ei + 0.15, my, C.white);
    if (!seg.oneWay) {
      if (seg.median > 0) {
        band(mb, trimmed.pts, seg.median / 2 + 0.2, seg.median / 2 + 0.35, my, C.yellow);
        band(mb, trimmed.pts, -seg.median / 2 - 0.35, -seg.median / 2 - 0.2, my, C.yellow);
      } else {
        band(mb, trimmed.pts, 0.08, 0.22, my, C.yellow);
        band(mb, trimmed.pts, -0.22, -0.08, my, C.yellow);
      }
    }
    // tracejado entre faixas do mesmo sentido
    for (const dir of [1, -1]) {
      const n = dir > 0 ? seg.lanesF : seg.lanesB;
      for (let i = 0; i < n - 1; i++) {
        const o = (net.laneOffset(seg, dir, i) + net.laneOffset(seg, dir, i + 1)) / 2;
        dashes(mb, trimmed, o, my, C.white, isRing ? 2 : 3, isRing ? 3 : 6);
      }
    }
  }

  // faixas exclusivas de ônibus: asfalto um tom mais claro (só para leitura na isométrica) + linha BRANCA contínua do lado de dentro
  for (const lane of net.lanes) {
    if (lane.kind !== 'bus') continue;
    const seg = net.getSegment(lane.segId), w = seg.laneW / 2, y = layerY(seg.layer) + Y.asphalt + 0.012;
    mb.strip(offsetPolyline(lane.pts, -w + 0.05), offsetPolyline(lane.pts, w - 0.3), y, C.busLane);
    mb.strip(offsetPolyline(lane.pts, -w - 0.12), offsetPolyline(lane.pts, -w + 0.12), layerY(seg.layer) + Y.marking + 0.002, C.busLine);
  }

  // nós: áreas de cruzamento
  for (const n of net.nodes.values()) {
    if (n.radius <= 0) continue;
    let layer = 0;
    for (const sid of n.segs) layer = Math.max(layer, net.getSegment(sid).layer);
    const y = layerY(layer) + Y.asphalt - 0.002;
    mb.disc(n.x, n.z, n.type === 'ring' ? n.radius * 0.75 : n.radius, y, C.asphalt, 20);
  }
  // rotatórias: ilha central
  for (const r of net.roundabouts) {
    plain.disc(r.x, r.z, r.islandRadius, CURB_H, C.island, 36);
    walk.ring(r.x, r.z, r.islandRadius - 0.3, r.islandRadius, CURB_H + 0.003, C.curb, 48);
    for (let i = 0; i < 48; i++) {
      const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2, rr = r.islandRadius, am = (a0 + a1) / 2;
      walk.wall(r.x + Math.cos(a0) * rr, r.z + Math.sin(a0) * rr, r.x + Math.cos(a1) * rr, r.z + Math.sin(a1) * rr, Y.asphalt, CURB_H, C.curbFace, Math.cos(am), Math.sin(am));
    }
  }

  // linhas de retenção nos semáforos
  for (const sig of net.signals) {
    for (const ap of sig.approaches) {
      for (const id of ap.laneIds) {
        const lane = net.getLane(id);
        samplePts(lane.pts, lane.cum, lane.length - 0.4, T);
        const seg = net.getSegment(lane.segId);
        mb.rect(T.x, T.z, Math.atan2(T.tx, T.tz), 0.25, seg.laneW / 2 - 0.05, layerY(seg.layer) + Y.zebra, C.white);
      }
    }
  }

  // faixas de pedestre (zebra: barras paralelas ao fluxo)
  for (const cw of net.crosswalks) {
    const seg = net.getSegment(cw.segId);
    const y = layerY(seg.layer) + Y.zebra;
    const fx = Math.sin(cw.heading), fz = Math.cos(cw.heading), rx = -fz, rz = fx;
    for (let w = seg.edgeL + 0.6; w <= seg.edgeR - 0.5; w += 1.1) {
      if (seg.median > 1 && Math.abs(w) < seg.median / 2 + 0.2) continue;
      mb.rect(cw.x + rx * w, cw.z + rz * w, cw.heading, cw.depth / 2, 0.28, y, C.white);
    }
  }

  // desníveis: sombra sob o viaduto + guarda-corpos
  for (const g of net.gradeSeparations) {
    const over = net.getSegment(g.over), under = net.getSegment(g.under);
    const uw = Math.max(-under.edgeL, under.edgeR) + 4;
    // sombra na via de baixo
    samplePts(under.pts, under.cum, g.sUnder, T);
    const ow = Math.max(-over.edgeL, over.edgeR) + 2.5;
    mb.rect(T.x, T.z, Math.atan2(T.tx, T.tz), ow, uw - 3.5, layerY(under.layer) + Y.zebra + 0.004, C.underShadow);
    // guarda-corpos na via de cima
    samplePts(over.pts, over.cum, g.sOver, T);
    const h = Math.atan2(T.tx, T.tz);
    for (const side of [over.edgeR + 0.3, over.edgeL - 0.3]) {
      const px = T.x - T.tz * side, pz = T.z + T.tx * side;
      inst.add('box', px, layerY(over.layer), pz, h, 0.35, 0.9, uw * 2, 0xd9d4c8);
    }
  }
}
