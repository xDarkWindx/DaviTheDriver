// Malha viária como GRAFO + consultas espaciais. Puro JS (sem three.js) => testável em Node.
//
// Conceitos:
//  - Node:    { id, x, z, type: 'junction'|'ring'|'edge'|'deadend', radius, segs[], signalId, roundaboutId }
//  - Segment: { id, name, from, to, pts, cum, length, lanesF, lanesB, laneW, median, limitKmh, kind, layer,
//               edgeL (<0), edgeR (>0), oneWay, laneIdsF[], laneIdsB[], roundaboutId }
//             Lateral positivo = à DIREITA do sentido from→to.
//  - Lane:    faixa dirigível (inclui CONECTORES dentro de cruzamentos/rotatórias):
//             { id, segId|null, nodeId|null, dir (+1 from→to | -1 to→from | 0 conector), index (0 = mais à direita),
//               pts: Float64Array [x0,z0,x1,z1...], cum: Float64Array, length, limitKmh, layer,
//               next: [laneId], prev: [laneId], isConnector, turn ('straight'|'left'|'right'|'uturn'|'merge'|null),
//               signal: { signalId, group } | null  (só em faixas de via que terminam num semáforo; parar em lane.length),
//               crosswalks: [{ id, s }]  (s ao longo da faixa), name,
//               kind: 'normal' | 'bus' (faixa exclusiva de ônibus), busStops: [{ id, s }] }
//  Seguir o trânsito = andar por lane.pts e, no fim, escolher um de lane.next.

import { makeRng } from '../core/math.js';

const D2R = Math.PI / 180;

// ---------------------------------------------------------------- polylines
function polyFromXZ(list) {
  const a = new Float64Array(list.length * 2);
  for (let i = 0; i < list.length; i++) { a[i * 2] = list[i][0]; a[i * 2 + 1] = list[i][1]; }
  return a;
}
function cumLengths(pts) {
  const n = pts.length / 2;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  }
  return cum;
}
/** Arredonda cantos de uma polilinha com Bézier quadrática (raio r). */
export function smoothPolyline(points, r, step = 4) {
  if (points.length < 3 || !r) return points.slice();
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1], p1 = points[i], p2 = points[i + 1];
    const l0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]);
    const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const d = Math.min(r, l0 * 0.5, l2 * 0.5);
    const a = [p1[0] + (p0[0] - p1[0]) / l0 * d, p1[1] + (p0[1] - p1[1]) / l0 * d];
    const b = [p1[0] + (p2[0] - p1[0]) / l2 * d, p1[1] + (p2[1] - p1[1]) / l2 * d];
    const n = Math.max(2, Math.ceil((2 * d) / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1]]);
    }
  }
  out.push(points[points.length - 1]);
  // remove pontos coincidentes
  const clean = [out[0]];
  for (let i = 1; i < out.length; i++) {
    const q = clean[clean.length - 1];
    if (Math.hypot(out[i][0] - q[0], out[i][1] - q[1]) > 0.05) clean.push(out[i]);
  }
  return clean;
}
/** Desloca uma polilinha lateralmente (off > 0 = direita do sentido). Miter limitado. */
export function offsetPolyline(pts, off) {
  const n = pts.length / 2;
  const out = new Float64Array(pts.length);
  for (let i = 0; i < n; i++) {
    let tx = 0, tz = 0;
    if (i > 0) { const dx = pts[i * 2] - pts[i * 2 - 2], dz = pts[i * 2 + 1] - pts[i * 2 - 1]; const l = Math.hypot(dx, dz) || 1; tx += dx / l; tz += dz / l; }
    if (i < n - 1) { const dx = pts[i * 2 + 2] - pts[i * 2], dz = pts[i * 2 + 3] - pts[i * 2 + 1]; const l = Math.hypot(dx, dz) || 1; tx += dx / l; tz += dz / l; }
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    // miter: escala 1/cos(meio-ângulo)
    let scale = 1;
    if (i > 0 && i < n - 1) {
      const dx = pts[i * 2 + 2] - pts[i * 2], dz = pts[i * 2 + 3] - pts[i * 2 + 1]; const l = Math.hypot(dx, dz) || 1;
      const c = (dx / l) * tx + (dz / l) * tz;
      scale = 1 / Math.max(0.5, c);
    }
    out[i * 2] = pts[i * 2] + (-tz) * off * scale;
    out[i * 2 + 1] = pts[i * 2 + 1] + tx * off * scale;
  }
  return out;
}
function reversePts(pts) {
  const n = pts.length / 2, out = new Float64Array(pts.length);
  for (let i = 0; i < n; i++) { out[i * 2] = pts[(n - 1 - i) * 2]; out[i * 2 + 1] = pts[(n - 1 - i) * 2 + 1]; }
  return out;
}
/** Sub-polilinha entre s0 e s1. */
function subPolyline(pts, cum, s0, s1) {
  const n = pts.length / 2;
  const res = [];
  const p = { x: 0, z: 0, tx: 0, tz: 0 };
  samplePts(pts, cum, s0, p); res.push([p.x, p.z]);
  for (let i = 0; i < n; i++) if (cum[i] > s0 + 0.01 && cum[i] < s1 - 0.01) res.push([pts[i * 2], pts[i * 2 + 1]]);
  samplePts(pts, cum, s1, p); res.push([p.x, p.z]);
  return polyFromXZ(res);
}
/** Amostra posição/tangente na distância s de uma polilinha. */
export function samplePts(pts, cum, s, out) {
  const n = cum.length;
  if (s <= 0) { s = 0; }
  const L = cum[n - 1];
  if (s >= L) s = L;
  // busca binária
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  const x0 = pts[lo * 2], z0 = pts[lo * 2 + 1], x1 = pts[hi * 2], z1 = pts[hi * 2 + 1];
  out.x = x0 + (x1 - x0) * t; out.z = z0 + (z1 - z0) * t;
  const ddx = x1 - x0, ddz = z1 - z0, l = Math.sqrt(ddx * ddx + ddz * ddz) || 1; // sqrt: Math.hypot é lento e aloca no V8 antigo
  out.tx = ddx / l; out.tz = ddz / l;
  return out;
}
function cubicPts(ax, az, bx, bz, cx, cz, dx, dz, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    out.push([w0 * ax + w1 * bx + w2 * cx + w3 * dx, w0 * az + w1 * bz + w2 * cz + w3 * dz]);
  }
  return polyFromXZ(out);
}

