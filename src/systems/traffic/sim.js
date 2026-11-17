// Simulação do trânsito (IA de veículos, pedestres, perigos de pista, fiscalização da viagem). PURO JS (sem three.js):
// roda em Node para os testes (src/systems/traffic/__tests__/). O módulo src/systems/traffic.js liga isto ao jogo.
//
// Modelo:
//  - Veículos andam no grafo de faixas com um LaneWalker cada (net.createWalker). Cada um guarda um "caminho" curto
//    (path: próximas faixas já sorteadas) e o walker segue esse caminho (chooser). Troca de faixa = o walker pula
//    para a faixa paralela e um deslocamento lateral (latOff) decai até 0 (animação suave + seta).
//  - Longitudinal: IDM (Intelligent Driver Model). Obstáculos = veículos à frente no caminho (baldes por faixa),
//    linha de parada de semáforo, faixa de pedestre ocupada, entrada de rotatória sem brecha, ponto de ônibus,
//    curva/limite menor adiante, e um "cone" geométrico (cruzamentos, jogador, pedestres, motos no corredor).
//  - Nada aloca no passo (exceto payloads de eventos, que são raros).
import { makeRng } from '../../core/math.js';
import { obbVsObb, circleVsObb, makeOBB, makeContact } from '../../core/collision.js';
import { PERSONAS, MODEL_PERSONA, MODEL_DIMS, ROAD_TRAFFIC, ROAD_DEFAULT, pickWeighted } from './personas.js';

const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const rr = (rng, v) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * rng() : v);

export const TUNING = {
  spawnMin: 135,       // m do jogador: spawn fora da vista da câmera (visão máx. ~ 80 m de meia-diagonal)
  spawnMax: 330,
  despawn: 385,
  initMin: 26,         // na largada pode nascer dentro da vista (mas não em cima do jogador)
  lookMax: 130,        // horizonte do IDM (m)
  pathMax: 12,
  thinkEvery: 15,      // passos entre decisões de cada veículo (fatias: 1/15 da frota por passo)
  todDensity: { manha: 0.65, tarde: 0.8 },
  stuckSec: 25,        // parado sem motivo legítimo => "fantasma" por 3 s (ou some, se longe)
  pedRate: { urban: 0.07, eixo: 0.035, eixao: 0.02, arterial: 0.04, local: 0.05, ring: 0.02, ramp: 0 },
  maxJoggers: 4,
  cwHalf: 2.0,         // meia-profundidade da faixa de pedestre
  cwCarTurn: 7,        // s de "vez dos carros" depois que uma faixa sem semáforo esvazia
  cwJoin: 2.5,         // s após o 1º começar a atravessar em que outros ainda entram junto
  // trecho sem ultrapassagem: o lento com fila atrás encosta no acostamento e deixa passar (ninguém fica preso atrás dele a rota toda)
  honkEventGap: 3.5,  // s mínimos entre dois HONKED_AT (várias buzinas seguidas = uma irritação)
  spawnQueueMax: 3,   // parados na faixa a partir dos quais não nasce mais ninguém nela
  // evento "ônibus do STJ na rotatória": chance por viagem e peso de cada rotatória do entorno (roundabout.stj = 1..5)
  stjBusChance: 0.42, stjBusRing: { 1: 0.85, 2: 0.7, 3: 0.4, 4: 0.3, 5: 0.5, 6: 0.8 }, stjBusSwing: 0.2,
  // CONGESTIONAMENTO (0, 1 ou 2 por viagem): fila densa anda-e-para num trecho da rota (ou da alternativa), causa visível
  // no fim (carro quebrado / ônibus parado no acostamento, com pisca-alerta). jamChances = P(0), P(1) (resto = 2).
  jamChances: [0.35, 0.45], jamLen: 70, jamCapKmh: 18, jamSpacing: 7.4, jamFillDist: 320, jamCost: 75,
  // candidatos [segId, fração do trecho (no sentido da viagem) onde fica a causa, rótulo]; o sentido sai das rotas da viagem
  // (opts.routeLanes = faixas das 2 rotas, Eixo e Parque); trecho fora das rotas é ignorado.
  jamSpots: {
    'casa-stj': [['eixo_s1_c0', 0.8, 'Eixo Monumental, antes da Rodoviária'], ['s3_scs', 0.8, 'Via S3 (SCS)'],
      ['primeira_av', 0.85, 'chegada ao Balão da EPIG'], ['jaq_n', 0.75, 'Av. das Jaqueiras'], ['s2_a', 0.8, 'Via S2, acesso ao SAFS']],
    'stj-casa': [['eixo_n1', 0.45, 'Eixo Monumental (Via N1)'], ['s3_scs', 0.8, 'Via S3 (SCS)'],
      ['primeira_av', 0.6, 'saída do Balão da EPIG'], ['jaq_n', 0.7, 'Av. das Jaqueiras'], ['s2_a', 0.75, 'Via S2, saindo do SAFS']],
  },
  // TRAÇOS de motorista, independentes da persona (pesquisa autodeclarada de motoristas brasileiros): fração da frota.
  traits: { speeder: 0.59, onPhone: 0.38, noYield: 0.27, noSignal: 0.23 },
  speederMul: [1.05, 1.25],     // speeder: alvo 5–25% acima do limite (os demais ficam no limite ou abaixo)
  phoneStart: [1.0, 3.0],       // onPhone: s a mais para sair no verde
  phoneT: 1.2, phoneSway: 0.22, phoneSpeedWobble: 0.09, // onPhone: reage mais tarde (T x1,2), oscila na faixa (m) e na velocidade
  pullAfter: { tio: 22, autoescola: 12, mudanca: 14, default: 16 }, pullDur: 7, pullCd: 35, pullKmh: 10, pullLat: 0.72,
};

/** Máximo simultâneo de cada persona lenta/grande na frota (o resto vira 'normal'). */
const PERSONA_CAPS = { onibus: 3, mudanca: 2, autoescola: 2, tio: 3 };

const LEAD = { NONE: 0, VEH: 1, PLAYER: 2, SIGNAL: 3, CROSSWALK: 4, RING: 5, BUSSTOP: 6, LIMIT: 7, CONE: 8, PED: 9 };
export { LEAD };

/** Primeiro cruzamento entre as polilinhas de duas faixas: { sa, sb } (distâncias ao longo de cada uma) ou null. */
function polyCross(a, b) {
  const pa = a.pts, pb = b.pts, na = pa.length / 2, nb = pb.length / 2;
  let best = null;
  for (let i = 0; i < na - 1; i++) {
    const x1 = pa[i * 2], z1 = pa[i * 2 + 1], x2 = pa[i * 2 + 2], z2 = pa[i * 2 + 3];
    for (let j = 0; j < nb - 1; j++) {
      const x3 = pb[j * 2], z3 = pb[j * 2 + 1], x4 = pb[j * 2 + 2], z4 = pb[j * 2 + 3];
      const den = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / den;
      const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const sa = a.cum[i] + t * (a.cum[i + 1] - a.cum[i]), sb = b.cum[j] + u * (b.cum[j + 1] - b.cum[j]);
      if (sa < 0.5 && sb < 0.5) continue; // nascem no mesmo ponto
      if (!best || sa < best.sa) best = { sa, sb };
    }
  }
  return best;
}

class Vehicle {
  constructor(slot, net, sim) {
    this.slot = slot; this.id = 0; this.active = false;
    // --- API pública (contrato) ---
    this.kind = 'sedan'; this.persona = 'normal'; this.x = 0; this.z = 0; this.heading = 0; this.speed = 0;
    this.length = 4; this.width = 1.7; this.laneId = -1; this.braking = false; this.honking = false; this.aggression = 0;
    // --- extras (leitura) ---
    this.blink = 0;          // -1 seta esquerda, +1 direita, 2 pisca-alerta
    this.flashing = false;   // piscando farol
    this.color = 0;          // índice em colors do modelo
    this.px = 0; this.pz = 0; this.ph = 0; // pose do passo anterior (interpolação)
    // --- internos ---
    this.p = PERSONAS.normal; this.mass = 1000;
    this.w = net.createWalker(0, 0);
    this.path = new Int32Array(TUNING.pathMax); this.pathN = 0;
    const self = this;
    this.w.chooser = (lane, nx) => (self.pathN > 1 && self.path[0] === lane.id ? self.path[1] : sim._choose(self, lane));
    this.reset();
  }
  reset() {
    this.speed = 0; this.v0 = 10; this.v0mul = 1; this.v0abs = 0; this.T = 1.4; this.s0 = 2; this.a = 2; this.b = 3;
    this.latOff = 0; this.lat0 = 0; this.lcT = 0; this.lcDur = 0; this.lcFrom = -1; this.lcOffS = 0; this.latTarget = 0;
    this.filtering = false; this.filterT = 0;
    this.coneInter = 0; this.coneKind = 0; this.coneGap = 999; this.coneSpeed = 0; this.coneSlot = -1;
    this.leadKind = 0; this.leadGap = 999; this.leadSpeed = 0; this.leadSlot = -1; this.waitLegit = false;
    this.goLane = -1; this.ringGo = -1; this.redHold = false; this.startDelay = 0; this.dwellT = 0; this.lastStop = -1;
    this.brakeT = 0; this.brakeDecel = 4; this.rbT = 0; this.crashT = 0; this.ghostT = 0; this.stuckT = 0;
    this.honkT = 0; this.honkCd = 0; this.honkBackT = 0; this.flashT = 0; this.flashCd = 0; this.impatT = 0;
    this.revengeT = 0; this.tailT = 0; this.tailCd = 0; this.overtakeT = 0; this.cutIntent = false; this.furaoT = 0;
    this.ovSign = 0; this.ovLat = 0; this.corr = false; this.sideT = 0; this.collCd = 0; this.nmCd = 0; this.reactCd = 0;
    this.blink = 0; this.flashing = false; this.braking = false; this.honking = false; this.acc = 0; this.yawOff = 0;
    this.v0min = 0; this.rbT = 0; this.lastStop = -1;
    this.pullT = 0; this.pullCd = 0; this.queueT = 0; // lento que encosta para a fila passar (trecho sem ultrapassagem)
    this.stjBus = false; this.cutDone = false; this.swing = 0; // ônibus do STJ (evento da rotatória)
    this.pWaitT = 0; this.pIgnT = 0;
    this.stalled = false; this.jam = -1;
    this.speeder = false; this.onPhone = false; this.noYield = false; this.noSignal = false; // traços (TUNING.traits)     // causa visível do congestionamento (parado no acostamento) / índice do congestionamento // impasse com o jogador parado AO LADO (não à frente): ignora o cone dele por 2 s
  }
}

class Pedestrian {
  constructor(slot, net) {
    this.slot = slot; this.id = 0; this.active = false;
    // API: { id, x, z, state, crosswalkId } + extras
    this.x = 0; this.z = 0; this.state = 'gone'; this.crosswalkId = -1;
    this.kind = 'pedestre'; this.heading = 0; this.signaling = false; this.speed = 1.3; this.color = 0; this.variant = 0;
    this.px = 0; this.pz = 0; this.ph = 0; this.phase = 0;
    this.t = 0; this.from = 1; this.waitT = 0; this.approach = false; this.tx = 0; this.tz = 0; this.runner = false;
    this.jit = 0; this.downT = 0; this.awayT = 0; this.nmCd = 0; this.hurry = false;
    this.w = net.createWalker(0, 0); this.jogLat = 0;
  }
}

export class TrafficSim {
  /**
   * opts = { net, signals, events, EV, maxVehicles, maxPedestrians, dims: { kind: {length,width,massKg,colors} } }
   * signals precisa de: stateForLane(lane), isPedWalk(id, group), timeToChange(id).
   */
  constructor(opts) {
    const { net, signals, events, EV } = opts;
    this.net = net; this.signals = signals; this.events = events; this.EV = EV;
    this.dims = Object.assign({}, MODEL_DIMS, opts.dims || {});
    this.maxV = opts.maxVehicles || 40; this.maxP = opts.maxPedestrians || 24;
    this.rng = makeRng(1); this.time = 0; this.stepN = 0; this.nextId = 1; this.nextPedId = 1;
    this.autoSpawn = true;     // debug: false = só debug.spawn (e ninguém some por distância)
    this.timeOfDay = 'manha';
    this.player = null;        // { phys:{x,z,heading,vx,vz,speed}, vehicle:{length,width,massKg} }
    this.playerRoute = null;   // laneIds do GPS (opcional)

    const lanes = net.lanes, nL = lanes.length;
    this.lanes = lanes;
    this._precomputeLanes();
    this._precomputeCrosswalks();
    this._buildSpawnGrid();

    // pools
    this.veh = []; for (let i = 0; i < this.maxV; i++) this.veh.push(new Vehicle(i, net, this));
    this.peds = []; for (let i = 0; i < this.maxP; i++) this.peds.push(new Pedestrian(i, net));
    this.vehicles = [];    // ativos (API)
    this.pedestrians = []; // ativos (API)
    this.hazards = [];
    this.radars = [];
    this.agents = [];
    // baldes por faixa (veículos + jogador)
    const E = this.maxV * 2 + 2;
    this.laneHead = new Int32Array(nL).fill(-1);
    this.entNext = new Int32Array(E); this.entVeh = new Int32Array(E); this.entS = new Float64Array(E); this.entN = 0;
    // jogador
    this.pLaneId = -1; this.pS = 0; this.pSeg = null; this.pL = 3.7; this.pW = 1.6; this.pMass = 800;
    this.px = 0; this.pz = 0; this.ph = 0; this.pvx = 0; this.pvz = 0; this.pSpeed = 0;
    this.pPath = new Int32Array(TUNING.pathMax); this.pPathN = 0; this._pLaneTmp = {};
    this._pObb = makeOBB(); this._pObbI = makeOBB(); this._vObb = makeOBB(); this._c = makeContact();
    this.lead = { id: -1, kind: '', persona: '', gap: 0, speed: 0, closing: 0, v: null };
    this.rear = { id: -1, kind: '', persona: '', gap: 0, speed: 0, closing: 0, v: null };
    this._hasLead = false; this._hasRear = false;
    this.playerInJam = -1;
    this.cwAhead = { crosswalkId: -1, dist: 0, occupied: false, pedCount: 0, waiting: 0, x: 0, z: 0, signalized: false };
    this._hasCw = false; this._cwEmitted = -1;
    this.pTailT = 0; this.furaoCd = 0; this.dirCd = 0; this.honkGlobalCd = 0;
    this._near = []; this._flashRes = { id: -1, kind: '', persona: '', reaction: 'ignore', gap: 0 };
    this._mInter = 0; this._mSpeed = 0; this._mSlot = -1;
    // temporários reutilizados (criados aqui para o "formato" do objeto não mudar depois: evita desotimizar o JIT)
    const sit = () => ({ lGap: 0, lSpeed: 0, fGap: 0, fSpeed: 0, lPlayer: false, fPlayer: false });
    this._sitA = sit(); this._sitB = sit(); this._sitF = sit();
    this._tmpS = { x: 0, z: 0, tx: 0, tz: 0, heading: 0 }; this._wa = { laneId: 0, s: 0 };
    this._lpx = 0; this._lpz = 0; this._lpOk = false; this.seed = 1;
    this.stats = { spawned: 0, despawned: 0, ghosted: 0, stuckRemoved: 0 };
  }

  // =============================================================== pré-cálculos (dados da malha)
  _precomputeLanes() {
    const net = this.net, lanes = this.lanes, nL = lanes.length;
    this.laneStop = new Float64Array(nL);
    this.laneRing = new Int16Array(nL).fill(-1);      // faixa de aproximação de rotatória -> índice do balão
    this.laneRingPhi = new Float64Array(nL);
    this.laneOnRing = new Int16Array(nL).fill(-1);    // faixa/conector dentro do balão
    this.laneNoPass = new Uint8Array(nL);
    this.laneDensity = new Float32Array(nL);
    this.laneBusOK = new Uint8Array(nL);
    this.laneW = new Float32Array(nL);
    this.laneMix = new Array(nL);
    this.laneKind = new Array(nL);
    this.rbs = net.roundabouts;
    const rbIndex = new Map(); this.rbs.forEach((r, i) => rbIndex.set(r.id, i));
    this.ringApproachByNode = new Map();
    const busSegs = new Set();
    for (const b of net.busStops) busSegs.add(b.segId);
    for (const lane of lanes) {
      const id = lane.id;
      const seg = lane.segId ? net.getSegment(lane.segId) : null;
      this.laneW[id] = seg ? seg.laneW : 3.5;
      // linha de parada: fim da faixa, ou antes da faixa de pedestre colada no fim
      let stop = lane.length - 0.5;
      for (const c of lane.crosswalks) if (c.s > lane.length - 8 && c.s - TUNING.cwHalf - 0.6 < stop) stop = c.s - TUNING.cwHalf - 0.6;
      this.laneStop[id] = Math.max(0.5, stop);
      if (seg) {
        const kind = seg.kind || 'urban';
        this.laneKind[id] = kind;
        const rt = ROAD_TRAFFIC[kind] || ROAD_DEFAULT;
        this.laneMix[id] = rt.mix; this.laneDensity[id] = rt.density;
        if (seg.roundaboutId) this.laneOnRing[id] = rbIndex.get(seg.roundaboutId);
        const endN = net.getNode(lane.endNode);
        if (!seg.roundaboutId && endN && endN.type === 'ring') {
          this.laneRing[id] = rbIndex.get(endN.roundaboutId); this.laneRingPhi[id] = endN.phi;
          let arr = this.ringApproachByNode.get(endN.id); if (!arr) { arr = []; this.ringApproachByNode.set(endN.id, arr); }
          arr.push(id);
        }
        const nDir = lane.dir > 0 ? seg.lanesF : seg.lanesB, nOther = lane.dir > 0 ? seg.lanesB : seg.lanesF;
        if (nDir === 1 && nOther >= 1 && seg.length > 400 && !seg.roundaboutId) this.laneNoPass[id] = 1;
        if (seg.busLane !== null || busSegs.has(seg.id)) this.laneBusOK[id] = 1;
      } else {
        this.laneKind[id] = 'junction'; this.laneMix[id] = ROAD_DEFAULT.mix; this.laneDensity[id] = 0;
        const node = net.getNode(lane.nodeId);
        if (node && node.roundaboutId) this.laneOnRing[id] = rbIndex.get(node.roundaboutId);
      }
    }
    this.noPassLanes = []; for (let i = 0; i < nL; i++) if (this.laneNoPass[i]) this.noPassLanes.push(i);
    this._buildConflicts();
    this.noPassCd = new Float64Array(nL);
    this.laneJam = new Int8Array(nL).fill(-1);  // faixa -> índice em this.jams (congestionamento da viagem)
    this.jams = [];
  }

