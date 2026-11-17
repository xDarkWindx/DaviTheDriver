// Geometria das vias a partir da RoadNetwork: asfalto, canteiros, calçadas, rotatórias,
// marcações (bordas, eixo amarelo, tracejado), faixas de pedestre (zebra) e linhas de retenção.
// Tudo vira triângulos com cor por vértice em ChunkedMeshBuilder (poucos draw calls).
import { offsetPolyline, samplePts } from './roadNetwork.js';

export const ROAD_COLORS = {
  asphalt: 0x505257, asphaltDark: 0x3a3b3f, ringAsphalt: 0x55565b,
  white: 0xf4f4f0, yellow: 0xf0c03a, sidewalk: 0xc9c1b0, median: 0x8e9f55, island: 0x7f9a4c, curb: 0xdedad0,
  underShadow: 0x2c2d31,
};

/** y de cada camada. Camada = viaduto visual (0 chão, 1, 2). */
export function layerY(layer) { return layer * 0.09; }
const Y = { sidewalk: 0.03, asphalt: 0.05, median: 0.065, marking: 0.075, zebra: 0.08 };

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
export function buildRoadMeshes(net, mb, inst, plain = mb) {
  const C = ROAD_COLORS;
  for (const seg of net.segments.values()) {
    const ly = layerY(seg.layer);
    const nA = net.getNode(seg.from), nB = net.getNode(seg.to);
    const full = { pts: seg.pts, cum: seg.cum, length: seg.length };
    const trimmed = sub(seg, nA.radius, nB.radius);
    const isRing = seg.kind === 'ring';
    const asph = isRing ? C.ringAsphalt : C.asphalt;
    // asfalto
    if (!seg.oneWay && seg.median > 0) {
      band(mb, full.pts, seg.median / 2 - 0.01, seg.edgeR, ly + Y.asphalt, asph);
      band(mb, full.pts, seg.edgeL, -seg.median / 2 + 0.01, ly + Y.asphalt, asph);
      band(plain, trimmed.pts, -seg.median / 2, seg.median / 2, ly + Y.median, seg.median > 4 ? C.median : C.curb);
      if (seg.median > 4) {
        band(plain, trimmed.pts, -seg.median / 2, -seg.median / 2 + 0.3, ly + Y.median + 0.004, C.curb);
        band(plain, trimmed.pts, seg.median / 2 - 0.3, seg.median / 2, ly + Y.median + 0.004, C.curb);
      }
    } else {
      band(mb, full.pts, seg.edgeL, seg.edgeR, ly + Y.asphalt, asph);
    }
    // calçadas
    if (seg.kind === 'urban' || seg.kind === 'local') {
      band(plain, trimmed.pts, seg.edgeR, seg.edgeR + 2.6, ly + Y.sidewalk, C.sidewalk);
      band(plain, trimmed.pts, seg.edgeL - 2.6, seg.edgeL, ly + Y.sidewalk, C.sidewalk);
    } else if (!isRing) { // acostamento claro estreito
      band(plain, trimmed.pts, seg.edgeR, seg.edgeR + 0.6, ly + Y.sidewalk, C.curb);
      band(plain, trimmed.pts, seg.edgeL - 0.6, seg.edgeL, ly + Y.sidewalk, C.curb);
    }
    // marcações
    const my = ly + Y.marking;
    band(mb, trimmed.pts, seg.edgeR - 0.35, seg.edgeR - 0.2, my, C.white);
    band(mb, trimmed.pts, seg.edgeL + 0.2, seg.edgeL + 0.35, my, C.white);
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
    plain.disc(r.x, r.z, r.islandRadius, Y.median + 0.01, C.island, 36);
    plain.ring(r.x, r.z, r.islandRadius - 0.2, r.islandRadius + 0.4, Y.median + 0.012, C.curb, 48);
  }

  // linhas de retenção nos semáforos
  const T = { x: 0, z: 0, tx: 0, tz: 0 };
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