// Projeção de ponto em segmento de reta; retorna t e dist² (sem alocar).
const _proj = { t: 0, d2: 0, px: 0, pz: 0 };
function projSeg(x, z, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((x - x0) * dx + (z - z0) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x0 + dx * t, pz = z0 + dz * t;
  _proj.t = t; _proj.px = px; _proj.pz = pz; _proj.d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
  return _proj;
}

// ---------------------------------------------------------------- grade espacial
class Grid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return ix * 100003 + iz; }
  insertBox(x0, z0, x1, z1, item) {
    const c = this.cell;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const k = this.key(ix, iz);
        let l = this.map.get(k); if (!l) { l = []; this.map.set(k, l); }
        l.push(item);
      }
    }
  }
  cellAt(x, z) { return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))); }
}

// ---------------------------------------------------------------- binary heap (Dijkstra)
class MinHeap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  clear() { this.n = 0; }
  push(key, val) {
    if (this.n >= this.k.length) { // cresce (raro)
      const k2 = new Float64Array(this.k.length * 2); k2.set(this.k); this.k = k2;
      const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  pop() { // retorna val; chave em this.lastKey
    const topV = this.v[0]; this.lastKey = this.k[0];
    const key = this.k[--this.n], val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1; if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    return topV;
  }
}

// ================================================================ RoadNetwork
export class RoadNetwork {
  constructor(def) {
    this.def = def;
    this.nodes = new Map();
    this.segments = new Map();
    this.lanes = [];
    this.roundabouts = [];
    this.signals = [];        // ver _buildSignals
    this.crosswalks = [];
    this.radarSpots = [];     // só type 'speed' (compat.)
    this.enforcementSpots = []; // todos os tipos: 'speed' | 'redLight' | 'busLane'
    this.busStops = [];
    this.agentHideouts = [];
    this.spawnPoints = [];
    this.gradeSeparations = [];
    this.edgeNodes = [];
    this.avenueTreeSlots = []; // { segId, s, side (1 dir./-1 esq. do sentido from→to), x, z, kind } — onde o cenário planta
    this.fruitSpots = [];      // candidatos a fruta no asfalto (ver _buildAvenueTrees)
    this.routeCorridors = def.routeCorridors || {};
    this.zones = def.zones;
    this.starts = def.starts;
    this.bounds = def.bounds;
    this._build();
  }

  // -------------------------------------------------------------- construção
  _build() {
    const def = this.def;
    for (const id in def.nodes) {
      const n = def.nodes[id];
      this.nodes.set(id, { id, x: n.x, z: n.z, type: n.type || 'junction', radius: 0, segs: [], signalId: -1, roundaboutId: null });
    }
    // Rotatórias -> nós de anel + arcos de mão única
    for (const rb of def.roundabouts) {
      const ents = Object.entries(rb.entries).map(([id, deg]) => ({ id, phi: deg * D2R }))
        .sort((a, b) => a.phi - b.phi);
      const r = { id: rb.id, name: rb.name, x: rb.x, z: rb.z, radius: rb.radius, lanes: rb.lanes, laneW: rb.laneW,
        islandRadius: rb.radius - rb.lanes * rb.laneW / 2 - 0.6, nodeIds: [], segIds: [], stj: rb.stj || 0 };
      for (const e of ents) {
        this.nodes.set(e.id, { id: e.id, x: rb.x + rb.radius * Math.cos(e.phi), z: rb.z - rb.radius * Math.sin(e.phi),
          type: 'ring', radius: 0, segs: [], signalId: -1, roundaboutId: rb.id, phi: e.phi });
        r.nodeIds.push(e.id);
      }
      for (let i = 0; i < ents.length; i++) {
        const a = ents[i], b = ents[(i + 1) % ents.length];
        let p1 = b.phi; if (p1 <= a.phi) p1 += Math.PI * 2;
        const n = Math.max(4, Math.ceil(((p1 - a.phi) * rb.radius) / 4));
        const pts = [];
        for (let k = 0; k <= n; k++) {
          const f = a.phi + (p1 - a.phi) * (k / n);
          pts.push([rb.x + rb.radius * Math.cos(f), rb.z - rb.radius * Math.sin(f)]);
        }
        const sid = `${rb.id}_${a.id}_${b.id}`;
        this._addSegment({ id: sid, name: rb.name, from: a.id, to: b.id, lanesF: rb.lanes, lanesB: 0, laneW: rb.laneW,
          limitKmh: rb.limitKmh, kind: 'ring', layer: 0, roundaboutId: rb.id }, pts);
        r.segIds.push(sid);
      }
      this.roundabouts.push(r);
    }
    for (const rd of def.roads) {
      const a = this.nodes.get(rd.from), b = this.nodes.get(rd.to);
      if (!a || !b) throw new Error(`via ${rd.id}: nó inexistente ${rd.from}/${rd.to}`);
      const raw = [[a.x, a.z], ...(rd.via || []), [b.x, b.z]];
      this._addSegment(rd, smoothPolyline(raw, rd.corner || 0, 4));
    }
    // raio de cada nó (área do cruzamento)
    for (const n of this.nodes.values()) {
      if (n.type === 'edge') { n.radius = 0; this.edgeNodes.push(n.id); continue; }
      let r = 0;
      for (const sid of n.segs) {
        const s = this.segments.get(sid);
        if (n.type === 'ring' && s.kind === 'ring') continue;
        r = Math.max(r, Math.max(-s.edgeL, s.edgeR));
      }
      n.radius = n.type === 'deadend' ? 7 : n.type === 'ring' ? Math.max(6, r + 1.5) : r + 3;
    }
    this._buildLanes();
    this._buildConnectors();
    this._buildSignals();
    this._buildCrosswalks();
    this._buildRadars();
    this._buildBusAndHideouts();
    this._buildGradeSeparations();
    this._buildSpawns();
    this._buildAvenueTrees();
    this._buildGrids();
    // buffers do Dijkstra
    const N = this.lanes.length;
    this._dist = new Float64Array(N); this._prev = new Int32Array(N); this._heap = new MinHeap(N * 4);
    /** s extras por faixa no planejador (congestionamento da viagem: o GPS pode sugerir desvio). Dono: trânsito. */
    this.laneExtraCost = new Float32Array(N);
  }

  _addSegment(rd, ptsList) {
    const pts = polyFromXZ(ptsList);
    const cum = cumLengths(pts);
    const laneW = rd.laneW || 3.5;
    const lanesF = rd.lanesF ?? 1, lanesB = rd.lanesB ?? 0;
    const oneWay = lanesB === 0;
    const median = oneWay ? 0 : (rd.median || 0);
    const seg = {
      id: rd.id, name: rd.name, from: rd.from, to: rd.to, pts, cum, length: cum[cum.length - 1],
      lanesF, lanesB, laneW, median, limitKmh: rd.limitKmh || 50, kind: rd.kind || 'urban', layer: rd.layer || 0,
      oneWay, edgeR: oneWay ? lanesF * laneW / 2 : median / 2 + lanesF * laneW,
      edgeL: oneWay ? -lanesF * laneW / 2 : -(median / 2 + lanesB * laneW),
      laneIdsF: [], laneIdsB: [], roundaboutId: rd.roundaboutId || null,
      busLane: rd.busLane === undefined ? null : rd.busLane,
    };
    this.segments.set(seg.id, seg);
    this.nodes.get(seg.from).segs.push(seg.id);
    this.nodes.get(seg.to).segs.push(seg.id);
    return seg;
  }

  /** Deslocamento lateral (relativo ao sentido from→to) da faixa `index` no sentido `dir`. */
  laneOffset(seg, dir, index) {
    const w = seg.laneW;
    if (seg.oneWay) return ((seg.lanesF - 1) / 2 - index) * w;
    const n = dir > 0 ? seg.lanesF : seg.lanesB;
    const off = seg.median / 2 + (n - index - 0.5) * w;
    return dir > 0 ? off : -off;
  }

  _newLane(o) {
    const lane = Object.assign({
      id: this.lanes.length, segId: null, nodeId: null, dir: 0, index: 0, next: [], prev: [], isConnector: false,
      turn: null, signal: null, crosswalks: [], layer: 0, name: '', kind: 'normal', busStops: [],
    }, o);
    lane.cum = cumLengths(lane.pts);
    lane.length = lane.cum[lane.cum.length - 1];
    this.lanes.push(lane);
    return lane;
  }

  _buildLanes() {
    for (const seg of this.segments.values()) {
      const nA = this.nodes.get(seg.from), nB = this.nodes.get(seg.to);
      for (const dir of [1, -1]) {
        const n = dir > 0 ? seg.lanesF : seg.lanesB;
        for (let i = 0; i < n; i++) {
          let pts = offsetPolyline(seg.pts, this.laneOffset(seg, dir, i));
          if (dir < 0) pts = reversePts(pts);
          const cum = cumLengths(pts);
          const L = cum[cum.length - 1];
          const startNode = dir > 0 ? nA : nB, endNode = dir > 0 ? nB : nA;
          let t0 = startNode.radius, t1 = endNode.radius;
          const maxTrim = L * 0.42;
          if (t0 > maxTrim) t0 = maxTrim;
          if (t1 > maxTrim) t1 = maxTrim;
          pts = subPolyline(pts, cum, t0, L - t1);
          const bus = i === 0 && seg.busLane !== null && (seg.busLane === 0 || seg.busLane === dir) && n > 1;
          const lane = this._newLane({ segId: seg.id, dir, index: i, pts, limitKmh: seg.limitKmh, layer: seg.layer, name: seg.name,
            startNode: startNode.id, endNode: endNode.id, trimStart: t0, kind: bus ? 'bus' : 'normal' });
          (dir > 0 ? seg.laneIdsF : seg.laneIdsB).push(lane.id);
        }
      }
    }
  }

  _endTangent(lane, atEnd, out) {
    const p = lane.pts, n = p.length / 2;
    if (atEnd) { out.x = p[n * 2 - 2]; out.z = p[n * 2 - 1]; const dx = p[n * 2 - 2] - p[n * 2 - 4], dz = p[n * 2 - 1] - p[n * 2 - 3]; const l = Math.hypot(dx, dz) || 1; out.tx = dx / l; out.tz = dz / l; }
    else { out.x = p[0]; out.z = p[1]; const dx = p[2] - p[0], dz = p[3] - p[1]; const l = Math.hypot(dx, dz) || 1; out.tx = dx / l; out.tz = dz / l; }
    return out;
  }

  _buildConnectors() {
    const A = { x: 0, z: 0, tx: 0, tz: 0 }, B = { x: 0, z: 0, tx: 0, tz: 0 };
    for (const node of this.nodes.values()) {
      if (node.type === 'edge') continue;
      // aproximações (chegam no nó) e saídas
      const ins = [], outs = [];
      for (const sid of node.segs) {
        const seg = this.segments.get(sid);
        if (seg.to === node.id) { if (seg.laneIdsF.length) ins.push({ seg, ids: seg.laneIdsF }); if (seg.laneIdsB.length) outs.push({ seg, ids: seg.laneIdsB }); }
        if (seg.from === node.id) { if (seg.laneIdsF.length) outs.push({ seg, ids: seg.laneIdsF }); if (seg.laneIdsB.length) ins.push({ seg, ids: seg.laneIdsB }); }
      }
      node.approaches = ins.map((a) => ({ segId: a.seg.id, laneIds: a.ids.slice() }));
      const deadEnd = node.type === 'deadend' || node.segs.length === 1;
      for (const ap of ins) {
        const connected = new Set();
        const tryLink = (inId, outId, turn) => {
          const la = this.lanes[inId], lb = this.lanes[outId];
          this._endTangent(la, true, A); this._endTangent(lb, false, B);
          const chord = Math.hypot(B.x - A.x, B.z - A.z);
          let h = chord * 0.42;
          if (turn === 'uturn') h = Math.max(h, 7);
          const n = Math.max(3, Math.min(16, Math.ceil(chord / 2.5) + (turn === 'uturn' ? 6 : 0)));
          const pts = cubicPts(A.x, A.z, A.x + A.tx * h, A.z + A.tz * h, B.x - B.tx * h, B.z - B.tz * h, B.x, B.z, n);
          let lim = Math.min(la.limitKmh, lb.limitKmh);
          if (turn === 'left' || turn === 'right') lim = Math.min(lim, 40);
          if (turn === 'uturn') lim = 20;
          const c = this._newLane({ nodeId: node.id, isConnector: true, turn, pts, limitKmh: lim, layer: Math.max(la.layer, lb.layer),
            name: node.roundaboutId ? (this.roundabouts.find((r) => r.id === node.roundaboutId) || {}).name || '' : la.name,
            fromLane: inId, toLane: outId });
          la.next.push(c.id); c.prev.push(inId);
          c.next.push(outId); lb.prev.push(c.id);
          connected.add(inId);
        };
        for (const ex of outs) {
          const sameSeg = ex.seg.id === ap.seg.id;
          const la0 = this.lanes[ap.ids[0]], lb0 = this.lanes[ex.ids[0]];
          this._endTangent(la0, true, A); this._endTangent(lb0, false, B);
          const cross = A.tx * B.tz - A.tz * B.tx, dot = A.tx * B.tx + A.tz * B.tz;
          const turnAng = Math.atan2(-cross, dot); // >0 = esquerda
          let turn;
          if (sameSeg || Math.abs(turnAng) > 2.45) turn = 'uturn';
          else if (node.type === 'ring' || Math.abs(turnAng) < 0.6) turn = node.type === 'ring' ? 'merge' : 'straight';
          else turn = turnAng > 0 ? 'left' : 'right';
          if (turn === 'uturn' && !deadEnd) continue;
          const nIn = ap.ids.length, nOut = ex.ids.length;
          if (turn === 'straight' || turn === 'merge') {
            for (let i = 0; i < nIn; i++) tryLink(ap.ids[i], ex.ids[Math.min(i, nOut - 1)], turn);
            for (let j = nIn; j < nOut; j++) tryLink(ap.ids[nIn - 1], ex.ids[j], turn);
          } else if (turn === 'right') {
            tryLink(ap.ids[0], ex.ids[0], turn);
            if (nOut > 1) tryLink(ap.ids[0], ex.ids[1], turn);
          } else if (turn === 'left') {
            tryLink(ap.ids[nIn - 1], ex.ids[nOut - 1], turn);
            if (nOut > 1) tryLink(ap.ids[nIn - 1], ex.ids[nOut - 2], turn);
          }
          else tryLink(ap.ids[nIn - 1], ex.ids[nOut - 1], turn); // uturn em beco sem saída
        }
        // garantia: toda faixa que chega tem saída (se houver alguma não-retorno)
        for (const id of ap.ids) {
          if (connected.has(id)) continue;
          const la = this.lanes[id];
          let best = null, bestAng = 9;
          for (const ex of outs) {
            if (ex.seg.id === ap.seg.id && !deadEnd) continue;
            const lb = this.lanes[ex.ids[Math.min(la.index, ex.ids.length - 1)]];
            this._endTangent(la, true, A); this._endTangent(lb, false, B);
            const ang = Math.abs(Math.atan2(-(A.tx * B.tz - A.tz * B.tx), A.tx * B.tx + A.tz * B.tz));
            if (ang < bestAng) { bestAng = ang; best = lb; }
          }
          if (best) tryLink(id, best.id, bestAng < 0.6 ? 'straight' : 'merge');
        }
      }
    }
  }

  _buildSignals() {
    const ids = this.def.signals || [];
    const T = { x: 0, z: 0, tx: 0, tz: 0 };
    ids.forEach((nodeId, si) => {
      const node = this.nodes.get(nodeId);
      if (!node) throw new Error('semáforo em nó inexistente ' + nodeId);
      node.signalId = si;
      const sig = { id: si, nodeId, x: node.x, z: node.z, approaches: [], groups: 1 };
      let axis0 = null;
      for (const ap of node.approaches) {
        const lane0 = this.lanes[ap.laneIds[0]];
        this._endTangent(lane0, true, T);
        const ang = Math.atan2(T.tx, T.tz);
        let group = 0;
        if (axis0 === null) axis0 = ang;
        else {
          let d = Math.abs(ang - axis0) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d;
          group = d < 0.6 ? 0 : 1;
        }
        if (group === 1) sig.groups = 2;
        const seg = this.segments.get(ap.segId);
        const rx = -T.tz, rz = T.tx; // direita
        sig.approaches.push({
          segId: ap.segId, group, laneIds: ap.laneIds, heading: ang,
          stopX: T.x, stopZ: T.z,
          poleX: T.x + rx * (seg.laneW * 0.5 + 1.6), poleZ: T.z + rz * (seg.laneW * 0.5 + 1.6),
        });
        for (const id of ap.laneIds) this.lanes[id].signal = { signalId: si, group };
      }
      this.signals.push(sig);
    });
  }

  /** Projeta (x,z) na linha central de um segmento: { s, lateral, dist, x, z, tx, tz } */
  projectOnSegment(seg, x, z, out = {}) {
    const p = seg.pts, n = p.length / 2;
    let best = Infinity;
    for (let i = 0; i < n - 1; i++) {
      const r = projSeg(x, z, p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]);
      if (r.d2 < best) {
        best = r.d2;
        const dx = p[i * 2 + 2] - p[i * 2], dz = p[i * 2 + 3] - p[i * 2 + 1]; const l = Math.hypot(dx, dz) || 1;
        out.s = seg.cum[i] + r.t * l; out.x = r.px; out.z = r.pz; out.tx = dx / l; out.tz = dz / l;
        out.lateral = (x - r.px) * (-dz / l) + (z - r.pz) * (dx / l);
      }
    }
    out.dist = Math.sqrt(best);
    return out;
  }
  /** Projeta (x,z) numa faixa: retorna s ao longo da faixa. */
  projectOnLane(lane, x, z) {
    const p = lane.pts, n = p.length / 2;
    let best = Infinity, bs = 0;
    for (let i = 0; i < n - 1; i++) {
      const r = projSeg(x, z, p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]);
      if (r.d2 < best) { best = r.d2; bs = lane.cum[i] + r.t * (lane.cum[i + 1] - lane.cum[i]); }
    }
    return bs;
  }

  _addCrosswalk(seg, s, auto, signalId = -1) {
    const T = samplePts(seg.pts, seg.cum, s, { x: 0, z: 0, tx: 0, tz: 0 });
    const cw = { id: this.crosswalks.length, segId: seg.id, s, x: T.x, z: T.z, heading: Math.atan2(T.tx, T.tz),
      halfWidth: Math.max(-seg.edgeL, seg.edgeR), depth: 4, auto, signalId, laneHits: [] };
    this.crosswalks.push(cw);
    for (const id of [...seg.laneIdsF, ...seg.laneIdsB]) {
      const lane = this.lanes[id];
      const ls = this.projectOnLane(lane, T.x, T.z);
      lane.crosswalks.push({ id: cw.id, s: ls });
      lane.crosswalks.sort((a, b) => a.s - b.s);
      cw.laneHits.push({ laneId: id, s: ls });
    }
    return cw;
  }

  _buildCrosswalks() {
    for (const c of this.def.crosswalks || []) {
      const seg = this.segments.get(c.seg);
      const pr = this.projectOnSegment(seg, c.at[0], c.at[1]);
      this._addCrosswalk(seg, pr.s, false);
    }
    // automáticas nos semáforos
    for (const sig of this.signals) {
      const node = this.nodes.get(sig.nodeId);
      for (const sid of node.segs) {
        const seg = this.segments.get(sid);
        const d = node.radius + 2.5;
        if (seg.length < d * 2.2) continue;
        this._addCrosswalk(seg, seg.from === node.id ? d : seg.length - d, true, sig.id);
      }
    }
  }

  _buildRadars() {
    const T = { x: 0, z: 0, tx: 0, tz: 0 };
    (this.def.radars || []).forEach((r) => {
      const seg = this.segments.get(r.seg);
      const pr = this.projectOnSegment(seg, r.at[0], r.at[1]);
      samplePts(seg.pts, seg.cum, pr.s, T);
      const dirs = r.dir === 0 ? [1, -1] : [r.dir];
      for (const dir of dirs) {
        const ids = dir > 0 ? seg.laneIdsF : seg.laneIdsB;
        if (!ids.length) continue;
        const type = r.type || 'speed';
        if (type === 'busLane' && !ids.some((id) => this.lanes[id].kind === 'bus')) continue;
        this.enforcementSpots.push({
          id: this.enforcementSpots.length, type, segId: seg.id, dir, s: pr.s, x: T.x, z: T.z,
          heading: Math.atan2(T.tx * dir, T.tz * dir), limitKmh: seg.limitKmh,
          laneIds: ids.slice(), laneS: ids.map((id) => this.projectOnLane(this.lanes[id], T.x, T.z)),
          // poste do lado direito do sentido coberto
          poleX: T.x + (-T.tz * dir) * (dir > 0 ? seg.edgeR + 1.5 : -seg.edgeL + 1.5),
          poleZ: T.z + (T.tx * dir) * (dir > 0 ? seg.edgeR + 1.5 : -seg.edgeL + 1.5),
        });
      }
    });
    // candidatos automáticos de avanço de sinal: cada aproximação de semáforo
    for (const sig of this.signals) for (const ap of sig.approaches) {
      this.enforcementSpots.push({ id: this.enforcementSpots.length, type: 'redLight', segId: ap.segId, signalId: sig.id, group: ap.group,
        dir: this.lanes[ap.laneIds[0]].dir, s: null, x: ap.stopX, z: ap.stopZ, heading: ap.heading, limitKmh: this.segments.get(ap.segId).limitKmh,
        laneIds: ap.laneIds.slice(), laneS: ap.laneIds.map((id) => this.lanes[id].length), poleX: ap.poleX, poleZ: ap.poleZ });
    }
    this.radarSpots = this.enforcementSpots.filter((e) => e.type === 'speed');
  }

  _buildBusAndHideouts() {
    const T = { x: 0, z: 0, tx: 0, tz: 0 };
    for (const b of this.def.busStops || []) {
      const seg = this.segments.get(b.seg);
      const pr = this.projectOnSegment(seg, b.at[0], b.at[1]);
      samplePts(seg.pts, seg.cum, pr.s, T);
      for (const dir of b.dir === 0 ? [1, -1] : [b.dir]) {
        const ids = dir > 0 ? seg.laneIdsF : seg.laneIdsB;
        if (!ids.length) continue;
        const lane = this.lanes[ids[0]];
        const ls = this.projectOnLane(lane, T.x, T.z);
        const off = (dir > 0 ? seg.edgeR : -seg.edgeL) + 2.2; // calçada à direita do sentido
        const stop = { id: this.busStops.length, name: b.name || '', segId: seg.id, dir, laneId: lane.id, s: ls, x: 0, z: 0,
          heading: Math.atan2(T.tx * dir, T.tz * dir), onBusLane: lane.kind === 'bus',
          shelterX: T.x + (-T.tz * dir) * off, shelterZ: T.z + (T.tx * dir) * off };
        const o = this.sampleLane(lane, ls, {}); stop.x = o.x; stop.z = o.z;
        this.busStops.push(stop);
        lane.busStops.push({ id: stop.id, s: ls });
      }
    }
    for (const h of this.def.agentHideouts || []) {
      const seg = this.segments.get(h.seg);
      const pr = this.projectOnSegment(seg, h.at[0], h.at[1]);
      samplePts(seg.pts, seg.cum, pr.s, T);
      const off = h.side > 0 ? seg.edgeR + 9 : seg.edgeL - 9;
      const x = T.x + (-T.tz) * off, z = T.z + T.tx * off;
      const range = h.range || 60;
      this.agentHideouts.push({
        id: this.agentHideouts.length, x, z, cover: h.cover || 'arvore', segId: seg.id, dir: h.dir || 0,
        facing: Math.atan2(T.x - x, T.z - z),     // heading do agente olhando para a via
        roadX: T.x, roadZ: T.z, s: pr.s, s0: Math.max(0, pr.s - range), s1: Math.min(seg.length, pr.s + range),
        laneIds: (h.dir === 1 ? seg.laneIdsF : h.dir === -1 ? seg.laneIdsB : [...seg.laneIdsF, ...seg.laneIdsB]).slice(),
      });
    }
  }

  _buildGradeSeparations() {
    for (const g of this.def.gradeSeparations || []) {
      const a = this.segments.get(g.over), b = this.segments.get(g.under);
      let found = null;
      const pa = a.pts, pb = b.pts;
      for (let i = 0; i < pa.length / 2 - 1 && !found; i++) {
        for (let j = 0; j < pb.length / 2 - 1; j++) {
          const x1 = pa[i * 2], z1 = pa[i * 2 + 1], x2 = pa[i * 2 + 2], z2 = pa[i * 2 + 3];
          const x3 = pb[j * 2], z3 = pb[j * 2 + 1], x4 = pb[j * 2 + 2], z4 = pb[j * 2 + 3];
          const den = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / den;
          const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            const x = x1 + t * (x2 - x1), z = z1 + t * (z2 - z1);
            found = { over: a.id, under: b.id, x, z, sOver: a.cum[i] + t * (a.cum[i + 1] - a.cum[i]), sUnder: b.cum[j] + u * (b.cum[j + 1] - b.cum[j]) };
            break;
          }
        }
      }
      if (!found) throw new Error(`desnível ${g.over}/${g.under}: vias não se cruzam`);
      this.gradeSeparations.push(found);
    }
    this._gsSet = new Set(this.gradeSeparations.map((g) => g.over + '|' + g.under));
  }

  _buildSpawns() {
    const T = { x: 0, z: 0, tx: 0, tz: 0 };
    for (const lane of this.lanes) {
      if (lane.isConnector) continue;
      for (let s = 18; s < lane.length - 18; s += 70) {
        samplePts(lane.pts, lane.cum, s, T);
        this.spawnPoints.push({ laneId: lane.id, s, x: T.x, z: T.z, heading: Math.atan2(T.tx, T.tz) });
      }
    }
  }

  /**
   * Árvores de avenida (def.avenueTrees) e candidatos a "fruta no asfalto".
   * fruitSpots[i] = { id, segId, dir, s, x, z, heading, fruit: 'manga'|'jaca', treeX, treeZ,
   *                   lanes: [{ laneId, s, x, z }] }  (lanes[0] = faixa da direita, rente à árvore)
   */
  _buildAvenueTrees() {
    const T = { x: 0, z: 0, tx: 0, tz: 0 };
    for (const av of this.def.avenueTrees || []) {
      let k = 0;
      for (const segId of av.segs) {
        const seg = this.segments.get(segId);
        if (!seg) throw new Error('avenueTrees: via inexistente ' + segId);
        const nA = this.nodes.get(seg.from), nB = this.nodes.get(seg.to);
        const s0 = nA.radius + (av.margin || 10), s1 = seg.length - nB.radius - (av.margin || 10);
        for (let s = s0; s < s1; s += av.step) {
          samplePts(seg.pts, seg.cum, s, T);
          for (const side of [1, -1]) {
            const off = side > 0 ? seg.edgeR + av.offset : seg.edgeL - av.offset;
            const kind = av.kinds[(k + (side > 0 ? 0 : 1)) % av.kinds.length];
            const slot = { segId, s, side, x: T.x - T.tz * off, z: T.z + T.tx * off, kind };
            this.avenueTreeSlots.push(slot);
            if (!av.fruit || (k % 2) !== (side > 0 ? 0 : 1)) continue; // ~1 candidato a cada 2 árvores por lado
            // sentido cuja faixa da direita fica rente a esta árvore: lado direito (side 1) => dir +1
            const dir = side > 0 ? 1 : -1;
            const ids = dir > 0 ? seg.laneIdsF : seg.laneIdsB;
            if (!ids.length) continue;
            const lanes = ids.map((id) => {
              const lane = this.lanes[id], ls = this.projectOnLane(lane, T.x, T.z), o = this.sampleLane(lane, ls, {});
              return { laneId: id, s: ls, x: o.x, z: o.z };
            });
            this.fruitSpots.push({
              id: this.fruitSpots.length, segId, dir, s, x: lanes[0].x, z: lanes[0].z,
              heading: Math.atan2(T.tx * dir, T.tz * dir), fruit: kind === 'jaqueira' ? 'jaca' : 'manga',
              treeX: slot.x, treeZ: slot.z, lanes,
            });
          }
          k++;
        }
      }
    }
  }

  _buildGrids() {
    this._laneGrid = new Grid(40);
    for (const lane of this.lanes) {
      const p = lane.pts;
      for (let i = 0; i < p.length / 2 - 1; i++) {
        const x0 = Math.min(p[i * 2], p[i * 2 + 2]), x1 = Math.max(p[i * 2], p[i * 2 + 2]);
        const z0 = Math.min(p[i * 2 + 1], p[i * 2 + 3]), z1 = Math.max(p[i * 2 + 1], p[i * 2 + 3]);
        this._laneGrid.insertBox(x0 - 8, z0 - 8, x1 + 8, z1 + 8, lane.id * 4096 + i);
      }
    }
    this._segGrid = new Grid(40);
    this._segList = Array.from(this.segments.values());
    this._segList.forEach((seg, si) => {
      const p = seg.pts, m = Math.max(-seg.edgeL, seg.edgeR) + 2;
      for (let i = 0; i < p.length / 2 - 1; i++) {
        const x0 = Math.min(p[i * 2], p[i * 2 + 2]), x1 = Math.max(p[i * 2], p[i * 2 + 2]);
        const z0 = Math.min(p[i * 2 + 1], p[i * 2 + 3]), z1 = Math.max(p[i * 2 + 1], p[i * 2 + 3]);
        this._segGrid.insertBox(x0 - m, z0 - m, x1 + m, z1 + m, si * 4096 + i);
      }
    });
    this._nodeList = Array.from(this.nodes.values()).filter((n) => n.radius > 0);
  }

  // ============================================================ CONSULTAS
  getLane(id) { return this.lanes[id]; }
  getSegment(id) { return this.segments.get(id); }
  getNode(id) { return this.nodes.get(id); }

  /** Posição/tangente/heading na distância s da faixa. out = { x, z, tx, tz, heading } */
  sampleLane(lane, s, out) {
    samplePts(lane.pts, lane.cum, s, out);
    out.heading = Math.atan2(out.tx, out.tz);
    return out;
  }

  /**
   * Faixa mais próxima de (x,z). headingHint (rad, opcional/NaN) filtra faixas cujo sentido difere
   * mais de maxAngle (padrão 100°). Retorna out = { lane, laneId, s, x, z, dist, lateral, heading } ou null.
   * Busca só nas células vizinhas (~40-80 m).
   */
  nearestLane(x, z, out, headingHint = NaN, maxAngle = 1.75, includeConnectors = true) {
    const g = this._laneGrid;
    const c = g.cell;
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    let best = Infinity, bl = -1, bi = 0, bt = 0;
    const useH = headingHint === headingHint; // !NaN
    const hx = Math.sin(headingHint), hz = Math.cos(headingHint), cosMax = Math.cos(maxAngle);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const l = g.map.get(g.key(ix, iz));
      if (!l) continue;
      for (let k = 0; k < l.length; k++) {
        const code = l[k], li = (code / 4096) | 0, i = code - li * 4096;
        const lane = this.lanes[li];
        if (!includeConnectors && lane.isConnector) continue;
        const p = lane.pts;
        const x0 = p[i * 2], z0 = p[i * 2 + 1], x1 = p[i * 2 + 2], z1 = p[i * 2 + 3];
        if (useH) {
          const dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz) || 1;
          if ((dx * hx + dz * hz) / L < cosMax) continue;
        }
        const r = projSeg(x, z, x0, z0, x1, z1);
        if (r.d2 < best) { best = r.d2; bl = li; bi = i; bt = r.t; }
      }
    }
    if (bl < 0) return null;
    const lane = this.lanes[bl], p = lane.pts;
    const x0 = p[bi * 2], z0 = p[bi * 2 + 1], dx = p[bi * 2 + 2] - x0, dz = p[bi * 2 + 3] - z0, L = Math.sqrt(dx * dx + dz * dz) || 1;
    out.lane = lane; out.laneId = bl;
    out.s = lane.cum[bi] + bt * L;
    out.x = x0 + dx * bt; out.z = z0 + dz * bt;
    out.dist = Math.sqrt(best);
    out.lateral = (x - out.x) * (-dz / L) + (z - out.z) * (dx / L);
    out.heading = Math.atan2(dx, dz);
    out.kind = lane.kind;
    return out;
  }

  /** Barato: a posição (com sentido `heading`) está sobre uma faixa exclusiva de ônibus? */
  isBusLaneAt(x, z, heading = NaN) {
    const r = this.nearestLane(x, z, this._tmpBus || (this._tmpBus = {}), heading, 1.2, false);
    if (!r || r.lane.kind !== 'bus') return false;
    const seg = this.segments.get(r.lane.segId);
    return Math.abs(r.lateral) <= seg.laneW * 0.5;
  }

  /**
   * Informação de via na posição: out = { onRoad, inJunction, nodeId, segId, name, limitKmh, lateral, segDist }
   * onRoad = sobre asfalto (pista ou área de cruzamento/rotatória); canteiro central NÃO conta.
   */
  roadInfoAt(x, z, out) {
    out.onRoad = false; out.inJunction = false; out.nodeId = null; out.segId = null; out.name = ''; out.limitKmh = 0;
    out.lateral = 0; out.segDist = Infinity;
    const g = this._segGrid;
    const l = g.cellAt(x, z);
    let bestD = Infinity;
    if (l) {
      for (let k = 0; k < l.length; k++) {
        const code = l[k], si = (code / 4096) | 0, i = code - si * 4096;
        const seg = this._segList[si], p = seg.pts;
        const x0 = p[i * 2], z0 = p[i * 2 + 1], x1 = p[i * 2 + 2], z1 = p[i * 2 + 3];
        const r = projSeg(x, z, x0, z0, x1, z1);
        const dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz) || 1;
        const lat = (x - r.px) * (-dz / L) + (z - r.pz) * (dx / L);
        const along = Math.abs(((x - x0) * dx + (z - z0) * dz) / L - r.t * L); // >0 se fora do trecho
        const inside = along < 0.5 && lat <= seg.edgeR + 0.3 && lat >= seg.edgeL - 0.3 && !(seg.median > 1 && Math.abs(lat) < seg.median / 2 - 0.3);
        const d = Math.sqrt(r.d2);
        if (inside && (!out.onRoad || d < bestD)) {
          out.onRoad = true; bestD = d;
          out.segId = seg.id; out.name = seg.name; out.limitKmh = seg.limitKmh; out.lateral = lat; out.segDist = d;
        } else if (!out.onRoad && d < out.segDist) {
          out.segDist = d; out.segId = seg.id; out.name = seg.name; out.limitKmh = seg.limitKmh; out.lateral = lat;
        }
      }
    }
    const nl = this._nodeList;
    for (let i = 0; i < nl.length; i++) {
      const n = nl[i], dx = x - n.x, dz = z - n.z;
      if (dx * dx + dz * dz < n.radius * n.radius) {
        out.inJunction = true; out.nodeId = n.id;
        if (!out.onRoad) { out.onRoad = true; }
        break;
      }
    }
    return out;
  }

  isOnRoad(x, z) { return this.roadInfoAt(x, z, this._tmpInfo || (this._tmpInfo = {})).onRoad; }

  /** Limite de velocidade (km/h) na posição; usa a faixa no sentido do heading se informado. */
  speedLimitAt(x, z, heading = NaN) {
    const r = this.nearestLane(x, z, this._tmpNear || (this._tmpNear = {}), heading);
    return r && r.dist < 12 ? r.lane.limitKmh : 0;
  }

  /** Faixa (sentido) correspondente à posição+heading: atalho p/ nearestLane com filtro de sentido. */
  laneAt(x, z, heading, out) { return this.nearestLane(x, z, out, heading, 1.2); }

  /**
   * Distância livre da posição até a borda de asfalto mais próxima (negativa = em cima da via).
   * Usada para posicionar cenário. Busca até `range` m (retorna range se nada perto).
   */
  clearance(x, z, range = 80) {
    let best = range;
    for (const seg of this._segList) {
      // descarte rápido pela bbox
      const p = seg.pts;
      const hw = Math.max(-seg.edgeL, seg.edgeR);
      for (let i = 0; i < p.length / 2 - 1; i++) {
        const x0 = p[i * 2], z0 = p[i * 2 + 1], x1 = p[i * 2 + 2], z1 = p[i * 2 + 3];
        if (x < Math.min(x0, x1) - range - hw || x > Math.max(x0, x1) + range + hw || z < Math.min(z0, z1) - range - hw || z > Math.max(z0, z1) + range + hw) continue;
        const r = projSeg(x, z, x0, z0, x1, z1);
        const d = Math.sqrt(r.d2) - hw;
        if (d < best) best = d;
      }
    }
    for (const n of this._nodeList) {
      const d = Math.hypot(x - n.x, z - n.z) - n.radius;
      if (d < best) best = d;
    }
    for (const r of this.roundabouts) {
      const d = Math.hypot(x - r.x, z - r.z) - (r.radius + r.lanes * r.laneW / 2);
      if (d < best) best = d;
    }
    return best;
  }

  /** true se os dois segmentos se cruzam em desnível (veículos neles não devem colidir no cruzamento). */
  isGradeSeparated(segA, segB) {
    return this._gsSet.has(segA + '|' + segB) || this._gsSet.has(segB + '|' + segA);
  }

  /** Faixa de largada para uma pose (faixa mais à direita do sentido). Retorna { lane, s, x, z, heading } */
  snapStart(pose) {
    const r = this.nearestLane(pose.x, pose.z, {}, pose.heading, 1.0, false);
    if (!r) throw new Error('largada fora da via');
    const seg = this.segments.get(r.lane.segId);
    const ids = r.lane.dir > 0 ? seg.laneIdsF : seg.laneIdsB;
    const lane = this.lanes[ids[0]];
    const s = this.projectOnLane(lane, pose.x, pose.z);
    const o = this.sampleLane(lane, s, {});
    return { lane, s, x: o.x, z: o.z, heading: o.heading };
  }

  /** Faixa (não-conector) mais próxima de uma zona — destino para o planejador. */
  laneForZone(zoneId) {
    const z = this.zones[zoneId];
    const r = this.nearestLane(z.x, z.z, {}, NaN, 9, false);
    r.targets = [];
    // todas as faixas (qualquer sentido) do segmento que passa pela zona
    const seg = this.segments.get(r.lane.segId);
    r.targets.push(...seg.laneIdsF, ...seg.laneIdsB);
    return r;
  }

  /** Todas as faixas paralelas (mesmo segmento e sentido) de uma faixa de via. */
  siblingLanes(lane) {
    if (lane.isConnector) return [lane.id];
    const seg = this.segments.get(lane.segId);
    return lane.dir > 0 ? seg.laneIdsF : seg.laneIdsB;
  }

  /**
   * Dijkstra por tempo (comprimento / limite + penalidade de semáforo).
   * `toLane`: laneId OU array de laneIds aceitáveis (ex.: siblingLanes(dest)).
   * Retorna array de laneIds de fromLane até o alvo alcançado (inclusive), ou null.
   * `outArr` opcional para reaproveitar memória.
   */
  planRoute(fromLaneId, fromS, toLane, outArr = []) {
    const N = this.lanes.length, dist = this._dist, prev = this._prev, heap = this._heap;
    let toLaneId = Array.isArray(toLane) ? toLane[0] : toLane;
    const isTarget = Array.isArray(toLane) ? (v) => toLane.indexOf(v) >= 0 : (v) => v === toLane;
    dist.fill(Infinity); prev.fill(-1); heap.clear();
    const l0 = this.lanes[fromLaneId];
    dist[fromLaneId] = Math.max(0, l0.length - fromS) / (l0.limitKmh / 3.6);
    heap.push(dist[fromLaneId], fromLaneId);
    // Nota: a rota devolvida pode começar numa faixa PARALELA à de origem (troca de faixa).
    while (heap.n > 0) {
      const u = heap.pop(), du = heap.lastKey;
      if (du > dist[u]) continue;
      if (isTarget(u)) { toLaneId = u; break; }
      const lu = this.lanes[u];
      const nx = lu.next;
      for (let k = 0; k < nx.length; k++) {
        const v = nx[k], lv = this.lanes[v];
        const w = lv.length / (lv.limitKmh / 3.6) + (lv.signal ? 7 : 0) + (lv.turn === 'uturn' ? 15 : 0) + (this.laneExtraCost ? this.laneExtraCost[v] : 0);
        if (du + w < dist[v]) { dist[v] = du + w; prev[v] = u; heap.push(dist[v], v); }
      }
      // troca de faixa (faixas paralelas adjacentes): custo fixo de 2 s
      if (!lu.isConnector) {
        const sib = this.siblingLanes(lu);
        for (let k = 0; k < sib.length; k++) {
          const v = sib[k];
          if (v === u || Math.abs(this.lanes[v].index - lu.index) !== 1) continue;
          if (du + 2 < dist[v]) { dist[v] = du + 2; prev[v] = u; heap.push(dist[v], v); }
        }
      }
    }
    if (dist[toLaneId] === Infinity || !isTarget(toLaneId)) return null;
    outArr.length = 0;
    for (let v = toLaneId; v !== -1; v = prev[v]) {
      // trocas de faixa colapsam: mantém só a faixa final de cada trecho paralelo
      const last = outArr.length ? this.lanes[outArr[outArr.length - 1]] : null;
      const lv = this.lanes[v];
      if (last && !last.isConnector && !lv.isConnector && last.segId === lv.segId && last.dir === lv.dir) continue;
      outArr.push(v);
    }
    outArr.reverse();
    if (N === 0) return null;
    return outArr;
  }

  /**
   * Rota forçada por waypoints: `via` = [segId, ...] em ordem (qualquer sentido; Dijkstra escolhe o alcançável).
   * Ex.: planRouteVia(l, s, net.routeCorridors.parque['stj-casa'], net.laneForZone('casa').targets).
   * Retorna laneIds (como planRoute) ou null.
   */
  planRouteVia(fromLaneId, fromS, via, toLane, outArr = []) {
    outArr.length = 0;
    let cur = fromLaneId, s = fromS;
    const legs = [...via.map((id) => { const g = this.segments.get(id); if (!g) throw new Error('via inexistente ' + id); return [...g.laneIdsF, ...g.laneIdsB]; }), toLane];
    const tmp = [];
    for (const target of legs) {
      // já está no waypoint?
      const tgt = Array.isArray(target) ? target : [target];
      const curLane = this.lanes[cur];
      if (tgt.indexOf(cur) >= 0 || (!curLane.isConnector && tgt.some((t) => this.lanes[t].segId === curLane.segId && this.lanes[t].dir === curLane.dir))) {
        if (!outArr.length) outArr.push(cur);
        continue;
      }
      const r = this.planRoute(cur, s, target, tmp);
      if (!r) return null;
      if (outArr.length) {
        const last = this.lanes[outArr[outArr.length - 1]], f = this.lanes[r[0]];
        // a perna nova começa na mesma faixa (ou numa paralela, por troca de faixa): não duplica
        if (r[0] === last.id || (!f.isConnector && !last.isConnector && f.segId === last.segId && f.dir === last.dir)) outArr.pop();
      }
      for (let i = 0; i < r.length; i++) outArr.push(r[i]);
      cur = r[r.length - 1]; s = 0;
    }
    return outArr;
  }

  /** Nomes das vias de uma rota, sem repetições consecutivas (conectores fora de balão são ignorados). */
  routeNames(route) {
    const out = [];
    for (const id of route) {
      const l = this.lanes[id];
      if (l.isConnector && !this.nodes.get(l.nodeId).roundaboutId) continue;
      if (out[out.length - 1] !== l.name) out.push(l.name);
    }
    return out;
  }

  /** Comprimento de uma rota (laneIds) a partir de s na primeira faixa. */
  routeLength(route, fromS = 0, toS = Infinity) {
    let L = 0;
    for (let i = 0; i < route.length; i++) {
      const lane = this.lanes[route[i]];
      let a = i === 0 ? fromS : 0, b = i === route.length - 1 ? Math.min(toS, lane.length) : lane.length;
      L += Math.max(0, b - a);
    }
    return L;
  }

  /** Cria um caminhante de faixa (para IA de tráfego). */
  createWalker(laneId, s = 0, rng) { return new LaneWalker(this, laneId, s, rng); }
}