  /** Pontos de conflito entre conectores do mesmo nó que se cruzam (não os que só se juntam ou se separam). */
  _buildConflicts() {
    const lanes = this.lanes, byNode = new Map();
    this.connConf = new Array(lanes.length).fill(null);
    for (const l of lanes) if (l.isConnector) { let a = byNode.get(l.nodeId); if (!a) { a = []; byNode.set(l.nodeId, a); } a.push(l); }
    let n = 0;
    for (const list of byNode.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.toLane === b.toLane || a.fromLane === b.fromLane) continue;
        const hit = polyCross(a, b);
        if (!hit) continue;
        (this.connConf[a.id] || (this.connConf[a.id] = [])).push({ other: b.id, sMe: hit.sa, sOther: hit.sb });
        (this.connConf[b.id] || (this.connConf[b.id] = [])).push({ other: a.id, sMe: hit.sb, sOther: hit.sa });
        n++;
      }
    }
    this.conflictPairs = n;
  }

  _precomputeCrosswalks() {
    const net = this.net, cws = net.crosswalks, n = cws.length;
    this.cwCross = new Int16Array(n); this.cwWait = new Int16Array(n); this.cwCount = new Int16Array(n);
    this.cwGroup = new Int8Array(n); this.cwRate = new Float32Array(n);
    this.cwAx = new Float64Array(n); this.cwAz = new Float64Array(n); this.cwBx = new Float64Array(n); this.cwBz = new Float64Array(n);
    this.cwLen = new Float64Array(n);
    // vez dos carros: depois que a faixa esvazia, ninguém começa a atravessar por cwCarTurn s (sem semáforo; evita fila eterna)
    this.cwPrevCross = new Int16Array(n); this.cwHold = new Float64Array(n); this.cwStart = new Float64Array(n);
    for (const c of cws) {
      const h = c.heading, rx = -Math.cos(h), rz = Math.sin(h), off = c.halfWidth + 1.0;
      this.cwAx[c.id] = c.x + rx * off; this.cwAz[c.id] = c.z + rz * off;
      this.cwBx[c.id] = c.x - rx * off; this.cwBz[c.id] = c.z - rz * off;
      this.cwLen[c.id] = off * 2;
      let g = 0;
      if (c.signalId >= 0) { const sig = net.signals[c.signalId]; const ap = sig && sig.approaches.find((a) => a.segId === c.segId); if (ap) g = ap.group; }
      this.cwGroup[c.id] = g;
      const seg = net.getSegment(c.segId);
      this.cwRate[c.id] = TUNING.pedRate[seg.kind] ?? 0.05;
    }
  }

  _buildSpawnGrid() {
    this.spCell = 150; this.spGrid = new Map();
    const sp = this.net.spawnPoints;
    for (let i = 0; i < sp.length; i++) {
      const k = this._cellKey(Math.floor(sp[i].x / this.spCell), Math.floor(sp[i].z / this.spCell));
      let l = this.spGrid.get(k); if (!l) { l = []; this.spGrid.set(k, l); }
      l.push(i);
    }
  }
  _cellKey(ix, iz) { return (ix + 5000) * 10007 + (iz + 5000); }

  // =============================================================== ciclo
  setPlayer(player) {
    this.player = player;
    const v = player.vehicle || {};
    this.pL = v.length || 3.7; this.pW = v.width || 1.6; this.pMass = v.massKg || 900;
  }

  /** Limpa tudo e repovoa (início de viagem). opts = { seed, timeOfDay, route } */
  reset(opts = {}) {
    this.seed = (opts.seed >>> 0) || 1;
    this.rng = makeRng(this.seed);
    this.timeOfDay = opts.timeOfDay || 'manha';
    this.playerRoute = opts.route || null;
    this.time = 0; this.stepN = 0; this.nextId = 1; this.nextPedId = 1; this._lpOk = false;
    this.pTailT = 0; this.furaoCd = 6; this.dirCd = 2; this.honkGlobalCd = 0; this._cwEmitted = -1;
    this.noPassCd.fill(0); this.cwCount.fill(0); this.cwCross.fill(0); this.cwWait.fill(0); this.cwPrevCross.fill(0); this.cwHold.fill(0); this.cwStart.fill(0);
    for (const v of this.veh) { v.active = false; v.reset(); }
    for (const p of this.peds) { p.active = false; p.state = 'gone'; }
    this.vehicles.length = 0; this.pedestrians.length = 0;
    const erng = makeRng((this.seed * 2654435761) >>> 0 || 7);
    this._rollHazards(erng);
    this._rollEnforcement(erng);
    this._rollJams(erng, opts);
    const stjOn = opts.stjBus != null ? !!opts.stjBus : erng() < TUNING.stjBusChance;
    this.stjEvent = { on: stjOn, force: !!opts.stjBusForce, fired: false, ring: -1, busId: -1, tried: new Set(), rng: erng() };
    if (this.player) {
      this._readPlayer();
      if (this.autoSpawn) this._fillInitial();
    }
    this._rebuildLists();
  }

  get targetCount() { return Math.floor(this.maxV * (TUNING.todDensity[this.timeOfDay] ?? 1)); }

  step(dt) {
    this.time += dt; this.stepN++;
    this._readPlayer(dt);
    for (let i = 0; i < this.vehicles.length; i++) { const v = this.vehicles[i]; v.px = v.x; v.pz = v.z; v.ph = v.heading; }
    for (let i = 0; i < this.pedestrians.length; i++) { const p = this.pedestrians[i]; p.px = p.x; p.pz = p.z; p.ph = p.heading; }
    this._buildBuckets();
    this._updatePlayerPath();
    this._countCrosswalks();
    this._conePass();
    const act = this.vehicles;
    const te = TUNING.thinkEvery;
    for (let i = 0; i < act.length; i++) {
      const v = act[i];
      if (!v.active) continue;
      if ((v.slot + this.stepN) % te === 0) this._think(v, dt * te);
      this._move(v, dt);
    }
    this._updatePeds(dt);
    this._playerInteractions(dt);
    this._playerQueries(dt);
    this._updateAgents(dt);
    this._checkHazards();
    if (this.autoSpawn) { this._spawnLogic(dt); this._despawnLogic(); } // debug (autoSpawn=false): sem spawn/despawn automáticos
    this._rebuildLists();
    if (this.honkGlobalCd > 0) this.honkGlobalCd -= dt;
  }

  _rebuildLists() {
    const vs = this.vehicles; vs.length = 0;
    for (let i = 0; i < this.veh.length; i++) if (this.veh[i].active) vs.push(this.veh[i]);
    const ps = this.pedestrians; ps.length = 0;
    for (let i = 0; i < this.peds.length; i++) if (this.peds[i].active) ps.push(this.peds[i]);
  }

  _emit(name, payload) { if (name && this.events) this.events.emit(name, payload); }

  // =============================================================== jogador
  /**
   * Lê o jogador. Velocidade = phys.vx/vz (mesma convenção da colisão estática do núcleo). Obs.: um piloto de teste que
   * TELEPORTA o carro com vx = vz = 0 (tools/smoke.cjs) é visto pela IA como parado e atravessa os outros carros.
   */
  _readPlayer(dt = 0) {
    void dt;
    const pl = this.player; if (!pl) return;
    const ph = pl.phys;
    const vx = ph.vx, vz = ph.vz;
    this._lpx = ph.x; this._lpz = ph.z; this._lpOk = true;
    this.px = ph.x; this.pz = ph.z; this.ph = ph.heading; this.pvx = vx; this.pvz = vz;
    this.pSpeed = vx * Math.sin(ph.heading) + vz * Math.cos(ph.heading);
    const r = this.net.laneAt(this.px, this.pz, this.ph, this._pLaneTmp);
    if (r && r.dist < 5.5) { this.pLaneId = r.laneId; this.pS = r.s; this.pSeg = r.lane.segId; }
    else { this.pLaneId = -1; this.pSeg = null; if (r && r.dist < 12) this.pSeg = r.lane.segId; }
    const o = this._pObb; o.x = this.px; o.z = this.pz; o.hx = this.pW / 2; o.hz = this.pL / 2; o.angle = this.ph;
  }

  _updatePlayerPath() {
    this.pPathN = 0;
    if (this.pLaneId < 0) return;
    const lanes = this.lanes, P = this.pPath, route = this.playerRoute;
    P[0] = this.pLaneId; this.pPathN = 1;
    let total = lanes[this.pLaneId].length - this.pS;
    let ri = route ? route.indexOf(this.pLaneId) : -1;
    while (total < 220 && this.pPathN < P.length) {
      const lane = lanes[P[this.pPathN - 1]], nx = lane.next;
      if (!nx.length) break;
      let pick = -1;
      if (ri >= 0 && ri + 1 < route.length && nx.indexOf(route[ri + 1]) >= 0) { pick = route[ri + 1]; ri++; }
      else {
        ri = -1;
        for (let k = 0; k < nx.length; k++) { const t = lanes[nx[k]].turn; if (t === 'straight' || t === 'merge' || t === null) { pick = nx[k]; break; } }
        if (pick < 0) pick = nx[0];
        if (route) { const j = route.indexOf(pick); if (j >= 0) ri = j; }
      }
      P[this.pPathN++] = pick; total += lanes[pick].length;
    }
  }

  // =============================================================== baldes por faixa
  _buildBuckets() {
    this.laneHead.fill(-1); this.entN = 0;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if ((v.pullT > 0 && v.latOff > 1.4) || v.stalled) continue; // encostado no acostamento: a fila passa
      this._addEnt(v.w.lane.id, v.w.s, v.slot);
      if (v.lcT > 0 && v.lcFrom >= 0 && Math.abs(v.latOff) > 0.3 * this.laneW[v.w.lane.id]) this._addEnt(v.lcFrom, v.w.s + v.lcOffS, v.slot);
    }
    if (this.pLaneId >= 0) this._addEnt(this.pLaneId, this.pS, -1);
  }
  _addEnt(laneId, s, slot) {
    const e = this.entN++;
    this.entVeh[e] = slot; this.entS[e] = s; this.entNext[e] = this.laneHead[laneId]; this.laneHead[laneId] = e;
  }

  _gradeSep(segA, segB) { return segA && segB && segA !== segB && this.net.isGradeSeparated(segA, segB); }

  // =============================================================== IDM
  _inter(v, vel, gap, vLead, T, s0) {
    const sStar = s0 + Math.max(0, vel * T + vel * (vel - vLead) / (2 * Math.sqrt(v.a * v.b)));
    const g = gap > 0.1 ? gap : 0.1;
    const q = sStar / g;
    return v.a * q * q;
  }

  /** Cone geométrico: cruzamentos, jogador fora da faixa, pedestres, motos no corredor. */
  _conePass() {
    const act = this.vehicles, n = act.length;
    for (let i = 0; i < n; i++) { const v = act[i]; v.coneInter = 0; v.coneKind = 0; v.coneGap = 999; v.coneSpeed = 0; v.coneSlot = -1; }
    for (let i = 0; i < n; i++) {
      const vi = act[i];
      const li = vi.w.lane;
      const si = Math.sin(vi.heading), ci = Math.cos(vi.heading);
      for (let j = i + 1; j < n; j++) {
        const vj = act[j];
        const dx = vj.x - vi.x, dz = vj.z - vi.z, d2 = dx * dx + dz * dz;
        if (d2 > 576) continue;
        const lj = vj.w.lane;
        if (!li.isConnector && !lj.isConnector && li.segId === lj.segId && !vi.filtering && !vj.filtering) continue;
        if (this._gradeSep(li.segId, lj.segId)) continue;
        const dh = wrap(vj.heading - vi.heading);
        if (dh > 2.5 || dh < -2.5) continue;
        const sj = Math.sin(vj.heading), cj = Math.cos(vj.heading);
        const cdh = Math.abs(Math.cos(dh)), sdh = Math.abs(Math.sin(dh));
        const fI = dx * si + dz * ci, lI = -dx * ci + dz * si;      // j no referencial de i
        const fJ = -dx * sj - dz * cj, lJ = dx * cj - dz * sj;      // i no referencial de j
        const extJ = cdh * vj.width * 0.5 + sdh * vj.length * 0.5, extI = cdh * vi.width * 0.5 + sdh * vi.length * 0.5;
        const mI = vi.filtering || vj.filtering ? 0.1 : 0.3;
        const lenI = Math.min(22, Math.max(8, 6 + vi.speed * 1.6)), lenJ = Math.min(22, Math.max(8, 6 + vj.speed * 1.6));
        let seeI = fI > 0 && fI < lenI && Math.abs(lI) < vi.width * 0.5 + mI + extJ;
        let seeJ = fJ > 0 && fJ < lenJ && Math.abs(lJ) < vj.width * 0.5 + mI + extI;
        if (!seeI || !seeJ) { // previsão 0,8 s (pega quem cruza)
          const rvx = (sj * vj.speed - si * vi.speed) * 0.8, rvz = (cj * vj.speed - ci * vi.speed) * 0.8;
          const pdx = dx + rvx, pdz = dz + rvz;
          if (!seeI && sdh > 0.5) { const f = pdx * si + pdz * ci, l = -pdx * ci + pdz * si; if (f > 0 && f < lenI && Math.abs(l) < vi.width * 0.5 + mI + extJ && fI > 0) seeI = true; }
          if (!seeJ && sdh > 0.5) { const f = -pdx * sj - pdz * cj, l = pdx * cj - pdz * sj; if (f > 0 && f < lenJ && Math.abs(l) < vj.width * 0.5 + mI + extI && fJ > 0) seeJ = true; }
        }
        if (seeI && seeJ) { // só um cede: quem aponta para o outro (menor |lateral|); empate: slot maior
          const ai = Math.abs(lI), aj = Math.abs(lJ);
          if (ai < aj - 0.25) seeJ = false; else if (aj < ai - 0.25) seeI = false; else if (vi.slot > vj.slot) seeJ = false; else seeI = false;
        }
        if (seeI && vi.ghostT <= 0) this._coneObs(vi, fI - vi.length * 0.5 - (cdh * vj.length * 0.5 + sdh * vj.width * 0.5), Math.max(0, vj.speed * Math.cos(dh)), LEAD.CONE, vj.slot);
        if (seeJ && vj.ghostT <= 0) this._coneObs(vj, fJ - vj.length * 0.5 - (cdh * vi.length * 0.5 + sdh * vi.width * 0.5), Math.max(0, vi.speed * Math.cos(dh)), LEAD.CONE, vi.slot);
      }
      // jogador
      if (this.player && vi.pIgnT <= 0) {
        const dx = this.px - vi.x, dz = this.pz - vi.z;
        if (dx * dx + dz * dz < 1100 && !this._gradeSep(li.segId, this.pSeg)) {
          const dh = wrap(this.ph - vi.heading), cdh = Math.abs(Math.cos(dh)), sdh = Math.abs(Math.sin(dh));
          const f = dx * si + dz * ci, l = -dx * ci + dz * si;
          const ext = cdh * this.pW * 0.5 + sdh * this.pL * 0.5;
          const len = Math.min(28, Math.max(10, 8 + vi.speed * 2));
          let see = f > 0 && f < len && Math.abs(l) < vi.width * 0.5 + 0.35 + ext;
          if (!see && f > 0) { const pdx = dx + (this.pvx - si * vi.speed) * 0.7, pdz = dz + (this.pvz - ci * vi.speed) * 0.7; const f2 = pdx * si + pdz * ci, l2 = -pdx * ci + pdz * si; see = f2 > 0 && f2 < len && Math.abs(l2) < vi.width * 0.5 + 0.35 + ext; }
          if (see) {
            const vAlong = Math.max(0, this.pvx * si + this.pvz * ci);
            this._coneObs(vi, f - vi.length * 0.5 - (cdh * this.pL * 0.5 + sdh * this.pW * 0.5), vAlong, LEAD.PLAYER, -1);
          }
        }
      }
      // pedestres / ciclistas
      const ps = this.pedestrians;
      for (let k = 0; k < ps.length; k++) {
        const p = ps[k];
        const dx = p.x - vi.x, dz = p.z - vi.z;
        if (dx * dx + dz * dz > 256) continue;
        const f = dx * si + dz * ci, l = -dx * ci + dz * si;
        if (f > 0 && f < Math.max(8, vi.speed * 1.8 + 4) && Math.abs(l) < vi.width * 0.5 + 0.75) this._coneObs(vi, f - vi.length * 0.5 - 0.5, 0, LEAD.PED, -1);
      }
    }
  }
  _coneObs(v, gap, vLead, kind, slot) {
    const tail = kind === LEAD.PLAYER && (v.p.tailgater || v.revengeT > 0);
    const it = this._inter(v, v.speed, gap, vLead, tail ? 0.3 : v.T * 0.8, tail ? 0.8 : Math.min(v.s0, 1.8));
    if (it > v.coneInter) { v.coneInter = it; v.coneKind = kind; v.coneGap = gap; v.coneSpeed = vLead; v.coneSlot = slot; }
  }

  _v0For(v, lane) {
    let s = v.v0abs > 0 ? Math.min(v.v0abs, lane.limitKmh / 3.6 * 1.15) : lane.limitKmh / 3.6 * v.v0mul;
    if (v.p.maxKmh) s = Math.min(s, v.p.maxKmh / 3.6);
    if (v.v0min) s = Math.max(s, Math.min(v.v0min, lane.limitKmh / 3.6 * 1.45));
    if (v.pullT > 0) return Math.min(s, TUNING.pullKmh / 3.6);
    if (this.laneJam[lane.id] >= 0 && lane === v.w.lane) { // dentro da fila: onda anda-e-para
      const J = this.jams[this.laneJam[lane.id]];
      if (v.w.s > J.s0 - 25 && v.w.s < J.s1) s = Math.min(s, J.cap * (0.25 + 0.75 * Math.max(0, Math.sin(this.time * 0.55 - v.w.s * 0.045))));
      return Math.max(0.3, s);
    }
    return Math.max(3, s);
  }

  /** Aceleração do veículo (IDM com todos os obstáculos do caminho) e integração. */
  _move(v, dt) {
    if (v.stalled) { v.speed = 0; v.braking = false; v.blink = 2; v.laneId = v.w.lane.id; return; }
    const lanes = this.lanes, w = v.w, vel = v.speed, halfL = v.length * 0.5;
    v.v0 = this._v0For(v, w.lane);
    if (v.onPhone) v.v0 *= 1 - TUNING.phoneSpeedWobble * (0.5 + 0.5 * Math.sin(this.time * 0.37 + v.slot)); // velocidade irregular
    const tail = (v.p.tailgater || v.revengeT > 0);
    let inter = 0, leadKind = LEAD.NONE, leadGap = 999, leadSpeed = 0, leadSlot = -1;
    let base = -w.s, legit = false;
    const look = Math.min(TUNING.lookMax, 30 + vel * 5);
    const ignoreVeh = v.filtering || v.ghostT > 0;
    for (let k = 0; k < v.pathN; k++) {
      const lane = lanes[v.path[k]], lid = lane.id;
      // veículos (e jogador) nesta faixa
      for (let e = this.laneHead[lid]; e >= 0; e = this.entNext[e]) {
        const slot = this.entVeh[e];
        if (slot === v.slot) continue;
        const sO = this.entS[e];
        if (k === 0 && (sO < w.s || (sO === w.s && slot > v.slot))) continue;
        let oL, oV, kind;
        if (slot < 0) { oL = this.pL; oV = Math.max(0, this.pSpeed); kind = LEAD.PLAYER; if (this._gradeSep(lane.segId, this.pSeg)) continue; }
        else { if (ignoreVeh) continue; const o = this.veh[slot]; oL = o.length; oV = o.speed; kind = LEAD.VEH; }
        const gap = base + sO - halfL - oL * 0.5;
        if (gap > look) continue;
        const T = kind === LEAD.PLAYER && tail ? 0.3 : v.T, s0 = kind === LEAD.PLAYER && tail ? 0.8 : v.s0;
        const it = this._inter(v, vel, gap, oV, T, s0);
        if (it > inter) { inter = it; leadKind = kind; leadGap = gap; leadSpeed = oV; leadSlot = slot; }
      }
      // limite menor adiante (curva/conector)
      if (k > 0) {
        const vl = this._v0For(v, lane);
        if (vl < vel) {
          const g = base - halfL + 3;
          const it = this._inter(v, vel, Math.max(g, 0.5), vl, 0, 0);
          if (it > inter) { inter = it; leadKind = LEAD.LIMIT; leadGap = g; leadSpeed = vl; leadSlot = -1; }
        }
      }
      // conflito em cruzamento: quem chega antes ao ponto de cruzamento passa primeiro
      const cf = lane.isConnector && !ignoreVeh ? this.connConf[lid] : null;
      if (cf) {
        for (let c = 0; c < cf.length; c++) {
          const dm = base + cf[c].sMe;
          if (dm < halfL + 1.0 || dm > 45) continue; // já estou em cima (sigo) ou longe
          const r = this._conflictFirst(v, cf[c].other, cf[c].sOther, dm, vel);
          if (r >= 0) {
            const gap = dm - halfL - 2.0;
            const it = this._inter(v, vel, gap, 0, v.T, 0.5);
            if (it > inter) { inter = it; leadKind = LEAD.VEH; leadGap = gap; leadSpeed = 0; leadSlot = r; }
          }
        }
      }
      // fusão ("zíper"): outro veículo indo para a MESMA faixa por outro conector, mais perto do ponto de junção
      if (lane.isConnector && !ignoreVeh && base + lane.length < 60) {
        const g = this._mergeLeader(v, lane, base + lane.length, vel);
        if (inter < this._mInter) { inter = this._mInter; leadKind = LEAD.VEH; leadGap = g; leadSpeed = this._mSpeed; leadSlot = this._mSlot; }
      }
      // semáforo
      if (lane.signal && !lane.isConnector && v.goLane !== lid) {
        const st = this.signals.stateForLane(lane);
        if (st !== 'green') {
          const gapF = base + this.laneStop[lid] - halfL;
          if (gapF > -0.6) {
            let stop;
            if (st === 'red') stop = gapF > vel * vel / 16 - 0.5;
            else stop = v.persona === 'autoescola' ? gapF > vel * vel / 12 : gapF > vel * vel / 6.4 + 0.5;
            if (stop) {
              const it = this._inter(v, vel, gapF, 0, v.T, 0.6);
              if (it > inter) { inter = it; leadKind = LEAD.SIGNAL; leadGap = gapF; leadSpeed = 0; leadSlot = -1; }
            } else v.goLane = lid;
          }
        }
      }
      // faixas de pedestre
      const cws = lane.crosswalks;
      for (let c = 0; c < cws.length; c++) {
        const cw = cws[c], cid = cw.id;
        const gapF = base + cw.s - TUNING.cwHalf - 0.8 - halfL;
        if (gapF < -1.2) continue;
        if (gapF > look) break;
        if (this.cwCross[cid] > 0 || (this.cwWait[cid] > 0 && gapF > vel * vel / 7 && !(v.noYield && this.net.crosswalks[cid].signalId < 0))) {
          const it = this._inter(v, vel, gapF, 0, v.T, 0.5);
          if (it > inter) { inter = it; leadKind = LEAD.CROSSWALK; leadGap = gapF; leadSpeed = 0; leadSlot = -1; }
        }
      }
      // entrada de rotatória: preferência de quem já está no balão
      const ri = this.laneRing[lid];
      if (ri >= 0 && v.ringGo !== lid) {
        const gapF = base + lane.length - 0.6 - halfL;
        if (gapF > -0.6 && gapF < 30) {
          const gapT = v.stjBus ? 0.25 : v.furaoT > 0 ? 0.8 : v.p.gapRing * (1 - 0.35 * v.aggression);
          if (!this._ringGapOk(v, ri, this.laneRingPhi[lid], gapT)) {
            const it = this._inter(v, vel, gapF, 0, v.T, 0.5);
            if (it > inter) { inter = it; leadKind = LEAD.RING; leadGap = gapF; leadSpeed = 0; leadSlot = -1; }
          } else if (gapF < 4) v.ringGo = lid;
        }
      }
      // ponto de ônibus
      if (v.p.bus && lane.busStops.length) {
        for (let b = 0; b < lane.busStops.length; b++) {
          const st = lane.busStops[b];
          if (st.id === v.lastStop) continue;
          const gapF = base + st.s;
          if (gapF < -2) continue;
          if (gapF < 1.5 && vel < 0.8) { v.dwellT = rr(this.rng, v.p.dwell); v.lastStop = st.id; continue; }
          const it = this._inter(v, vel, gapF, 0, v.T, 0.3);
          if (it > inter) { inter = it; leadKind = LEAD.BUSSTOP; leadGap = gapF; leadSpeed = 0; leadSlot = -1; }
        }
      }
      base += lane.length;
      if (base > look) break;
    }
    if (v.coneInter > inter) { inter = v.coneInter; leadKind = v.coneKind; leadGap = v.coneGap; leadSpeed = v.coneSpeed; leadSlot = v.coneSlot; }
    // motivo "legítimo" para estar parado (propaga pela fila)
    if (leadKind === LEAD.SIGNAL || leadKind === LEAD.CROSSWALK || leadKind === LEAD.BUSSTOP || leadKind === LEAD.PLAYER || leadKind === LEAD.PED) legit = true;
    else if ((leadKind === LEAD.VEH || leadKind === LEAD.CONE) && leadSlot >= 0 && leadGap < 15) legit = this.veh[leadSlot].waitLegit;
    v.waitLegit = legit;
    v.leadKind = leadKind; v.leadGap = leadGap; v.leadSpeed = leadSpeed; v.leadSlot = leadSlot;

    let acc = v.a * (1 - Math.pow(vel / v.v0, 4)) - inter;
    // saída no verde: tempo de reação (autoescola "deixa morrer")
    if (leadKind === LEAD.SIGNAL && vel < 0.5) v.redHold = true;
    else if (v.redHold) {
      v.redHold = false;
      v.startDelay = v.p.stallDelay && this.rng() < 0.6 ? rr(this.rng, v.p.stallDelay) : rr(this.rng, v.p.react);
      if (v.onPhone) { v.startDelay += rr(this.rng, TUNING.phoneStart); v.phoneLate = true; } // distraído no celular: o verde abriu e ele não viu
    }
    if (v.startDelay > 0) { v.startDelay -= dt; if (acc > 0) acc = -1; }
    if (v.dwellT > 0) { v.dwellT -= dt; acc = -4; v.blink = 1; }
    if (v.brakeT > 0) { v.brakeT -= dt; if (acc > -v.brakeDecel) acc = -v.brakeDecel; }
    if (v.crashT > 0) { v.crashT -= dt; acc = -8; }
    if (acc < -9) acc = -9;
    if (leadGap < 0.15 && leadKind !== LEAD.LIMIT && acc > -9) acc = Math.min(acc, -9);
    v.acc = acc;
    let sp = vel + acc * dt;
    if (sp < 0) sp = 0;
    v.speed = sp;
    v.braking = acc < -0.9 || (sp < 0.3 && (inter > 0 || v.dwellT > 0)) || v.brakeT > 0;

    // anda no grafo
    const prevLane = w.lane.id;
    w.advance(sp * dt);
    if (w.lane.id !== prevLane) this._onLaneChanged(v, prevLane);
    if (w.ended) { this._despawn(v); return; }
    this._extendPath(v);
    // lateral (troca de faixa / corredor da moto)
    let latPrev = v.latOff;
    if (v.lcT > 0) {
      v.lcT -= dt;
      const t = Math.min(1, 1 - v.lcT / v.lcDur), sm = t * t * (3 - 2 * t);
      v.latOff = v.lat0 * (1 - sm) + v.latTarget * sm;
      if (v.lcT <= 0) { v.lcT = 0; v.latOff = v.latTarget; v.lcFrom = -1; if (v.blink === 1 || v.blink === -1) v.blink = 0; }
    } else if (v.latOff !== v.latTarget) {
      const d = v.latTarget - v.latOff, mx = 1.2 * dt;
      v.latOff += d > mx ? mx : d < -mx ? -mx : d;
    }
    const h = w.heading, rx = -Math.cos(h), rz = Math.sin(h);
    // celular: oscila levemente dentro da faixa (só visual/posição; fora de troca de faixa, corredor e acostamento)
    const sway = v.onPhone && v.lcT <= 0 && !v.filtering && v.pullT <= 0 ? TUNING.phoneSway * Math.sin(this.time * 0.9 + v.slot * 1.7) : 0;
    v.x = w.x + rx * (v.latOff + sway); v.z = w.z + rz * (v.latOff + sway);
    const latVel = (v.latOff - latPrev) / dt;
    v.yawOff += (-Math.atan2(latVel, Math.max(sp, 2)) - v.yawOff) * Math.min(1, dt * 10);
    v.heading = h + v.yawOff;
    if (v.stjBus) this._busSwing(v, h);
    v.laneId = w.lane.id;
    // seta para curva adiante
    if (v.lcT <= 0 && v.dwellT <= 0 && v.crashT <= 0) {
      let bl = 0, dist = w.lane.length - w.s;
      for (let k = 1; k < v.pathN && dist < 35; k++) {
        const l = lanes[v.path[k]];
        if (l.turn === 'left' || l.turn === 'uturn') { bl = -1; break; }
        if (l.turn === 'right') { bl = 1; break; }
        dist += l.length;
      }
      v.blink = v.noSignal ? 0 : bl; // sem seta (noSignal) em curva/rotatória
    }
    if (v.pullT > 0) v.blink = 1;
    if (v.crashT > 0) v.blink = 2;
    // contadores
    if (v.honkT > 0) { v.honkT -= dt; v.honking = v.honkT > 0; }
    if (v.honkCd > 0) v.honkCd -= dt;
    if (v.flashT > 0) { v.flashT -= dt; v.flashing = v.flashT > 0 && (v.flashT % 0.3) > 0.15; } else v.flashing = false;
    if (v.flashCd > 0) v.flashCd -= dt;
    if (v.revengeT > 0) v.revengeT -= dt;
    if (v.furaoT > 0) v.furaoT -= dt;
    if (v.ghostT > 0) v.ghostT -= dt;
    if (v.pIgnT > 0) v.pIgnT -= dt;
    // impasse: parado pelo cone do jogador (também parado) que NÃO está claramente à frente (cruzamento/balão)
    if (v.coneKind === LEAD.PLAYER && v.speed < 0.3 && Math.abs(this.pSpeed) < 0.5) {
      v.pWaitT += dt;
      if (v.pWaitT > 3) {
        const dx = this.px - v.x, dz = this.pz - v.z, sh = Math.sin(v.heading), ch = Math.cos(v.heading);
        const f = dx * sh + dz * ch, l = Math.abs(-dx * ch + dz * sh);
        if (l > (v.width + this.pW) * 0.5 + 0.5 || f < -1) { v.pIgnT = 2; } // só se o jogador está ao lado/atrás, fora da trilha dele
        v.pWaitT = 0;
      }
    } else v.pWaitT = 0;
    if (v.collCd > 0) v.collCd -= dt;
    if (v.nmCd > 0) v.nmCd -= dt;
    if (v.tailCd > 0) v.tailCd -= dt;
    if (v.reactCd > 0) v.reactCd -= dt;
    if (v.honkBackT > 0) { v.honkBackT -= dt; if (v.honkBackT <= 0) this._honk(v, true); }
    // vigia de "preso para sempre"
    if (sp < 0.3 && !legit && v.dwellT <= 0 && v.crashT <= 0 && v.startDelay <= 0 && this.laneJam[v.w.lane.id] < 0) {
      v.stuckT += dt;
      if (v.stuckT > TUNING.stuckSec) {
        v.stuckT = 0;
        const dx = v.x - this.px, dz = v.z - this.pz;
        if (dx * dx + dz * dz > 90 * 90) { this.stats.stuckRemoved++; this._despawn(v); return; }
        v.ghostT = 3; this.stats.ghosted++;
      }
    } else v.stuckT = 0;
  }

  /** Alguém com o conector `other` no caminho chega antes ao ponto de conflito? Retorna o slot dele ou -1. */
  _conflictFirst(v, other, sOther, dm, vel) {
    const act = this.vehicles, lanes = this.lanes;
    const tm = dm / Math.max(vel, 0.5);
    for (let i = 0; i < act.length; i++) {
      const u = act[i]; if (u === v || !u.active) continue;
      let dist = -u.w.s, du = -1e9;
      for (let j = 0; j < u.pathN && j < 3; j++) {
        if (u.path[j] === other) { du = dist + sOther; break; }
        dist += lanes[u.path[j]].length; if (dist > 50) break;
      }
      if (du === -1e9) continue;
      const half = u.length * 0.5 + 1.2;
      if (du < -half) continue;                         // já passou
      if (du < half) return u.slot;                     // está em cima do ponto
      const tu = du / Math.max(u.speed, 0.5);
      if (tu < tm - 0.05 || (Math.abs(tu - tm) <= 0.05 && u.slot < v.slot)) return u.slot;
    }
    return -1;
  }

  /** Líder virtual na fusão de dois conectores que levam à mesma faixa. dm = distância (centro) até o fim do meu conector. */
  _mergeLeader(v, conn, dm, vel) {
    this._mInter = 0; this._mSpeed = 0; this._mSlot = -1;
    const target = conn.next[0], lanes = this.lanes, act = this.vehicles;
    const ringT = this.laneOnRing[target] >= 0, meIn = ringT && this.laneOnRing[conn.fromLane] >= 0;
    let bestGap = 999;
    for (let i = 0; i < act.length; i++) {
      const u = act[i]; if (u === v || !u.active) continue;
      let dist = -u.w.s, du = -1;
      for (let j = 0; j < u.pathN && j < 3; j++) {
        const L = lanes[u.path[j]];
        if (L.isConnector && L !== conn && L.next[0] === target) {
          // no balão a fusão não é zíper: quem circula tem a vez; quem entra respeita a brecha (_ringGapOk)
          if (ringT && meIn !== (this.laneOnRing[L.fromLane] >= 0)) break;
          du = dist + L.length; break;
        }
        dist += L.length; if (dist > 60) break;
      }
      if (du < 0) continue;
      if (du > dm + 0.3 || (Math.abs(du - dm) <= 0.3 && u.slot > v.slot)) continue; // eu estou mais perto: tenho a vez
      const gap = dm - du - v.length * 0.5 - u.length * 0.5;
      const it = this._inter(v, vel, gap, u.speed, v.T, v.s0);
      if (it > this._mInter) { this._mInter = it; this._mSpeed = u.speed; this._mSlot = u.slot; bestGap = gap; }
    }
    return bestGap;
  }

  _onLaneChanged(v, prevLane) {
    if (v.goLane === prevLane) v.goLane = -1;
    if (v.ringGo === prevLane) v.ringGo = -1;
    while (v.pathN > 0 && v.path[0] !== v.w.lane.id) { for (let i = 1; i < v.pathN; i++) v.path[i - 1] = v.path[i]; v.pathN--; }
    if (v.pathN === 0) { v.path[0] = v.w.lane.id; v.pathN = 1; }
    if (v.lcT > 0) { v.lcT = 0; v.latOff = v.latTarget; v.lcFrom = -1; } // troca de faixa não atravessa o fim da faixa
    // moto no corredor atravessa o cruzamento no corredor; os demais voltam ao centro
  }

  /** Sorteia a próxima faixa a partir de `lane` (pesos por tipo de manobra). */
  _choose(v, lane) {
    const nx = lane.next, lanes = this.lanes;
    if (nx.length === 1) return nx[0];
    let tot = 0;
    for (let i = 0; i < nx.length; i++) tot += this._turnW(v, lanes[nx[i]], nx.length);
    let r = this.rng() * tot;
    for (let i = 0; i < nx.length; i++) { r -= this._turnW(v, lanes[nx[i]], nx.length); if (r <= 0) return nx[i]; }
    return nx[nx.length - 1];
  }
  _turnW(v, l, n) {
    const t = l.turn;
    if (t === 'uturn') return n > 1 ? 0.02 : 1;
    let w = t === 'straight' || t === 'merge' || t === null ? 1 : 0.55;
    if (v.p.bus && (t === 'left' || t === 'right')) w *= 0.4;
    // conector que leva a beco sem saída: evita
    const out = l.next.length ? this.lanes[l.next[0]] : null;
    if (out && out.endNode) { const nd = this.net.getNode(out.endNode); if (nd && nd.type === 'deadend') w *= 0.15; }
    return w;
  }

  _rebuildPath(v) {
    v.path[0] = v.w.lane.id; v.pathN = 1; v.w._pendingFor = -1; // descarta a escolha em cache do LaneWalker
    this._extendPath(v);
  }
  _extendPath(v) {
    const lanes = this.lanes, P = v.path;
    let total = lanes[P[0]].length - v.w.s;
    for (let k = 1; k < v.pathN; k++) total += lanes[P[k]].length;
    while (total < TUNING.lookMax + 20 && v.pathN < P.length) {
      const lane = lanes[P[v.pathN - 1]];
      if (!lane.next.length) break;
      const id = this._choose(v, lane);
      P[v.pathN++] = id; total += lanes[id].length;
    }
  }

  /** Brecha para entrar no balão `ri` pelo nó de ângulo phiN (circulação: ângulo crescente). */
  _ringGapOk(v, ri, phiN, gapT) {
    const rb = this.rbs[ri], R = rb.radius, band = rb.lanes * rb.laneW * 0.5 + 1.6;
    const act = this.vehicles;
    for (let i = 0; i < act.length; i++) {
      const u = act[i]; if (u === v) continue;
      if (this.laneOnRing[u.w.lane.id] !== ri && this.laneRing[u.w.lane.id] !== ri) continue;
      if (this.laneRing[u.w.lane.id] === ri) continue; // outro esperando na entrada
      if (!this._ringConflict(u.x, u.z, u.speed, u.length, rb, R, band, phiN, gapT)) return false;
    }
    if (this.player && !this._ringConflict(this.px, this.pz, Math.abs(this.pSpeed), this.pL, rb, R, band, phiN, gapT)) return false;
    return true;
  }
  _ringConflict(x, z, sp, L, rb, R, band, phiN, gapT) {
    const dx = x - rb.x, dz = z - rb.z, d = Math.sqrt(dx * dx + dz * dz);
    if (Math.abs(d - R) > band) return true;
    const phi = Math.atan2(-dz, dx);
    let a = (phiN - phi) % TAU; if (a < 0) a += TAU;
    let arc = a * R; if (arc > Math.PI * R) arc -= TAU * R;
    if (arc < -(L * 0.5 + 2.5) || arc > 75) return true;
    if (arc < 7) return false;
    return arc / Math.max(sp, 1.5) > gapT;
  }

  // =============================================================== decisões (fatiadas)
  _think(v, dtT) {
    if (!v.active || v.crashT > 0) return;
    const p = v.p, rng = this.rng;
    // autoescola: freia do nada
    if (p.randomBrake) {
      v.rbT -= dtT;
      if (v.rbT <= 0) { v.rbT = rr(rng, p.randomBrake); if (v.speed > 4) { v.brakeT = 0.5 + rng() * 0.7; v.brakeDecel = 3.5; } }
    }
    this._thinkPullOver(v, dtT);
    const dxp = v.x - this.px, dzp = v.z - this.pz, dP2 = dxp * dxp + dzp * dzp;
    const leadIsPlayer = v.leadKind === LEAD.PLAYER && v.leadGap < 30;
    // impaciência atrás do jogador parado (buzina)
    if (leadIsPlayer && v.speed < 0.6 && Math.abs(this.pSpeed) < 0.6 && v.leadGap < 12 && !this._playerFacingRed() && !(this._hasCw && this.cwAhead.dist < 15 && (this.cwAhead.occupied || this.cwAhead.waiting > 0))) {
      v.impatT += dtT;
      if (v.impatT > p.honkPatience * (1 - 0.5 * v.aggression)) { this._honk(v, true); v.impatT = -2; v.aggression = Math.min(1, v.aggression + 0.05); }
    } else if (v.impatT > 0) v.impatT = 0; else v.impatT = Math.min(0, v.impatT + dtT);
    // apressado/revanche colado atrás do jogador lento: pisca, depois tenta ultrapassar
    if (leadIsPlayer && (p.tailgater || v.revengeT > 0) && this.pSpeed < v.v0 - 2) {
      v.overtakeT += dtT;
      if (v.leadGap < 10 && (p.flasher || v.revengeT > 0) && v.flashCd <= 0 && rng() < 0.4) this._flash(v);
    } else v.overtakeT = Math.max(0, v.overtakeT - dtT);
    // moto no corredor
    if (p.filter) this._thinkFilter(v);
    // revanche: freada de birra na frente do jogador
    if (v.revengeT > 0 && dP2 < 400 && v.reactCd <= 0) {
      const rel = -(dxp * Math.sin(this.ph) + dzp * Math.cos(this.ph));
      if (rel < 0 && this.pLaneId === v.w.lane.id && rng() < 0.25) { v.brakeT = 0.8; v.brakeDecel = 5; v.reactCd = 6; }
      else if (rng() < 0.12) this._honk(v, true);
    }
    // moto buzinando no corredor perto do jogador
    if (p.honky && v.filtering && dP2 < 225 && rng() < 0.08) this._honk(v, true);
    this._tryLaneChange(v, false);
  }

  /** Trecho sem ultrapassagem: lento com fila colada atrás encosta à direita por alguns segundos (a fila passa). */
  _thinkPullOver(v, dtT) {
    const lane = v.w.lane, lid = lane.id;
    if (v.pullCd > 0) v.pullCd -= dtT;
    if (v.pullT > 0) {
      v.pullT -= dtT;
      if (v.pullT <= 0) {
        const st = this._sit(lid, v.w.s, v, this._sitA || (this._sitA = {}));
        if (!(st.fGap > 10 || st.fGap > 4 && st.fSpeed < 2) || lane.isConnector) { v.pullT = 0.6; return; } // ainda tem gente passando
        v.pullT = 0; v.latTarget = 0; v.pullCd = TUNING.pullCd; if (v.blink === 1) v.blink = 0;
      }
      return;
    }
    if (!this.laneNoPass[lid] || lane.isConnector) { v.queueT = 0; return; }
    const slow = v.persona === 'tio' || v.persona === 'autoescola' || v.persona === 'mudanca' || v.v0 < lane.limitKmh / 3.6 * 0.8;
    if (!slow) { v.queueT = 0; return; }
    const st = this._sit(lid, v.w.s, v, this._sitA || (this._sitA = {}));
    if (st.fGap < 25 && v.speed > 2) v.queueT += dtT * (st.fPlayer ? 1.3 : 1); else v.queueT = Math.max(0, v.queueT - dtT * 0.5);
    const after = TUNING.pullAfter[v.persona] || TUNING.pullAfter.default;
    if (v.queueT > after && v.pullCd <= 0 && lane.length - v.w.s > 90) this._startPullOver(v);
  }
  _startPullOver(v) {
    v.pullT = TUNING.pullDur; v.queueT = 0; v.latTarget = this.laneW[v.w.lane.id] * TUNING.pullLat; v.blink = 1;
  }

  _playerFacingRed() {
    if (this.pPathN === 0) return false;
    let base = -this.pS;
    for (let k = 0; k < this.pPathN && base < 40; k++) {
      const lane = this.lanes[this.pPath[k]];
      if (lane.signal && !lane.isConnector) {
        const st = this.signals.stateForLane(lane);
        if (st !== 'green' && base + lane.length > -2) return true;
      }
      base += lane.length;
    }
    return false;
  }

  _thinkFilter(v) {
    const lane = v.w.lane;
    if (lane.isConnector) return;
    const sib = this.net.siblingLanes(lane);
    const st = this._sit(lane.id, v.w.s, v, this._sitF || (this._sitF = {}));
    const slow = st.lGap < 25 && st.lSpeed < v.v0 - 2;
    if (slow && sib.length > 1 && lane.length - v.w.s > 25) {
      if (!v.filtering) {
        // corredor ocupado por outra moto ao lado: espera (duas motos não dividem o mesmo vão)
        for (let i = 0; i < this.vehicles.length; i++) { const o = this.vehicles[i]; if (o !== v && o.filtering && Math.abs(o.w.s - v.w.s) < 6 && (o.w.lane.id === lane.id || sib.indexOf(o.w.lane.id) >= 0)) return; }
        const side = lane.index + 1 < sib.length ? -1 : 1; // corredor à esquerda; se já é a da esquerda, à direita
        v.latTarget = side * this.laneW[lane.id] * 0.5; v.filtering = true;
      }
      v.filterT = 2;
    } else if (v.filtering) {
      v.filterT -= TUNING.thinkEvery / 60;
      // só volta para o meio da faixa se não houver ninguém ao lado/colado (senão continua no corredor)
      const closing = Math.max(0, v.speed - st.lSpeed);
      const room = st.fGap > 1.5 && st.lGap > Math.max(3, v.speed * 0.5 + closing * closing / 7); // dá para frear atrás de quem está na faixa
      if ((v.filterT <= 0 && room) || (lane.length - v.w.s < 20 && room)) { v.filtering = false; v.latTarget = 0; }
    }
  }

  /** Situação numa faixa (líder/seguidor mais próximos em torno de sRef). */
  _sit(laneId, sRef, self, out) {
    out.lGap = 250; out.lSpeed = 30; out.fGap = 250; out.fSpeed = 0; out.lPlayer = false; out.fPlayer = false;
    const halfL = self.length * 0.5;
    for (let e = this.laneHead[laneId]; e >= 0; e = this.entNext[e]) {
      const slot = this.entVeh[e]; if (slot === self.slot) continue;
      const s = this.entS[e];
      const oL = slot < 0 ? this.pL : this.veh[slot].length, oV = slot < 0 ? Math.max(0, this.pSpeed) : this.veh[slot].speed;
      if (s >= sRef) { const g = s - sRef - halfL - oL * 0.5; if (g < out.lGap) { out.lGap = g; out.lSpeed = oV; out.lPlayer = slot < 0; } }
      else { const g = sRef - s - halfL - oL * 0.5; if (g < out.fGap) { out.fGap = g; out.fSpeed = oV; out.fPlayer = slot < 0; } }
    }
    return out;
  }

  _tryLaneChange(v, forced, onlyDir = 0) {
    const lane = v.w.lane;
    if (lane.isConnector || v.lcT > 0 || v.filtering || v.dwellT > 0) return false;
    if (lane.length - v.w.s < 30 || v.w.s < 6) return false;
    const onBus = lane.kind === 'bus' && !v.p.bus;
    if (v.p.noLaneChange && !onBus && !forced) return false;
    const sib = this.net.siblingLanes(lane);
    if (sib.length < 2) return false;
    const cur = this._sit(lane.id, v.w.s, v, this._sitA || (this._sitA = {}));
    const vel = v.speed;
    const accFree = v.a * (1 - Math.pow(vel / v.v0, 4));
    const accCur = accFree - (cur.lGap < 200 ? this._inter(v, vel, cur.lGap, cur.lSpeed, v.T, v.s0) : 0);
    // apressado/revanche atrás do jogador: primeiro cola e pisca (~3,5 s), só depois ultrapassa
    if (!forced && cur.lPlayer && cur.lGap < 45 && (v.p.tailgater || v.revengeT > 0) && v.overtakeT < 6) return false;
    const wantPass = v.overtakeT > 6 || (v.revengeT > 0 && cur.lPlayer);
    let best = -1, bestGain = -1e9, bestS = 0;
    for (let d = -1; d <= 1; d += 2) {
      if (onlyDir && d !== onlyDir) continue;
      const ni = lane.index + d;
      if (ni < 0 || ni >= sib.length) continue;
      const cand = this.lanes[sib[ni]];
      if (cand.kind === 'bus' && !v.p.bus) continue;
      const sC = v.w.s * cand.length / lane.length;
      const st = this._sit(cand.id, sC, v, this._sitB || (this._sitB = {}));
      const cutting = v.cutIntent && st.fPlayer;
      const relax = forced || onBus || cutting;
      const needBack = relax ? (cutting ? 2.5 : 3.5) : Math.max(v.p.minBack || 5, st.fSpeed * (v.p.lcBackTime || 0.9) + (st.fSpeed - vel) * 0.9);
      if (st.fGap < needBack) continue;
      if (st.lGap < Math.max(2.5, vel * (relax ? 0.25 : 0.45))) continue;
      const accC = accFree - (st.lGap < 200 ? this._inter(v, vel, st.lGap, st.lSpeed, v.T, v.s0) : 0);
      let gain = accC - accCur;
      if (d < 0) gain += v.p.keepRight || 0; // índice menor = mais à direita
      if (d > 0 && v.p.preferLeft) gain += 1.2;
      if (d < 0 && v.p.preferLeft) gain -= 2;
      if (v.p.bus) gain += cand.kind === 'bus' ? 2.5 : d < 0 ? 0.8 : -1;
      if (onBus && d > 0) gain += 3;
      if (wantPass && cur.lPlayer && !st.lPlayer) gain += 1.5;
      if (cutting && cand.id === this.pLaneId) gain += 2.5;
      if (forced) gain += 5;
      if (gain > (v.p.lcGain ?? 0.5) && gain > bestGain) { bestGain = gain; best = cand.id; bestS = sC; }
    }
    if (best < 0) return false;
    this._startLaneChange(v, best, bestS);
    return true;
  }

  _startLaneChange(v, laneId, s) {
    const lane = this.lanes[laneId], w = v.w;
    const oldX = v.x, oldZ = v.z, oldId = w.lane.id, oldS = w.s;
    w.lane = lane; w.s = Math.min(Math.max(0, s), lane.length); w.ended = false; w._sample();
    const rx = -Math.cos(w.heading), rz = Math.sin(w.heading);
    v.lat0 = (oldX - w.x) * rx + (oldZ - w.z) * rz;
    v.latOff = v.lat0; v.latTarget = 0;
    v.lcFrom = oldId; v.lcOffS = oldS - w.s;
    v.lcDur = v.lcT = v.cutIntent ? 1.1 : v.p.cutter || v.revengeT > 0 ? 1.4 : v.persona === 'moto' ? 1.0 : 2.2 + this.rng() * 0.8;
    v.blink = v.noSignal ? 0 : v.lat0 > 0 ? -1 : 1; // veio da direita => indo para a esquerda (sem seta: noSignal)
    v.goLane = -1;
    this._rebuildPath(v);
  }

  _honk(v, atPlayer) {
    if (v.honkCd > 0) return;
    v.honkT = 0.35 + this.rng() * 0.6; v.honking = true; v.honkCd = 2.5 + this.rng() * 2;
    if (atPlayer && this.honkGlobalCd <= 0) {
      this.honkGlobalCd = TUNING.honkEventGap; // o som toca sempre; o evento (humor) no máximo 1 a cada honkEventGap s
      this._emit(this.EV.HONKED_AT, { id: v.id, otherId: v.id, kind: v.kind, persona: v.persona, x: v.x, z: v.z });
    }
  }
  _flash(v) {
    v.flashT = 0.9; v.flashCd = 6 + this.rng() * 6;
    this._emit(this.EV.FLASHED, { id: v.id, otherId: v.id, kind: v.kind, persona: v.persona });
  }

  // =============================================================== jogador × trânsito
  _playerInteractions(dt) {
    if (!this.player) return;
    const ph = this.player.phys, sph = Math.sin(this.ph), cph = Math.cos(this.ph);
    const pSp = this.pSpeed, pAbs = Math.abs(pSp), EV = this.EV;
    const Lp = this.pL, Wp = this.pW, c = this._c, A = this._pObb, B = this._vObb;
    const act = this.vehicles;
    for (let i = 0; i < act.length; i++) {
      const v = act[i];
      if (!v.active) continue;
      const dx = v.x - this.px, dz = v.z - this.pz, d2 = dx * dx + dz * dz;
      if (d2 > 1600) { v.ovSign = 0; v.corr = false; v.sideT = 0; v.tailT = 0; continue; }
      const rel = dx * sph + dz * cph, lat = -dx * cph + dz * sph;
      const dh = wrap(v.heading - this.ph), adh = Math.abs(dh);
      const gs = this._gradeSep(this.pSeg, v.w.lane.segId);
      const sv = Math.sin(v.heading), cv = Math.cos(v.heading);
      // ---- colisão
      if (!gs && d2 < 120) {
        B.x = v.x; B.z = v.z; B.hx = v.width * 0.5; B.hz = v.length * 0.5; B.angle = v.heading;
        A.x = this.px; A.z = this.pz;
        if (obbVsObb(A, B, c)) {
          const nx = c.nx, nz = c.nz;
          ph.x += nx * c.depth; ph.z += nz * c.depth; this.px = ph.x; this.pz = ph.z;
          this._lpx += nx * c.depth; this._lpz += nz * c.depth; // empurrão não conta como velocidade
          const vax = sv * v.speed, vaz = cv * v.speed;
          const vn = (this.pvx - vax) * nx + (this.pvz - vaz) * nz;
          if (vn < 0) {
            const mP = this.pMass, mA = v.mass, e = 0.25;
            const j = -(1 + e) * vn / (1 / mP + 1 / mA);
            ph.vx += j / mP * nx; ph.vz += j / mP * nz;
            ph.vx *= 0.9; ph.vz *= 0.9;
            const nvx = vax - j / mA * nx, nvz = vaz - j / mA * nz;
            v.speed = Math.max(0, nvx * sv + nvz * cv) * 0.6;
            ph.speed = ph.vx * sph + ph.vz * cph;
            const impactKmh = -vn * 3.6;
            if (v.collCd <= 0 && impactKmh > 3) {
              v.collCd = 1.0;
              // culpa (heurística): bateu na traseira de quem ia à frente = jogador; foi atingido por trás,
              // ou o outro trocava de faixa / furou a rotatória = outro.
              const aiAhead = rel > 0 && adh < 1.0 && Math.abs(lat) < (Wp + v.width) * 0.5 + 0.3;
              const aiBehind = rel < 0 && adh < 1.0 && Math.abs(lat) < (Wp + v.width) * 0.5 + 0.3;
              let atFault;
              if (aiAhead) atFault = true;
              else if (aiBehind) atFault = false;
              else if (v.lcT > 0 || (v.furaoT > 0 && v.w.lane.isConnector)) atFault = false;
              else if (this.pLaneId < 0) atFault = true;
              else atFault = pAbs >= v.speed;
              this.events && this._emit(EV.COLLISION, {
                a: 'player', b: 'vehicle', kind: v.kind, persona: v.persona, impactKmh, otherId: v.id, id: v.id,
                x: this.px + (v.x - this.px) * 0.5, z: this.pz + (v.z - this.pz) * 0.5, nx, nz, playerAtFault: atFault,
                otherKmh: v.speed * 3.6, brakeChecked: v.brakeT > 0,
              });
              if (impactKmh > 8) v.crashT = 4 + this.rng() * 4;
              v.aggression = Math.min(1, v.aggression + 0.35);
              v.honkCd = 0; this._honk(v, true);
            }
          }
          continue;
        }
        // ---- fina (quase-batida)
        if (v.nmCd <= 0) {
          const I = this._pObbI; I.x = A.x; I.z = A.z; I.hx = A.hx + 0.6; I.hz = A.hz + 0.6; I.angle = A.angle;
          if (obbVsObb(I, B, c)) {
            const rvx = this.pvx - sv * v.speed, rvz = this.pvz - cv * v.speed, rs = Math.sqrt(rvx * rvx + rvz * rvz);
            if (rs > 4.2) {
              v.nmCd = 5;
              this._emit(EV.NEAR_MISS, { id: v.id, otherId: v.id, kind: v.kind, b: 'vehicle', dist: Math.max(0, 0.6 - c.depth), relKmh: rs * 3.6, x: v.x, z: v.z });
              v.aggression = Math.min(1, v.aggression + 0.15);
              if (this.rng() < 0.6) this._honk(v, true);
            }
          }
        }
      }
      // ---- ultrapassagens
      if (adh < 0.8 && Math.abs(lat) < 9) {
        const half = (Lp + v.length) * 0.5 + 0.5;
        const sg = rel > half ? 1 : rel < -half ? -1 : 0;
        if (sg !== 0) {
          if (v.ovSign === -1 && sg === 1 && v.speed > pSp + 0.5) {
            this._emit(EV.OVERTAKEN, { id: v.id, otherId: v.id, kind: v.kind, persona: v.persona, side: v.ovLat < 0 ? 'left' : 'right', relKmh: (v.speed - pSp) * 3.6 });
          } else if (v.ovSign === 1 && sg === -1 && pSp > v.speed + 0.5 && pSp > 2) {
            this._emit(EV.PLAYER_OVERTOOK, { id: v.id, otherId: v.id, kind: v.kind, persona: v.persona, side: v.ovLat < 0 ? 'right' : 'left', relKmh: (pSp - v.speed) * 3.6 });
          }
          v.ovSign = sg; if (v.ovLat === 0) v.ovLat = lat;
        } else v.ovLat = lat;
      } else v.ovSign = 0;
      // ---- fechada (entrou no corredor à frente do jogador vindo do lado)
      const inCorr = rel > 0 && rel < 26 && Math.abs(lat) < 1.5 && adh < 0.75;
      if (inCorr && !v.corr && v.sideT > 0 && (v.lcT > 0 || v.w.lane.isConnector) && pAbs > 3) {
        const gap = rel - (Lp + v.length) * 0.5;
        if (gap < Math.max(12, pAbs * 1.5)) {
          this._emit(EV.CUT_OFF, { id: v.id, otherId: v.id, kind: v.kind, persona: v.persona, gap: Math.max(0, gap), ring: this.laneOnRing[v.w.lane.id] >= 0 });
          v.cutIntent = false;
        }
      }
      v.corr = inCorr;
      // ônibus do STJ entrando à frente de quem circula: é a "fechada" do evento (ring: true), 1x
      if (v.stjBus && !v.cutDone && rel > 0 && rel < 26 && Math.abs(lat) < 3.6 && pAbs > 0.5 && this.pLaneId >= 0 && (this.laneOnRing[this.pLaneId] >= 0 || this.lanes[this.pLaneId].isConnector)) {
        v.cutDone = true;
        this._emit(EV.CUT_OFF, { id: v.id, otherId: v.id, kind: v.kind, persona: v.persona, gap: Math.max(0, rel - (Lp + v.length) * 0.5), ring: true, stj: true });
      }
      if (!inCorr && Math.abs(lat) > 2.0 && Math.abs(lat) < 7) v.sideT = 2; else if (v.sideT > 0) v.sideT -= dt;
      // ---- colado na traseira do jogador
      if (rel < 0 && Math.abs(lat) < 1.4 && adh < 0.5) {
        const gap = -rel - (Lp + v.length) * 0.5;
        if (gap < Math.max(5, v.speed * 0.7) && v.speed > 4) v.tailT += dt; else v.tailT = Math.max(0, v.tailT - dt * 2);
      } else v.tailT = Math.max(0, v.tailT - dt * 2);
      if (v.tailT > 2.0 && v.tailCd <= 0) {
        v.tailCd = 12;
        this._emit(EV.TAILGATED, { id: v.id, otherId: v.id, kind: v.kind, persona: v.persona, gap: Math.max(0, -rel - (Lp + v.length) * 0.5) });
      }
      // ---- intenção de fechar: apressado/revanche que acabou de passar o jogador pela faixa ao lado
      if ((v.p.cutter || v.revengeT > 0) && rel > (Lp + v.length) * 0.5 + 2 && rel < 20 && Math.abs(lat) > 2 && Math.abs(lat) < 5 && adh < 0.4 && v.w.lane.id !== this.pLaneId) {
        if (!v.cutIntent && this.rng() < 0.05) v.cutIntent = true;
        if (v.cutIntent && v.lcT <= 0 && this.pLaneId >= 0) {
          const sib = this.net.siblingLanes(v.w.lane);
          if (sib.indexOf(this.pLaneId) >= 0) this._tryLaneChange(v, false, this.lanes[this.pLaneId].index > v.w.lane.index ? 1 : -1);
        }
      } else if (rel < 0 || rel > 30) v.cutIntent = false;
    }
    // pedestres
    const ps = this.pedestrians;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.state === 'gone') continue;
      const dx = p.x - this.px, dz = p.z - this.pz;
      if (dx * dx + dz * dz > 49) continue;
      A.x = this.px; A.z = this.pz;
      if (circleVsObb(p.x, p.z, 0.35, A, c)) {
        if (p.state !== 'down' && pAbs > 0.8) {
          p.state = 'down'; p.downT = 6; p.x += c.nx * c.depth; p.z += c.nz * c.depth;
          ph.vx *= 0.88; ph.vz *= 0.88; ph.speed = ph.vx * sph + ph.vz * cph;
          this._emit(EV.COLLISION, { a: 'player', b: 'pedestrian', kind: p.kind, impactKmh: pAbs * 3.6, otherId: p.id, id: p.id,
            x: p.x, z: p.z, nx: -c.nx, nz: -c.nz, playerAtFault: true, crosswalkId: p.crosswalkId });
        }
        continue;
      }
      if (p.nmCd <= 0 && p.state !== 'down' && pAbs > 4 && circleVsObb(p.x, p.z, 1.4, A, c)) {
        p.nmCd = 4;
        this._emit(EV.NEAR_MISS, { id: p.id, otherId: p.id, kind: p.kind, b: p.kind === 'ciclista' ? 'cyclist' : 'pedestrian', dist: Math.max(0, 1.05 - c.depth), relKmh: pAbs * 3.6, x: p.x, z: p.z });
      }
    }
  }

  /** Líder/seguidor do jogador, pista livre, faixa de pedestre adiante, cola do jogador no da frente. */
  _playerQueries(dt) {
    this._hasLead = false; this._hasRear = false; this._hasCw = false;
    if (!this.player) return;
    const lanes = this.lanes, halfP = this.pL * 0.5;
    let bestGap = 1e9, bestV = null;
    if (this.pPathN > 0) {
      let base = -this.pS;
      for (let k = 0; k < this.pPathN && base < 160; k++) {
        const lid = this.pPath[k];
        for (let e = this.laneHead[lid]; e >= 0; e = this.entNext[e]) {
          const slot = this.entVeh[e]; if (slot < 0) continue;
          const s = this.entS[e]; if (k === 0 && s <= this.pS) continue;
          const o = this.veh[slot]; const g = base + s - halfP - o.length * 0.5;
          if (g < bestGap) { bestGap = g; bestV = o; }
        }
        if (bestV) break;
        base += lanes[lid].length;
      }
    }
    if (!bestV) { // fora da malha / cruzamento: cone geométrico curto
      const sph = Math.sin(this.ph), cph = Math.cos(this.ph);
      for (const o of this.vehicles) {
        const dx = o.x - this.px, dz = o.z - this.pz;
        const f = dx * sph + dz * cph, l = -dx * cph + dz * sph;
        if (f > 0 && f < 40 && Math.abs(l) < 1.7 && Math.abs(wrap(o.heading - this.ph)) < 1.0) {
          const g = f - halfP - o.length * 0.5; if (g < bestGap) { bestGap = g; bestV = o; }
        }
      }
    }
    if (bestV && bestGap < 150) {
      const L = this.lead; L.id = bestV.id; L.kind = bestV.kind; L.persona = bestV.persona; L.gap = Math.max(0, bestGap);
      L.speed = bestV.speed; L.closing = this.pSpeed - bestV.speed * Math.cos(wrap(bestV.heading - this.ph)); L.v = bestV;
      this._hasLead = true;
      // jogador colando no da frente => reação sorteada (sai da faixa ou freia de birra)
      if (L.gap < Math.max(3, this.pSpeed * 0.4) && this.pSpeed > 5) {
        this.pTailT += dt;
        if (this.pTailT > 2.5) { this.pTailT = -8; this._react(bestV, 'tail'); }
      } else if (this.pTailT > 0) this.pTailT = Math.max(0, this.pTailT - dt);
      else this.pTailT = Math.min(0, this.pTailT + dt);
    }
    // atrás
    let rGap = 1e9, rV = null;
    if (this.pLaneId >= 0) {
      for (let e = this.laneHead[this.pLaneId]; e >= 0; e = this.entNext[e]) {
        const slot = this.entVeh[e]; if (slot < 0) continue;
        const s = this.entS[e]; if (s >= this.pS) continue;
        const o = this.veh[slot]; const g = this.pS - s - halfP - o.length * 0.5;
        if (g < rGap) { rGap = g; rV = o; }
      }
      if (!rV) {
        const prev = lanes[this.pLaneId].prev;
        for (let k = 0; k < prev.length; k++) {
          const pl = lanes[prev[k]];
          for (let e = this.laneHead[pl.id]; e >= 0; e = this.entNext[e]) {
            const slot = this.entVeh[e]; if (slot < 0) continue;
            const o = this.veh[slot]; const g = this.pS + pl.length - this.entS[e] - halfP - o.length * 0.5;
            if (g < rGap) { rGap = g; rV = o; }
          }
        }
      }
    }
    if (rV && rGap < 150) {
      const R = this.rear; R.id = rV.id; R.kind = rV.kind; R.persona = rV.persona; R.gap = Math.max(0, rGap); R.speed = rV.speed;
      R.closing = rV.speed - this.pSpeed; R.v = rV; this._hasRear = true;
    }
    // faixa de pedestre adiante
    if (this.pPathN > 0) {
      let base = -this.pS;
      for (let k = 0; k < this.pPathN && base < 120 && !this._hasCw; k++) {
        const lane = lanes[this.pPath[k]], cws = lane.crosswalks;
        for (let c = 0; c < cws.length; c++) {
          const d = base + cws[c].s - halfP;
          if (d < -TUNING.cwHalf - halfP || d > 120) continue;
          const id = cws[c].id, cw = this.net.crosswalks[id], o = this.cwAhead;
          o.crosswalkId = id; o.dist = Math.max(0, d); o.occupied = this.cwCross[id] > 0; o.pedCount = this.cwCount[id];
          o.waiting = this.cwWait[id]; o.x = cw.x; o.z = cw.z; o.signalized = cw.signalId >= 0;
          this._hasCw = true; break;
        }
        base += lane.length;
      }
    }
    if (this._hasCw && this.cwAhead.occupied && this.cwAhead.dist < 70) {
      if (this._cwEmitted !== this.cwAhead.crosswalkId) {
        this._cwEmitted = this.cwAhead.crosswalkId;
        const o = this.cwAhead;
        this._emit(this.EV.PEDESTRIAN_CROSSING, { crosswalkId: o.crosswalkId, x: o.x, z: o.z, dist: o.dist, on: true, pedCount: o.pedCount, signalized: o.signalized });
      }
    } else if (this._cwEmitted >= 0 && this.cwCross[this._cwEmitted] === 0) {
      const id = this._cwEmitted, cw = this.net.crosswalks[id];
      this._cwEmitted = -1;
      this._emit(this.EV.PEDESTRIAN_CROSSING, { crosswalkId: id, x: cw.x, z: cw.z, dist: -1, on: false, pedCount: 0, signalized: cw.signalId >= 0 });
    }
  }

  /** Reação do veículo ao jogador (farol, buzina, cola): 'yield' | 'brake' | 'ignore'. */
  _react(v, cause) {
    const f = v.p.flash, rng = this.rng;
    let wy = f.yield, wb = f.brake + v.aggression * 0.5 + (cause === 'horn' ? 0.15 : 0), wi = f.ignore;
    if (v.revengeT > 0) { wy *= 0.2; wb += 0.5; }
    let r = rng() * (wy + wb + wi), out;
    if ((r -= wy) <= 0) {
      if (this.laneNoPass[v.w.lane.id] && !v.w.lane.isConnector && v.pullT <= 0 && v.w.lane.length - v.w.s > 60) { this._startPullOver(v); out = 'yield'; }
      else out = this._tryLaneChange(v, true, -1) || this._tryLaneChange(v, true, 1) ? 'yield' : 'ignore';
    }
    else if ((r -= wb) <= 0) { v.brakeT = 0.9 + rng() * 0.5; v.brakeDecel = 4.5; v.aggression = Math.min(1, v.aggression + 0.15); out = 'brake'; }
    else out = 'ignore';
    if (out === 'ignore' && v.aggression > 0.5 && rng() < 0.5) this._honk(v, true);
    v.reactCd = 4;
    return out;
  }

  // =============================================================== pedestres
  _countCrosswalks() {
    this.cwPrevCross.set(this.cwCross);
    this.cwCross.fill(0); this.cwWait.fill(0); this.cwCount.fill(0);
    const ps = this.pedestrians;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]; if (p.crosswalkId < 0) continue;
      if (p.state === 'crossing' || p.state === 'down') { this.cwCross[p.crosswalkId]++; this.cwCount[p.crosswalkId]++; }
      else if (p.state === 'waiting') { this.cwCount[p.crosswalkId]++; if (p.signaling) this.cwWait[p.crosswalkId]++; }
    }
    const pc = this.cwPrevCross, cc = this.cwCross;
    for (let i = 0; i < cc.length; i++) if (pc[i] > 0 && cc[i] === 0) this.cwHold[i] = this.time + TUNING.cwCarTurn;
  }

  _cwSafe(cid, thr) {
    const cw = this.net.crosswalks[cid];
    for (let h = 0; h < cw.laneHits.length; h++) {
      const hit = cw.laneHits[h], lid = hit.laneId;
      for (let e = this.laneHead[lid]; e >= 0; e = this.entNext[e]) {
        const slot = this.entVeh[e];
        const L = slot < 0 ? this.pL : this.veh[slot].length, sp = slot < 0 ? Math.abs(this.pSpeed) : this.veh[slot].speed;
        const d = hit.s - this.entS[e]; // centro até a faixa
        if (d < -L * 0.5 - TUNING.cwHalf) continue;   // já passou
        if (Math.abs(d) < L * 0.5 + TUNING.cwHalf) return false; // em cima da faixa
        if (sp > 1.0 && (d - L * 0.5) / sp < thr) return false;
      }
      // quem vem pela faixa anterior (conector) também conta
      const lane = this.lanes[lid];
      for (let k = 0; k < lane.prev.length; k++) {
        const pl = this.lanes[lane.prev[k]];
        for (let e = this.laneHead[pl.id]; e >= 0; e = this.entNext[e]) {
          const slot = this.entVeh[e];
          const sp = slot < 0 ? Math.abs(this.pSpeed) : this.veh[slot].speed;
          const d = hit.s + pl.length - this.entS[e];
          if (sp > 1.0 && d / sp < thr) return false;
        }
      }
    }
    // jogador fora da malha (ex.: cortando pelo acostamento)
    if (this.player && this.pLaneId < 0) {
      const dx = cw.x - this.px, dz = cw.z - this.pz, d = Math.sqrt(dx * dx + dz * dz);
      const ps = Math.abs(this.pSpeed);
      if (d < 6 || (ps > 1 && d / ps < thr)) return false;
    }
    return true;
  }

  _spawnPedAt(cid) {
    const p = this._freePed(); if (!p) return null;
    const rng = this.rng, cw = this.net.crosswalks[cid];
    p.active = true; p.id = this.nextPedId++; p.kind = 'pedestre'; p.state = 'waiting'; p.crosswalkId = cid;
    p.from = rng() < 0.5 ? 1 : -1; p.runner = rng() < 0.16; p.speed = p.runner ? 3.0 + rng() * 0.6 : 1.15 + rng() * 0.35;
    p.jit = (rng() - 0.5) * 2.2; p.waitT = 0; p.signaling = false; p.approach = true; p.hurry = false; p.downT = 0; p.awayT = 0;
    p.color = (rng() * 7) | 0; p.variant = rng() < 0.3 ? 1 : 0; p.phase = rng() * 6;
    const fx = Math.sin(cw.heading), fz = Math.cos(cw.heading);
    const cx = p.from > 0 ? this.cwAx[cid] : this.cwBx[cid], cz = p.from > 0 ? this.cwAz[cid] : this.cwBz[cid];
    p.tx = cx + fx * p.jit; p.tz = cz + fz * p.jit;
    const along = (rng() < 0.5 ? -1 : 1) * (5 + rng() * 5);
    p.x = p.tx + fx * along; p.z = p.tz + fz * along;
    p.heading = Math.atan2(p.tx - p.x, p.tz - p.z);
    p.px = p.x; p.pz = p.z; p.ph = p.heading; p.nmCd = 0;
    return p;
  }

  _spawnJogger() {
    const n = this.noPassLanes.length; if (!n) return;
    const rng = this.rng;
    for (let t = 0; t < 6; t++) {
      const lid = this.noPassLanes[(rng() * n) | 0], lane = this.lanes[lid];
      const s = 10 + rng() * (lane.length - 20);
      const o = this.net.sampleLane(lane, s, this._tmpS || (this._tmpS = {}));
      const dx = o.x - this.px, dz = o.z - this.pz, d2 = dx * dx + dz * dz;
      if (d2 < 70 * 70 || d2 > 300 * 300) continue;
      const p = this._freePed(); if (!p) return;
      p.active = true; p.id = this.nextPedId++; p.kind = rng() < 0.6 ? 'corredor' : 'ciclista'; p.state = 'walking'; p.crosswalkId = -1;
      p.speed = p.kind === 'corredor' ? 2.5 + rng() * 0.9 : 4.5 + rng() * 1.6;
      p.w.lane = lane; p.w.s = s; p.w.ended = false; p.w._pendingFor = -1; p.w._sample();
      p.jogLat = this.laneW[lid] * 0.5 + 0.9; p.color = (rng() * 7) | 0; p.variant = 0; p.phase = rng() * 6;
      p.signaling = false; p.downT = 0; p.nmCd = 0;
      this._placeJogger(p); p.px = p.x; p.pz = p.z; p.ph = p.heading;
      return;
    }
  }
  _placeJogger(p) {
    const w = p.w, rx = -Math.cos(w.heading), rz = Math.sin(w.heading);
    p.x = w.x + rx * p.jogLat; p.z = w.z + rz * p.jogLat; p.heading = w.heading;
  }
  _freePed() { for (let i = 0; i < this.peds.length; i++) if (!this.peds[i].active) return this.peds[i]; return null; }

  _updatePeds(dt) {
    const ps = this.pedestrians, rng = this.rng;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active) continue;
      if (p.nmCd > 0) p.nmCd -= dt;
      p.phase += dt * (p.state === 'waiting' && !p.approach ? 0 : p.speed * 3.2);
      if (p.state === 'down') { p.downT -= dt; if (p.downT <= 0) { p.state = 'gone'; p.active = false; } continue; }
      if (p.state === 'walking' && p.crosswalkId < 0) { // corredor/ciclista no acostamento
        p.w.advance(p.speed * dt); this._placeJogger(p);
        if (p.w.ended) { p.active = false; p.state = 'gone'; }
        continue;
      }
      const cid = p.crosswalkId, cw = this.net.crosswalks[cid];
      if (p.state === 'waiting') {
        if (p.approach) {
          const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.sqrt(dx * dx + dz * dz);
          if (d < 0.15) { p.approach = false; p.heading = Math.atan2((p.from > 0 ? this.cwBx[cid] : this.cwAx[cid]) - p.x, (p.from > 0 ? this.cwBz[cid] : this.cwAz[cid]) - p.z); }
          else { const st = Math.min(d, 1.3 * dt); p.x += dx / d * st; p.z += dz / d * st; p.heading = Math.atan2(dx, dz); }
          continue;
        }
        p.waitT += dt;
        let go = false;
        if (cw.signalId >= 0) {
          p.signaling = false;
          go = this.signals.isPedWalk(cw.signalId, this.cwGroup[cid]) && (this.signals.timeToChange(cw.signalId) > 4 || p.runner);
        } else {
          p.signaling = p.waitT > 0.3 && this.time >= this.cwHold[cid]; // na vez dos carros espera sem levantar a mão
          const minWait = p.runner ? 0.4 : 1.3;
          const thr = p.runner ? 1.6 : p.waitT > 12 ? 2.0 : 3.0;
          const joining = this.cwCross[cid] > 0 && this.time - this.cwStart[cid] < TUNING.cwJoin;
          go = p.waitT > minWait && (joining || this.time >= this.cwHold[cid]) && this._cwSafe(cid, thr);
          if (go && this.cwCross[cid] === 0) this.cwStart[cid] = this.time;
        }
        if (go) { p.state = 'crossing'; p.t = 0; p.signaling = false; }
        continue;
      }
      if (p.state === 'crossing') {
        if (cw.signalId >= 0 && !p.hurry && !this.signals.isPedWalk(cw.signalId, this.cwGroup[cid])) p.hurry = true;
        const sp = p.speed * (p.hurry ? 1.6 : 1);
        p.t += sp * dt / this.cwLen[cid];
        const t = Math.min(1, p.t), fx = Math.sin(cw.heading), fz = Math.cos(cw.heading);
        const ax = p.from > 0 ? this.cwAx[cid] : this.cwBx[cid], az = p.from > 0 ? this.cwAz[cid] : this.cwBz[cid];
        const bx = p.from > 0 ? this.cwBx[cid] : this.cwAx[cid], bz = p.from > 0 ? this.cwBz[cid] : this.cwAz[cid];
        p.x = ax + (bx - ax) * t + fx * p.jit; p.z = az + (bz - az) * t + fz * p.jit;
        p.heading = Math.atan2(bx - ax, bz - az);
        if (p.t >= 1) { p.state = 'walking'; p.awayT = 4 + rng() * 2; const s = rng() < 0.5 ? 1 : -1; p.heading = Math.atan2(fx * s, fz * s); }
        continue;
      }
      if (p.state === 'walking') { // saindo pela calçada
        p.awayT -= dt;
        p.x += Math.sin(p.heading) * 1.3 * dt; p.z += Math.cos(p.heading) * 1.3 * dt;
        if (p.awayT <= 0) { p.state = 'gone'; p.active = false; }
      }
    }
  }

  // =============================================================== perigos e fiscalização
  _rollHazards(rng) {
    this.hazards.length = 0;
    const spots = this.net.fruitSpots || [];
    if (!spots.length) return;
    const mangas = spots.filter((s) => s.fruit === 'manga'), jacas = spots.filter((s) => s.fruit === 'jaca');
    const nM = Math.min(mangas.length, 6 + ((rng() * 5) | 0));
    const used = new Set();
    const add = (spot, kind) => {
      const ln = spot.lanes[rng() < 0.75 ? 0 : (rng() * spot.lanes.length) | 0]; // quase sempre na faixa rente à árvore
      const fx = Math.sin(spot.heading), fz = Math.cos(spot.heading), rx = -fz, rz = fx;
      const j = (rng() - 0.5) * 1.6, a = (rng() - 0.5) * 3;
      this.hazards.push({ id: this.hazards.length, kind, x: ln.x + rx * j + fx * a, z: ln.z + rz * j + fz * a, r: kind === 'jaca' ? 0.5 : 0.5,
        active: true, squashed: false, rot: rng() * Math.PI * 2, spotId: spot.id, laneId: ln.laneId });
    };
    for (let t = 0; t < nM * 4 && used.size < nM; t++) {
      const s = mangas[(rng() * mangas.length) | 0]; if (used.has(s.id)) continue; used.add(s.id); add(s, 'manga');
    }
    if (jacas.length && rng() < 0.4) add(jacas[(rng() * jacas.length) | 0], 'jaca');
  }

  _rollEnforcement(rng) {
    this.radars.length = 0; this.agents.length = 0;
    const P = { speed: 0.55, busLane: 0.6, redLight: 0.25 };
    for (const e of this.net.enforcementSpots) {
      if (rng() >= (P[e.type] ?? 0.4)) continue;
      const range = e.type === 'speed' ? 25 : e.type === 'busLane' ? 60 : 14;
      this.radars.push({ id: e.id, type: e.type, x: e.x, z: e.z, heading: e.heading, range, limitKmh: e.limitKmh,
        segId: e.segId, dir: e.dir, laneIds: e.laneIds, laneS: e.laneS, poleX: e.poleX, poleZ: e.poleZ,
        signalId: e.signalId ?? -1, group: e.group ?? -1 });
    }
    const hs = this.net.agentHideouts.slice();
    const k = Math.min(hs.length, 2 + ((rng() * 3) | 0));
    for (let i = 0; i < k; i++) {
      const j = (rng() * hs.length) | 0, h = hs.splice(j, 1)[0];
      // meio escondido: um pouco atrás da cobertura (mais longe da pista)
      const ux = h.x - h.roadX, uz = h.z - h.roadZ, ul = Math.hypot(ux, uz) || 1;
      const hx = h.x + ux / ul * 0.8, hz = h.z + uz / ul * 0.8;
      const seg = this.net.getSegment(h.segId), edge = seg ? Math.max(-seg.edgeL, seg.edgeR) + 1.8 : ul - 4;
      const sx = h.roadX + ux / ul * edge, sz = h.roadZ + uz / ul * edge; // para onde vai ao multar (beira da calçada, fora da cobertura)
      this.agents.push({ id: h.id, x: hx, z: hz, heading: h.facing, range: (h.s1 - h.s0) * 0.5, revealed: false,
        segId: h.segId, dir: h.dir, laneIds: h.laneIds, s0: h.s0, s1: h.s1, roadX: h.roadX, roadZ: h.roadZ, cover: h.cover,
        hideX: hx, hideZ: hz, standX: sx, standZ: sz, revealT: 0, px: hx, pz: hz });
    }
  }

  revealAgent(id) {
    for (const a of this.agents) if (a.id === id) { if (!a.revealed) { a.revealed = true; a.revealT = 0; } return a; }
    return null;
  }

  _updateAgents(dt) {
    for (const a of this.agents) {
      a.px = a.x; a.pz = a.z;
      if (!a.revealed || a.revealT >= 1) continue;
      a.revealT = Math.min(1, a.revealT + dt / 1.8);
      const t = a.revealT * a.revealT * (3 - 2 * a.revealT);
      a.x = a.hideX + (a.standX - a.hideX) * t; a.z = a.hideZ + (a.standZ - a.hideZ) * t;
    }
  }

  _checkHazards() {
    if (!this.player || !this.hazards.length) return;
    const sh = Math.sin(this.ph), ch = Math.cos(this.ph), rx = -ch, rz = sh;
    const fz = this.pL * 0.33, tx = this.pW * 0.5 - 0.15;
    for (const h of this.hazards) {
      if (!h.active) continue;
      const dx = h.x - this.px, dz = h.z - this.pz;
      if (dx * dx + dz * dz > 16) continue;
      for (let k = 0; k < 4; k++) {
        const lf = k < 2 ? fz : -fz, lr = (k & 1) ? tx : -tx;
        const wx = this.px + sh * lf + rx * lr, wz = this.pz + ch * lf + rz * lr;
        const ex = h.x - wx, ez = h.z - wz, rr2 = h.r + 0.14;
        if (ex * ex + ez * ez < rr2 * rr2) {
          h.active = false; h.squashed = true;
          this._emit(this.EV.HAZARD_HIT, { id: h.id, kind: h.kind, x: h.x, z: h.z, speedKmh: Math.abs(this.pSpeed) * 3.6, wheel: k });
          break;
        }
      }
    }
  }

  // =============================================================== spawn / despawn
  _freeVeh() { for (let i = 0; i < this.veh.length; i++) if (!this.veh[i].active) return this.veh[i]; return null; }

  _countPersona(id) { let n = 0; for (const v of this.vehicles) if (v.persona === id) n++; return n; }

  /**
   * Põe um veículo na malha. personaId: chave de PERSONAS; kind: modelo (opcional; sorteia do elenco).
   * Ajusta a faixa conforme a persona (ônibus à direita, tio à esquerda, ninguém na faixa de ônibus). Retorna o Vehicle ou null.
   */
  spawn(personaId, kind, laneId, s, opts = {}) {
    const v = this._freeVeh(); if (!v) return null;
    const rng = this.rng;
    let p = PERSONAS[personaId] || PERSONAS.normal;
    let lane = this.lanes[laneId];
    if (!opts.exact && !lane.isConnector) {
      const sib = this.net.siblingLanes(lane);
      if (p.bus && !this.laneBusOK[laneId]) { personaId = 'normal'; p = PERSONAS.normal; }
      let want = lane.index;
      if (p.bus || personaId === 'mudanca') want = 0;
      if (p.preferLeft) want = sib.length - 1;
      if (!p.bus && this.lanes[sib[Math.min(want, sib.length - 1)]].kind === 'bus') want = Math.min(sib.length - 1, want + 1);
      want = Math.min(want, sib.length - 1);
      if (want !== lane.index) { const nl = this.lanes[sib[want]]; s = s * nl.length / lane.length; lane = nl; }
      if (!p.bus && lane.kind === 'bus') return null;
    }
    v.reset(); v.active = true; v.id = this.nextId++;
    v.persona = PERSONAS[personaId] ? personaId : 'normal'; v.p = p;
    v.kind = kind || pickWeighted(p.models, rng());
    const dm = this.dims[v.kind] || MODEL_DIMS.sedan;
    v.length = dm.length; v.width = dm.width; v.mass = dm.massKg || 1200;
    v.color = (rng() * (dm.colors ? dm.colors.length : 6)) | 0;
    v.v0mul = p.speedMul ? rr(rng, p.speedMul) : 1; v.v0abs = p.speedKmh ? rr(rng, p.speedKmh) / 3.6 : 0; v.v0min = opts.v0min || 0;
    v.T = rr(rng, p.T); v.s0 = p.s0; v.a = rr(rng, p.a); v.b = p.b;
    // traços independentes da persona (os lentos por natureza — tio, autoescola, ônibus, caminhão — não correm)
    const TR = TUNING.traits, slowP = p.speedKmh || p.maxKmh || p.bus;
    const fastP = p.speedMul && p.speedMul[0] > 1.05; // apressado/motoboy já correm por natureza
    v.speeder = fastP || (!slowP && rng() < TR.speeder); v.onPhone = rng() < TR.onPhone; v.noYield = rng() < TR.noYield; v.noSignal = rng() < TR.noSignal;
    if (!slowP && !fastP) v.v0mul = v.speeder ? Math.max(v.v0mul, rr(rng, TUNING.speederMul)) : Math.min(v.v0mul, 1.0);
    if (v.onPhone) v.T *= TUNING.phoneT;
    const ts = this.stats.traits || (this.stats.traits = { speeder: 0, onPhone: 0, noYield: 0, noSignal: 0, total: 0 });
    ts.total++; if (v.speeder) ts.speeder++; if (v.onPhone) ts.onPhone++; if (v.noYield) ts.noYield++; if (v.noSignal) ts.noSignal++;
    v.aggression = Math.min(1, (p.aggr || 0) + rng() * 0.1);
    v.rbT = p.randomBrake ? rr(rng, p.randomBrake) : 0;
    const w = v.w; w.lane = lane; w.s = Math.min(Math.max(0, s), lane.length - 0.1); w.ended = false; w._sample();
    this._rebuildPath(v);
    v.v0 = this._v0For(v, lane);
    v.speed = opts.speed != null ? opts.speed : v.v0 * 0.75;
    v.x = w.x; v.z = w.z; v.heading = w.heading; v.px = v.x; v.pz = v.z; v.ph = v.heading; v.laneId = lane.id;
    if (opts.furao) v.furaoT = 10;
    this.stats.spawned++;
    if (this.vehicles.indexOf(v) < 0) this.vehicles.push(v);
    return v;
  }

  _despawn(v) { v.active = false; this.stats.despawned++; }

  /** Espaço livre para nascer em (lane, s)? */
  _spawnClear(x, z, laneId, s, minPlayer) {
    const dxp = x - this.px, dzp = z - this.pz;
    if (this.player && dxp * dxp + dzp * dzp < minPlayer * minPlayer) return false;
    for (let i = 0; i < this.vehicles.length; i++) {
      const o = this.vehicles[i]; const dx = o.x - x, dz = o.z - z;
      if (dx * dx + dz * dz < 14 * 14) return false;
    }
    for (let e = this.laneHead[laneId]; e >= 0; e = this.entNext[e]) if (Math.abs(this.entS[e] - s) < 22) return false;
    // não alimenta fila: faixa (ou a seguinte) já com 3+ parados não recebe ninguém (sem engarrafamento permanente)
    let stopped = 0;
    const nx = this.lanes[laneId].next;
    for (let i = 0; i < this.vehicles.length; i++) {
      const o = this.vehicles[i]; if (o.speed > 2.5) continue;
      const l = o.w.lane.id;
      if (l === laneId || nx.indexOf(l) >= 0) { if (++stopped >= TUNING.spawnQueueMax) return false; }
    }
    return true;
  }

  _pickPersona(mix) {
    let id = pickWeighted(mix, this.rng());
    const caps = PERSONA_CAPS;
    if (caps[id] && this._countPersona(id) >= caps[id]) id = 'normal';
    return id;
  }

  _trySpawnRandom(minR, maxR) {
    const rng = this.rng, sp = this.net.spawnPoints;
    for (let t = 0; t < 10; t++) {
      const a = rng() * TAU, r = Math.sqrt(minR * minR + rng() * (maxR * maxR - minR * minR));
      const x = this.px + Math.cos(a) * r, z = this.pz + Math.sin(a) * r;
      const cell = this.spGrid.get(this._cellKey(Math.floor(x / this.spCell), Math.floor(z / this.spCell)));
      if (!cell) continue;
      const pt = sp[cell[(rng() * cell.length) | 0]];
      const dx = pt.x - this.px, dz = pt.z - this.pz, d2 = dx * dx + dz * dz;
      if (d2 < minR * minR || d2 > maxR * maxR) continue;
      const lid = pt.laneId;
      if (rng() > this.laneDensity[lid] / 1.35) continue;
      if (!this._spawnClear(pt.x, pt.z, lid, pt.s, minR)) continue;
      const pid = this._pickPersona(this.laneMix[lid]);
      const v = this.spawn(pid, null, lid, pt.s);
      if (v) { this._buildBucketsFor(v); return v; }
    }
    return null;
  }
  _trySpawnOnPlayerRoad(minD = TUNING.spawnMin) {
    const rng = this.rng, ahead = rng() < 0.6;
    const r = this.walkAlong(this.pLaneId, this.pS, ahead ? minD + 5 + rng() * (300 - minD) : -(minD + 5 + rng() * (260 - minD)), this._wa || (this._wa = {}));
    if (!r) return null;
    const lane = this.lanes[r.laneId], sib = this.net.siblingLanes(lane);
    const lid = sib.length > 1 ? sib[(rng() * sib.length) | 0] : lane.id;
    const s = r.s * this.lanes[lid].length / lane.length;
    const o = this.net.sampleLane(this.lanes[lid], s, this._tmpS || (this._tmpS = {}));
    if (!this._spawnClear(o.x, o.z, lid, s, minD)) return null;
    const pid = this._pickPersona(this.laneMix[lid] || ROAD_DEFAULT.mix);
    const fast = !ahead && this.pSpeed > 5;
    const v = this.spawn(pid, null, lid, s, fast ? { v0min: this.pSpeed + 2, speed: this.pSpeed + 1 } : {});
    if (v) this._buildBucketsFor(v);
    return v;
  }
  _buildBucketsFor(v) { this._addEnt(v.w.lane.id, v.w.s, v.slot); }

  _fillInitial() {
    this._buildBuckets();
    const target = this.targetCount;
    if (this.pLaneId >= 0) for (let t = 0; t < 60 && this.vehicles.length < target * 0.35; t++) this._trySpawnOnPlayerRoad(TUNING.initMin + 10);
    for (let t = 0; t < 400 && this.vehicles.length < target; t++) this._trySpawnRandom(TUNING.initMin, TUNING.spawnMax);
    // pedestres iniciais nas faixas próximas
    for (let i = 0; i < 6; i++) this._pedSpawnTick(true);
  }

  /** Anda `delta` m pelo grafo a partir de (laneId, s) (negativo = para trás). Retorna { laneId, s } ou null. */
  walkAlong(laneId, s, delta, out = {}) {
    const lanes = this.lanes;
    let lane = lanes[laneId];
    if (delta >= 0) {
      s += delta;
      for (let g = 0; g < 20 && s > lane.length; g++) {
        const nx = lane.next; if (!nx.length) return null;
        let pick = nx[0];
        for (let k = 0; k < nx.length; k++) { const t = lanes[nx[k]].turn; if (t === 'straight' || t === 'merge') { pick = nx[k]; break; } }
        s -= lane.length; lane = lanes[pick];
      }
    } else {
      s += delta;
      for (let g = 0; g < 20 && s < 0; g++) {
        const pv = lane.prev; if (!pv.length) return null;
        let pick = pv[0];
        for (let k = 0; k < pv.length; k++) { const t = lanes[pv[k]].turn; if (t === 'straight' || t === 'merge' || !lanes[pv[k]].isConnector) { pick = pv[k]; break; } }
        lane = lanes[pick]; s += lane.length;
      }
    }
    if (lane.isConnector) { // não nasce dentro de cruzamento
      if (!lane.next.length) return null;
      lane = lanes[lane.next[0]]; s = Math.min(8, lane.length * 0.5);
    }
    out.laneId = lane.id; out.s = Math.max(0, Math.min(s, lane.length - 0.5));
    return out;
  }

  _spawnLogic(dt) {
    // reposição fora da vista
    if (this.vehicles.length < this.targetCount && (this.stepN & 1) === 0) {
      // ~metade da reposição vai para a via do jogador (à frente/atrás, fora da vista): é onde o trânsito "acontece"
      if (this.pLaneId >= 0 && this.rng() < 0.5) this._trySpawnOnPlayerRoad();
      else this._trySpawnRandom(TUNING.spawnMin, TUNING.spawnMax);
    }
    if (this.stepN % 30 === 0) this._pedSpawnTick(false);
    if (this.stepN % 60 === 0) {
      let j = 0; for (const p of this.pedestrians) if (p.crosswalkId < 0) j++;
      if (j < Math.min(TUNING.maxJoggers, (this.maxP / 5) | 0)) this._spawnJogger();
      this._slowGuarantee();
    }
    if (this.stepN % 30 === 15) this._furaoLogic();
    if (this.stepN % 15 === 7) this._stjBusLogic();
    if (this.stepN % 20 === 3) this._jamLogic();
    this.dirCd -= dt;
    if (this.dirCd <= 0) { this.dirCd = 2; this._directedSpawn(); }
  }

  _pedSpawnTick(initial) {
    if (!this.player) return;
    const cws = this.net.crosswalks, rng = this.rng;
    let free = 0; for (const p of this.peds) if (!p.active) free++;
    if (free <= 2) return;
    const aheadId = this._hasCw ? this.cwAhead.crosswalkId : -1;
    for (let i = 0; i < cws.length; i++) {
      const cw = cws[i];
      const dx = cw.x - this.px, dz = cw.z - this.pz, d2 = dx * dx + dz * dz;
      if (d2 > 230 * 230 || (!initial && d2 < 30 * 30)) continue;
      if (this.cwCount[i] >= 3) continue;
      let rate = this.cwRate[i] * 0.5;
      if (i === aheadId) rate *= 2;
      if (initial) rate = 0.25;
      if (rng() < rate) { this._spawnPedAt(i); this.cwCount[i]++; if (--free <= 2) return; }
    }
  }

  _despawnLogic() {
    if (!this.player) return;
    const D2 = TUNING.despawn * TUNING.despawn;
    for (const v of this.vehicles) {
      if (!v.active || v.stalled) continue;
      const dx = v.x - this.px, dz = v.z - this.pz;
      const d2 = dx * dx + dz * dz;
      // longe, ou já ficou para trás de quem está andando (recicla para a frente)
      if (d2 > D2 || (d2 > 250 * 250 && this.pSpeed > 4 && dx * Math.sin(this.ph) + dz * Math.cos(this.ph) < -150)) this._despawn(v);
    }
    for (const p of this.pedestrians) {
      if (!p.active) continue;
      const dx = p.x - this.px, dz = p.z - this.pz;
      if (dx * dx + dz * dz > 330 * 330) { p.active = false; p.state = 'gone'; }
    }
  }

  /** Mantém gente na via do jogador: um lento à frente ou um apressado/moto vindo atrás. */
  _directedSpawn() {
    if (!this.player || this.pLaneId < 0 || this.pSpeed < 4) return;
    if (this.vehicles.length >= this.maxV) return;
    const pl = this.lanes[this.pLaneId]; if (pl.isConnector) return;
    let n = 0;
    for (const v of this.vehicles) {
      const dx = v.x - this.px, dz = v.z - this.pz;
      if (dx * dx + dz * dz < 170 * 170 && Math.abs(wrap(v.heading - this.ph)) < 0.6) n++;
    }
    if (n >= 4) return;
    const rng = this.rng, ahead = rng() < 0.55;
    const r = this.walkAlong(this.pLaneId, this.pS, ahead ? 150 + rng() * 40 : -(150 + rng() * 30), this._wa || (this._wa = {}));
    if (!r) return;
    const lane = this.lanes[r.laneId], sib = this.net.siblingLanes(lane);
    const lid = sib.length > 1 ? sib[(rng() * sib.length) | 0] : lane.id;
    const s = r.s * this.lanes[lid].length / lane.length;
    const o = this.net.sampleLane(this.lanes[lid], s, this._tmpS || (this._tmpS = {}));
    if (!this._spawnClear(o.x, o.z, lid, s, 120)) return;
    let pid;
    if (ahead) pid = pickWeighted(this.laneBusOK[lid] ? { normal: 0.45, tio: 0.15, autoescola: 0.1, mudanca: 0.1, onibus: 0.12, moto: 0.08 } : { normal: 0.5, tio: 0.18, autoescola: 0.12, mudanca: 0.1, moto: 0.1 }, rng());
    else pid = pickWeighted({ apressado: 0.5, moto: 0.25, normal: 0.25 }, rng());
    if (PERSONA_CAPS[pid] && this._countPersona(pid) >= PERSONA_CAPS[pid]) pid = 'normal';
    const v = this.spawn(pid, null, lid, s, ahead ? {} : { v0min: this.pSpeed + 4, speed: this.pSpeed + 3 });
    if (v) this._buildBucketsFor(v);
  }

  /** Trechos sem ultrapassagem (via de mão dupla com 1 faixa/sentido e longa): garante um lento à frente. */
  _slowGuarantee() {
    if (!this.player || this.pPathN === 0) return;
    let base = -this.pS;
    for (let k = 0; k < this.pPathN && base < 260; k++) {
      const lid = this.pPath[k];
      if (this.laneNoPass[lid]) {
        if (this.noPassCd[lid] > this.time) return;
        const sMin = k === 0 ? this.pS : 0;
        for (const v of this.vehicles) {
          if (v.w.lane.id === lid && v.w.s > sMin && (v.persona === 'tio' || v.persona === 'autoescola' || v.persona === 'mudanca' || v.v0 < this.lanes[lid].limitKmh / 3.6 * 0.8)) { this.noPassCd[lid] = this.time + 20; return; }
        }
        const lane = this.lanes[lid];
        const s = Math.max(30, 140 - base);
        if (s > lane.length - 60) return;
        const o = this.net.sampleLane(lane, s, this._tmpS || (this._tmpS = {}));
        const dx = o.x - this.px, dz = o.z - this.pz;
        if (dx * dx + dz * dz < 100 * 100) return;
        if (!this._spawnClear(o.x, o.z, lid, s, 90)) return;
        let pid = pickWeighted({ tio: 0.4, autoescola: 0.35, mudanca: 0.25 }, this.rng());
        if (this.vehicles.length >= this.maxV) { // libera o mais distante
          let far = null, fd = 0;
          for (const v of this.vehicles) { const ex = v.x - this.px, ez = v.z - this.pz, d = ex * ex + ez * ez; if (d > fd) { fd = d; far = v; } }
          if (far && fd > 150 * 150) { this._despawn(far); this._rebuildLists(); } else return;
        }
        const v = this.spawn(pid, null, lid, s, { exact: true });
        if (v) { this._buildBucketsFor(v); this.noPassCd[lid] = this.time + 45; }
        return;
      }
      base += this.lanes[lid].length;
    }
  }

  /**
   * Evento "ônibus do STJ na rotatória" (no máx. 1x por viagem, chance TUNING.stjBusChance): quando o caminho do
   * jogador circula por uma rotatória do entorno do STJ e a próxima entrada está a 22–90 m, um ônibus do STJ
   * (persona onibusSTJ, com seta) aparece nessa aproximação e entra no balão sem esperar brecha, fechando quem
   * está circulando. Visível antes; quem freia/dá espaço escapa; quem força por dentro leva a traseira (_busSwing).
   */
  _stjBusLogic() {
    const E = this.stjEvent;
    if (!E || !E.on || E.fired || !this.player || this.pPathN === 0 || this.pLaneId < 0) return;
    // só quando o jogador já está no balão (ou entrando nele): o ônibus aparece na PRÓXIMA entrada, à vista
    const pl = this.lanes[this.pLaneId];
    const inRing = this.laneOnRing[pl.id] >= 0 || (this.laneRing[pl.id] >= 0 && pl.length - this.pS < 18);
    if (!inRing) return;
    let base = -this.pS, node = null, rbi = -1;
    for (let k = 0; k < this.pPathN && base < 110; k++) {
      const lane = this.lanes[this.pPath[k]], ri = this.laneOnRing[lane.id];
      if (ri >= 0 && this.rbs[ri].stj && lane.segId && lane.endNode) {
        const end = base + lane.length;
        if (end > 24 && end < 60) { node = lane.endNode; rbi = ri; break; }
      }
      base += lane.length;
    }
    if (!node || E.tried.has(node)) return;
    E.tried.add(node);
    const w = TUNING.stjBusRing[this.rbs[rbi].stj] || 0.4;
    if (!E.force && this.rng() > w) return;
    const apps = this.ringApproachByNode.get(node); if (!apps) return;
    let lid = -1;
    for (const a of apps) { const L = this.lanes[a]; if (L.length > 40 && (lid < 0 || L.index < this.lanes[lid].index)) lid = a; }
    if (lid < 0) return;
    const lane = this.lanes[lid], s = lane.length - 15;
    const o = this.net.sampleLane(lane, s, this._tmpS || (this._tmpS = {}));
    for (const v of this.vehicles) { const dx = v.x - o.x, dz = v.z - o.z; if (dx * dx + dz * dz < 18 * 18) this._despawn(v); }
    this._rebuildLists();
    if (this.vehicles.length >= this.maxV) { // libera o mais distante
      let far = null, fd = 0;
      for (const v of this.vehicles) { const ex = v.x - this.px, ez = v.z - this.pz, d = ex * ex + ez * ez; if (d > fd) { fd = d; far = v; } }
      if (far) { this._despawn(far); this._rebuildLists(); }
    }
    const v = this.spawn('onibusSTJ', 'onibus', lid, s, { furao: true, exact: true, speed: 7.5 });
    if (!v) return;
    v.stjBus = true; v.furaoT = 14; v.color = 0; v.noSignal = this.rng() < 0.2; v.blink = v.noSignal ? 0 : -1; // às vezes sem seta (mas visível antes)
    this._buildBucketsFor(v);
    E.fired = true; E.ring = rbi; E.busId = v.id; E.node = node;
    this.stats.stjBus = (this.stats.stjBus || 0) + 1;
  }
  /**
   * Sorteia 0/1/2 congestionamentos da viagem (TUNING.jamSpots da rota) e marca as faixas. this.jams[] =
   * { segId, dir, s0, s1, cap (m/s), label, lanes[], x0,z0,x1,z1 (início/fim no mundo), pts[] (para o minimapa), filled, cause }
   * Também põe custo extra nas faixas (net.laneExtraCost) para o GPS poder sugerir o desvio.
   */
  _rollJams(rng, opts) {
    this.laneJam.fill(-1); this.jams.length = 0;
    if (this.net.laneExtraCost) this.net.laneExtraCost.fill(0);
    const spots = TUNING.jamSpots[opts.routeId] || null;
    if (!spots) return;
    const r = rng();
    let n = opts.jams != null ? opts.jams : r < TUNING.jamChances[0] ? 0 : r < TUNING.jamChances[0] + TUNING.jamChances[1] ? 1 : 2;
    const pool = spots.slice();
    while (n-- > 0 && pool.length) {
      const k = opts.jamSpot != null ? Math.min(pool.length - 1, opts.jamSpot) : (rng() * pool.length) | 0;
      const [segId, frac0, label] = pool.splice(k, 1)[0];
      const seg = this.net.getSegment(segId); if (!seg) continue;
      const RL = opts.routeLanes;
      const onF = RL ? seg.laneIdsF.some((id) => RL.has(id)) : seg.laneIdsF.length > 0, onB = RL ? seg.laneIdsB.some((id) => RL.has(id)) : false;
      if (!onF && !onB) { n++; continue; }
      const dir = onF ? 1 : -1, frac = frac0;
      const ids = (dir > 0 ? seg.laneIdsF : seg.laneIdsB).filter((id) => this.lanes[id].kind !== 'bus');
      if (!ids.length) continue;
      const L0 = this.lanes[ids[0]];
      const s1 = Math.max(TUNING.jamLen + 10, Math.min(L0.length - 8, L0.length * frac)), s0 = Math.max(4, s1 - TUNING.jamLen);
      const ji = this.jams.length;
      const J = { segId, dir, s0, s1, cap: TUNING.jamCapKmh / 3.6, label, lanes: ids, rightLane: (dir > 0 ? seg.laneIdsF : seg.laneIdsB)[0], filled: false, cause: rng() < 0.6 ? 'quebrado' : 'onibus', causeV: null, pts: [] };
      const T = this._tmpS || (this._tmpS = {});
      for (let s = s0; s <= s1 + 0.01; s += (s1 - s0) / 6) { this.net.sampleLane(L0, s, T); J.pts.push(T.x, T.z); }
      J.x0 = J.pts[0]; J.z0 = J.pts[1]; J.x1 = J.pts[J.pts.length - 2]; J.z1 = J.pts[J.pts.length - 1];
      for (const id of ids) { this.laneJam[id] = ji; if (this.net.laneExtraCost) this.net.laneExtraCost[id] = TUNING.jamCost; }
      J.allLanes = (dir > 0 ? seg.laneIdsF : seg.laneIdsB).slice(); // inclui a de ônibus (para saber se o jogador está no trecho)
      this.jams.push(J);
    }
  }
  /** Enche a fila quando o jogador se aproxima (uma vez), põe a causa visível e informa se o jogador está nela. */
  _jamLogic() {
    this.playerInJam = -1;
    if (!this.jams.length || !this.player) return;
    for (let ji = 0; ji < this.jams.length; ji++) {
      const J = this.jams[ji];
      const dx = (J.x0 + J.x1) / 2 - this.px, dz = (J.z0 + J.z1) / 2 - this.pz, d2 = dx * dx + dz * dz;
      if (this.pLaneId >= 0 && J.allLanes.indexOf(this.pLaneId) >= 0 && this.pS > J.s0 - 12 && this.pS < J.s1 + 5) this.playerInJam = ji;
      if (!J.filled && d2 < TUNING.jamFillDist * TUNING.jamFillDist && d2 > 60 * 60) this._fillJam(J, ji);
      if (J.filled && d2 > 600 * 600 && J.causeV) { this._despawn(J.causeV); J.causeV = null; }
    }
  }
  _fillJam(J, ji) {
    J.filled = true;
    const rng = this.rng;
    // causa visível: parado no acostamento logo depois do fim da fila, com pisca-alerta
    const right = this.lanes[J.rightLane];
    if (this.vehicles.length >= this.maxV) this._freeFar(1);
    const cv = this.spawn(J.cause === 'onibus' ? 'onibus' : 'normal', J.cause === 'onibus' ? 'onibus' : null, right.id, Math.min(right.length - 2, J.s1 + 6), { exact: true, speed: 0 });
    if (cv) { cv.stalled = true; cv.jam = ji; cv.latOff = cv.latTarget = this.laneW[right.id] * 0.82; cv.x = cv.w.x - Math.cos(cv.w.heading) * cv.latOff; cv.z = cv.w.z + Math.sin(cv.w.heading) * cv.latOff; cv.px = cv.x; cv.pz = cv.z; cv.blink = 2; J.causeV = cv; }
    // fila: carros espaçados nas faixas normais do trecho (abre espaço reciclando os mais distantes)
    const want = Math.floor((J.s1 - J.s0) / TUNING.jamSpacing) * J.lanes.length;
    this._freeFar(Math.max(0, this.vehicles.length + want - this.maxV));
    let n = 0;
    for (const lid of J.lanes) {
      const lane = this.lanes[lid];
      for (let s = J.s1 - 3; s > J.s0; s -= TUNING.jamSpacing * (0.85 + rng() * 0.3)) {
        if (this.vehicles.length >= this.maxV) break;
        const o = this.net.sampleLane(lane, s, this._tmpS);
        const dx = o.x - this.px, dz = o.z - this.pz; if (dx * dx + dz * dz < 45 * 45) continue;
        const pid = rng() < 0.12 ? 'moto' : rng() < 0.5 ? 'normal' : this._pickPersona(this.laneMix[lid] || ROAD_DEFAULT.mix);
        const v = this.spawn(pid === 'onibus' ? 'normal' : pid, null, lid, s, { exact: true, speed: 0.5 + rng() * 2 });
        if (v) { v.jam = ji; this._buildBucketsFor(v); n++; }
      }
    }
    this.stats.jamFilled = (this.stats.jamFilled || 0) + n;
  }
  /** Recicla os `k` veículos mais distantes do jogador (fora da vista). */
  _freeFar(k) {
    for (let i = 0; i < k; i++) {
      let far = null, fd = 160 * 160;
      for (const v of this.vehicles) { if (v.stalled || v.stjBus) continue; const ex = v.x - this.px, ez = v.z - this.pz, d = ex * ex + ez * ez; if (d > fd) { fd = d; far = v; } }
      if (!far) break;
      this._despawn(far); this._rebuildLists();
    }
  }
  /** Ônibus comprido na curva: gira para dentro em torno da frente, então a TRASEIRA varre para fora (até ~2 m). */
  _busSwing(v, h) {
    const w = v.w, lane = w.lane, onRing = this.laneOnRing[lane.id] >= 0;
    let target = 0;
    if (onRing || lane.isConnector) {
      const T = this._tmpS2 || (this._tmpS2 = { x: 0, z: 0, tx: 0, tz: 0, heading: 0 });
      this.net.sampleLane(lane, Math.min(lane.length, w.s + 5), T);
      let dh = T.heading - h; if (dh > Math.PI) dh -= TAU; else if (dh < -Math.PI) dh += TAU;
      target = Math.sign(dh) * TUNING.stjBusSwing * Math.min(1, Math.abs(dh) / 0.25);
    }
    v.swing += (target - v.swing) * 0.08;
    const a = v.swing; if (Math.abs(a) < 1e-4) return;
    // pivô perto da frente (0,3 L à frente do centro): o centro desloca e a traseira abre para fora da curva
    const piv = v.length * 0.3, fx = Math.sin(h), fz = Math.cos(h), ha = h + a;
    v.x += fx * piv - Math.sin(ha) * piv; v.z += fz * piv - Math.cos(ha) * piv;
    v.heading += a;
  }

  /** Rotatória: de vez em quando alguém entra na frente do jogador. */
  _furaoLogic() {
    if (!this.player || this.pLaneId < 0) return;
    if (this.time < this.furaoCd || this.pSpeed < 3) return;
    const rbi = this.laneOnRing[this.pLaneId];
    let base = -this.pS, node = null;
    for (let k = 0; k < this.pPathN && base < 90; k++) {
      const lane = this.lanes[this.pPath[k]];
      if (this.laneOnRing[lane.id] >= 0 && lane.segId && lane.endNode) {
        const end = base + lane.length;
        if (end > 22 && end < 85) { node = lane.endNode; break; }
      }
      base += lane.length;
    }
    if (!node) { if (rbi < 0) return; return; }
    const apps = this.ringApproachByNode.get(node); if (!apps) return;
    const rng = this.rng;
    this.furaoCd = this.time + 18 + rng() * 14;
    if (rng() > 0.6) return;
    for (const lid of apps) {
      for (const v of this.vehicles) if (v.w.lane.id === lid && v.w.s > this.lanes[lid].length - 45) { v.furaoT = 8; return; }
    }
    const lid = apps[(rng() * apps.length) | 0], lane = this.lanes[lid];
    const s = lane.length - 38; if (s < 4) return;
    const o = this.net.sampleLane(lane, s, this._tmpS || (this._tmpS = {}));
    if (!this._spawnClear(o.x, o.z, lid, s, 55)) return;
    const v = this.spawn(rng() < 0.6 ? 'apressado' : 'normal', null, lid, s, { furao: true, exact: true, speed: 8 });
    if (v) this._buildBucketsFor(v);
  }

  // =============================================================== API de leitura / ações
  leadInfo() { return this._hasLead ? this.lead : null; }
  /** Congestionamento em que o jogador está (objeto de this.jams) ou null. */
  inJam() { return this.playerInJam >= 0 ? this.jams[this.playerInJam] : null; }
  rearInfo() { return this._hasRear ? this.rear : null; }
  freeAhead() {
    let f = 150;
    if (this._hasLead && this.lead.gap < f) f = this.lead.gap;
    if (this._hasCw && this.cwAhead.occupied && this.cwAhead.dist < f) f = this.cwAhead.dist;
    return f;
  }
  crosswalkAhead() { return this._hasCw ? this.cwAhead : null; }
  neighbors(radius, out = this._near) {
    out.length = 0; const r2 = radius * radius;
    for (const v of this.vehicles) { const dx = v.x - this.px, dz = v.z - this.pz; if (dx * dx + dz * dz <= r2) out.push(v); }
    return out;
  }
  provoke(amount = 0.3, radius = 30) {
    const r2 = radius * radius, rng = this.rng; let n = 0;
    for (const v of this.vehicles) {
      const dx = v.x - this.px, dz = v.z - this.pz;
      if (dx * dx + dz * dz > r2) continue;
      n++;
      v.aggression = Math.min(1, v.aggression + amount * v.p.temper * (0.6 + 0.8 * rng()));
      if (v.aggression > 0.55) { v.revengeT = Math.max(v.revengeT, 12 + 25 * v.aggression); if (v.honkBackT <= 0) v.honkBackT = 0.4 + rng() * 0.9; }
    }
    return n;
  }
  /** Jogador pisca o farol para o da frente. Retorna { id, kind, persona, reaction: 'yield'|'brake'|'ignore', gap } ou null. */
  flashLead() {
    if (!this._hasLead || this.lead.gap > 60 || !this.lead.v || !this.lead.v.active) return null;
    const v = this.lead.v, r = this._flashRes;
    r.id = v.id; r.kind = v.kind; r.persona = v.persona; r.gap = this.lead.gap; r.reaction = this._react(v, 'flash');
    return r;
  }
  /** Buzina do jogador: só o da frente reage (sai da faixa / freia de birra). A irritação geral é provoke() (humor chama). */
  playerHorn() {
    if (this._hasLead && this.lead.gap < 40 && this.lead.v && this.lead.v.reactCd <= 0) return this._react(this.lead.v, 'horn');
    return null;
  }

  /** Coloca um veículo à frente (aheadMeters > 0) ou atrás do jogador, na faixa do jogador deslocada de laneOffset (+1 = esquerda). */
  debugSpawn(kindOrPersona, aheadMeters = 40, laneOffset = 0, opts = {}) {
    if (!this.player) return null;
    this._readPlayer();
    let lid = this.pLaneId;
    if (lid < 0) { const r = this.net.nearestLane(this.px, this.pz, {}, this.ph, 1.2, false); if (!r) return null; lid = r.laneId; this.pS = r.s; }
    const r = this.walkAlong(lid, this.pS, aheadMeters, {}); if (!r) return null;
    let lane = this.lanes[r.laneId], s = r.s;
    if (laneOffset && !lane.isConnector) {
      const sib = this.net.siblingLanes(lane), ni = Math.max(0, Math.min(sib.length - 1, lane.index + laneOffset));
      const nl = this.lanes[sib[ni]]; s = s * nl.length / lane.length; lane = nl;
    }
    const persona = PERSONAS[kindOrPersona] ? kindOrPersona : (MODEL_PERSONA[kindOrPersona] || 'normal');
    const kind = PERSONAS[kindOrPersona] ? null : (this.dims[kindOrPersona] ? kindOrPersona : null);
    const v = this.spawn(persona, kind, lane.id, s, Object.assign({ exact: true }, opts));
    if (v) this._rebuildLists();
    return v;
  }
  debugClear() {
    for (const v of this.veh) v.active = false;
    for (const p of this.peds) { p.active = false; p.state = 'gone'; }
    this._rebuildLists();
  }
  /** Esvazia e repovoa em volta da posição atual do jogador (sem re-sortear radares/frutas). */
  debugRepopulate() {
    this.debugClear(); this._readPlayer(); this._updatePlayerPath(); this._fillInitial(); this._rebuildLists();
    for (const v of this.vehicles) { v.px = v.x; v.pz = v.z; v.ph = v.heading; }
  }
  debugSpawnPed(crosswalkId, crossNow = false) {
    const p = this._spawnPedAt(crosswalkId); if (!p) return null;
    p.approach = false; p.x = p.tx; p.z = p.tz;
    if (crossNow) { p.state = 'crossing'; p.t = 0; }
    this._rebuildLists();
    return p;
  }
}
