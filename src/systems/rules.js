// Regras: multas (pardal, sinal vermelho, faixa de pedestre, faixa de ônibus; agentes escondidos), colisões
// (raspão x batida), pontuação (zona de equilíbrio + multiplicador) e resultado da viagem (state.result).
//  - Dono de state.fines/fineTotal, state.score e state.result.
//  - Emite EV.FINE { code, label, amount, points, by:'radar'|'agent', x, z, time }, EV.SIGNAL_RUN, EV.REQ_FINISH.
//  - state.result é preenchido ANTES de qualquer fim: nos fins pedidos aqui ('bateu', 'tomouOCarro'), no EV.ARRIVED
//    ('chegou', emitido pelo núcleo antes do fim) e, por garantia, no EV.TRIP_FINISH (este ouvinte é registrado antes
//    do da UI, pois rules.init roda antes de ui.init) para 'desistiu' ou qualquer outro motivo.
// Lógica pura em rules/fines.js, rules/score.js, rules/result.js; balanceamento em rules/balance.js.
import { EV } from '../core/events.js';
import { MODE } from '../core/state.js';
import { CONFIG } from '../config.js';
import { RULES_BALANCE } from './rules/balance.js';
import { createFineDetector, stepFines } from './rules/fines.js';
import { createScore, stepScore, writeScore, penalize } from './rules/score.js';
import { buildResult } from './rules/result.js';
import { TrafficAdapter } from './rules/traffic-adapter.js';
import { makeRng, deriveSeed } from '../core/math.js';

const NEAR_SIGNAL = 45, NEAR_CW = 35;
// só quem está NA faixa conta (esperando na calçada ou já saindo dela, 'walking', não)
const PED_ON_CROSSWALK = { crossing: 1, down: 1 };