/**
 * Caminhante ao longo do grafo de faixas. Sem alocação por passo.
 *   w.advance(ds)  -> anda ds metros (escolhe próxima faixa via w.route ou aleatório)
 *   w.x, w.z, w.heading, w.lane, w.s, w.ended (chegou num sumidouro/borda)
 *   w.route = [laneIds] (opcional) — se definido, segue a rota
 *   w.chooser = (lane, nextIds, rng) => laneId (opcional)
 */
export class LaneWalker {
  constructor(net, laneId, s = 0, rng) {
    this.net = net; this.rng = rng || makeRng(laneId * 7919 + 13);
    this.lane = net.lanes[laneId]; this.s = s; this.route = null; this.routeIdx = 0; this.chooser = null;
    this.ended = false; this._o = { x: 0, z: 0, tx: 0, tz: 0, heading: 0 };
    this.x = 0; this.z = 0; this.heading = 0;
    this._sample();
  }
  _sample() {
    const o = this.net.sampleLane(this.lane, this.s, this._o);
    this.x = o.x; this.z = o.z; this.heading = o.heading;
  }
  /** Próxima faixa que será tomada (sem avançar), ou -1. */
  peekNext() {
    const nx = this.lane.next;
    if (!nx.length) return -1;
    if (this.route) { const id = this.route[this.routeIdx + 1]; return id === undefined ? -1 : id; }
    if (this._pending === undefined || this._pendingFor !== this.lane.id) {
      this._pending = this.chooser ? this.chooser(this.lane, nx, this.rng) : nx[Math.floor(this.rng() * nx.length)];
      this._pendingFor = this.lane.id;
    }
    return this._pending;
  }
  advance(ds) {
    this.s += ds;
    while (this.s > this.lane.length && !this.ended) {
      const nid = this.peekNext();
      if (nid < 0) { this.s = this.lane.length; this.ended = true; break; }
      this.s -= this.lane.length;
      this.lane = this.net.lanes[nid];
      if (this.route) this.routeIdx++;
      this._pending = undefined;
    }
    this._sample();
    return this;
  }
  /** Distância até o fim da faixa atual. */
  get remaining() { return this.lane.length - this.s; }
}