export default {
  name: 'rules',
  balance: RULES_BALANCE,

  init(ctx) {
    this.ctx = ctx;
    this.T = new TrafficAdapter(ctx);
    this.det = createFineDetector();
    this.score = createScore('davi');
    this._snap = { t: 0, x: 0, z: 0, px: null, pz: null, heading: 0, speedKmh: 0, limitKmh: 0, onBusLane: false,
      radars: [], agents: [], approaches: [], crosswalks: [] };
    this._apNear = []; this._cwNear = []; this._cwPool = [];
    this._occMem = new Map(); this._occFlag = new Map();
    this._buildApproaches(ctx);
    const ev = ctx.events, st = ctx.state;
    const live = () => st.mode === MODE.PLAYING;
    ev.on(EV.COLLISION, (c) => this._onCollision(c));
    ev.on(EV.HAZARD_HIT, (h) => { if (live()) this.lastHazard = { kind: h && h.kind === 'jaca' ? 'jaca' : 'manga', t: st.trip.elapsed }; });
    ev.on(EV.TAKEOVER, () => { if (live()) this.finishWith('tomouOCarro', { by: 'dono' }); });
    ev.on(EV.PEDESTRIAN_CROSSING, (p) => { if (p && p.crosswalkId != null) this._occFlag.set(p.crosswalkId, !!p.on); });
    ev.on(EV.ARRIVED, () => { st.result = this.buildResult('chegou', null); });
    ev.on(EV.TRIP_FINISH, (f) => { if (!st.result || st.result.reason !== f.reason) st.result = this.buildResult(f.reason, f.details); });
  },

  _buildApproaches(ctx) {
    this._approaches = [];
    const net = ctx.net; if (!net || !Array.isArray(net.signals)) return;
    const m = RULES_BALANCE.redLight.sideMargin;
    for (const sig of net.signals) for (const ap of sig.approaches || []) {
      const seg = net.getSegment ? net.getSegment(ap.segId) : null;
      const w = seg ? seg.laneW : 3.5, n = (ap.laneIds || [0]).length;
      this._approaches.push({ key: sig.id + ':' + ap.segId, signalId: sig.id, group: ap.group, x: ap.stopX, z: ap.stopZ, heading: ap.heading,
        latMin: -(n - 0.5) * w - m, latMax: 0.5 * w + m, state: 'green' });
    }
  },

  reset(ctx, trip) {
    const st = ctx.state, mode = trip.mode || st.trip.mode;
    this.det = createFineDetector();
    this.score = createScore(mode);
    writeScore(this.score, st.score);
    st.fines.length = 0; st.fineTotal = 0;
    this.mode = mode; this.par = 0; this.scrapes = 0; this.lastHazard = null; this.lastCol = null;
    const seed = (st.traffic && st.traffic.tripSeed) || ((Math.random() * 0xffffffff) >>> 0) || 1;
    this.sinistroNo = 2 + Math.floor(makeRng(deriveSeed(seed, 0x72756c65))() * 98);
    this._snap.px = null; this._snap.pz = null;
    this._occMem.clear(); this._occFlag.clear();
  },

  /** Monta o resultado da viagem (não emite nada). */
  buildResult(reason, details) {
    const st = this.ctx.state, mood = this.ctx.modules.mood;
    const stats = mood && typeof mood.getStats === 'function' ? mood.getStats() : null;
    const crash = reason === 'bateu' ? (details && (details.b || details.kind) ? details : this.lastCol) : null;
    return buildResult({
      reason, mode: st.trip.mode, vehicleId: st.trip.vehicleId, time: st.trip.elapsed, par: this.par,
      score: this.score, fines: st.fines, stats, crash, lastHazard: this.lastHazard, now: st.trip.elapsed,
      scrapes: this.scrapes, sinistroNo: this.sinistroNo,
    }, RULES_BALANCE);
  },

  /** Preenche state.result e pede o fim (motivo: 'bateu' | 'tomouOCarro' | 'desistiu'...). */
  finishWith(reason, details) {
    const st = this.ctx.state;
    if (st.mode !== MODE.PLAYING && st.mode !== MODE.PAUSED) return;
    st.result = this.buildResult(reason, details);
    this.ctx.events.emit(EV.REQ_FINISH, { reason, details });
  },

  _onCollision(c) {
    const st = this.ctx.state;
    if (st.mode !== MODE.PLAYING || !c || c.a !== 'player') return;
    const C = RULES_BALANCE.collision, imp = c.impactKmh || 0;
    this.lastCol = c;
    const crashKmh = CONFIG.crashImpactKmh != null ? CONFIG.crashImpactKmh : C.crashKmh;
    if ((c.b === 'pedestrian' && C.pedestrianAlwaysEnds) || imp >= crashKmh) { this.finishWith('bateu', c); return; }
    if (imp >= C.scrapeMinKmh) { this.scrapes++; penalize(this.score, C.scrapePoints + imp * C.scrapePerKmh); writeScore(this.score, st.score); }
  },

  update(dt, ctx) {
    const st = ctx.state, sp = st.player, T = this.T, snap = this._snap;
    if (st.mode !== MODE.PLAYING) return; // ex.: batida no mesmo passo (o núcleo ainda chama update)
    if (!this.par && st.trip.routeDistLeft > 0) this.par = st.trip.routeDistLeft / RULES_BALANCE.final.parSpeed;
    snap.t = st.trip.elapsed; snap.x = sp.x; snap.z = sp.z; snap.heading = sp.heading;
    snap.speedKmh = sp.speedKmh || 0; snap.limitKmh = sp.speedLimitKmh || 0; snap.onBusLane = !!sp.onBusLane;
    // CTB: pode usar a faixa exclusiva para a conversão à direita logo adiante (não conta como trânsito na faixa)
    if (snap.onBusLane && this._busTurnAllowed(ctx, sp)) snap.onBusLane = false;
    snap.radars = T.radars(); snap.agents = T.agents();
    // semáforos perto
    const ap = this._apNear; ap.length = 0;
    for (const a of this._approaches) {
      const dx = a.x - sp.x, dz = a.z - sp.z;
      if (dx * dx + dz * dz > NEAR_SIGNAL * NEAR_SIGNAL) continue;
      a.state = ctx.signals ? ctx.signals.getState(a.signalId, a.group) : 'green';
      ap.push(a);
    }
    snap.approaches = ap;
    // faixas de pedestre perto (ocupação: pedestres do trânsito, crosswalkAhead recente e PEDESTRIAN_CROSSING)
    const cwa = T.crosswalkAhead();
    if (cwa && cwa.occupied && cwa.crosswalkId != null) this._occMem.set(cwa.crosswalkId, snap.t);
    const cws = this._cwNear; cws.length = 0;
    const list = ctx.net && Array.isArray(ctx.net.crosswalks) ? ctx.net.crosswalks : [];
    const peds = T.pedestrians();
    let pi = 0;
    for (const cw of list) {
      const dx = cw.x - sp.x, dz = cw.z - sp.z;
      if (dx * dx + dz * dz > NEAR_CW * NEAR_CW) continue;
      // ocupação POR FAIXA DE ROLAMENTO (o trânsito sabe onde cada pedestre está); sem isso, a faixa inteira
      const lane = T.crosswalkBlockedAt(cw.id, sp.x, sp.z);
      let occ = lane === true || (lane == null && this._occFlag.get(cw.id) === true);
      const mem = this._occMem.get(cw.id);
      if (!occ && mem != null && snap.t - mem < RULES_BALANCE.crosswalk.occupiedMemory) occ = true;
      if (!occ && lane == null) {
        const r = (cw.halfWidth || 8) + RULES_BALANCE.crosswalk.pedRadiusExtra;
        for (const p of peds) {
          if (p.crosswalkId !== cw.id || !PED_ON_CROSSWALK[p.state]) continue;
          if ((p.x - cw.x) * (p.x - cw.x) + (p.z - cw.z) * (p.z - cw.z) <= r * r) { occ = true; break; }
        }
      }
      const o = this._cwPool[pi] || (this._cwPool[pi] = {}); pi++;
      o.id = cw.id; o.x = cw.x; o.z = cw.z; o.heading = cw.heading; o.halfWidth = cw.halfWidth; o.occupied = occ;
      cws.push(o);
    }
    snap.crosswalks = cws;

    const out = stepFines(this.det, snap, dt);
    snap.px = sp.x; snap.pz = sp.z;
    for (const f of out.fines) this._applyFine(f);
    for (const id of out.reveal) T.revealAgent(id);
    for (const r of out.signalRuns) ctx.events.emit(EV.SIGNAL_RUN, r);

    // pontuação
    const md = st.mood, davi = md.driver.who === 'davi' ? md.driver : md.passenger;
    const dono = md.driver.who === 'dono' ? md.driver : md.passenger.active && md.passenger.who === 'dono' ? md.passenger : null;
    stepScore(this.score, { davi, dono }, dt);
    writeScore(this.score, st.score);
  },

  /** Na faixa de ônibus a menos de RULES_BALANCE.busLane.turnZone m de uma conversão à direita (saída). */
  _busTurnAllowed(ctx, sp) {
    const net = ctx.net; if (!net || sp.laneId < 0 || !net.getLane) return false;
    const lane = net.getLane(sp.laneId); if (!lane || !lane.next) return false;
    let right = false;
    for (let i = 0; i < lane.next.length; i++) { const c = net.getLane(lane.next[i]); if (c && c.turn === 'right') { right = true; break; } }
    if (!right) return false;
    return lane.length - net.projectOnLane(lane, sp.x, sp.z) < RULES_BALANCE.busLane.turnZone;
  },

  _applyFine(f) {
    const st = this.ctx.state;
    f.time = st.trip.elapsed;
    st.fines.push(f); st.fineTotal = Math.round((st.fineTotal + f.amount) * 100) / 100;
    this.ctx.events.emit(EV.FINE, f);
  },

  frame(dt, alpha, ctx) { void dt; void alpha; void ctx; },
};
