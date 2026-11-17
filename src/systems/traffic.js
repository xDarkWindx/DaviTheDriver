// Trânsito: veículos de IA, pedestres/corredores/ciclistas, frutas na pista e fiscalização da viagem.
// (Dono: agente de trânsito.) Lógica pura em ./traffic/sim.js (testável em Node), desenho em ./traffic/render.js,
// elenco em ./traffic/personas.js. Testes: node src/systems/traffic/__tests__/traffic.test.js
//
// API (ctx.modules.traffic) — objetos REUTILIZADOS (não guarde referências esperando que não mudem):
//   vehicles[]    { id, kind, persona, x, z, heading, speed (m/s), length, width, laneId, braking, honking, aggression (0..1),
//                   blink (-1 esq | 1 dir | 2 alerta | 0), flashing, ... }
//   pedestrians[] { id, x, z, state:'waiting'|'crossing'|'walking'|'down'|'gone', crosswalkId (-1 = corredor/ciclista no acostamento),
//                   kind:'pedestre'|'corredor'|'ciclista', signaling, heading }
//   hazards[]     { id, kind:'manga'|'jaca', x, z, r, active, squashed }
//   radars[]      { id, type:'speed'|'redLight'|'busLane', x, z, heading, range, limitKmh, segId, dir, laneIds, laneS, poleX, poleZ, signalId, group }
//   agents[]      { id, x, z, heading, range, revealed, segId, dir, laneIds, s0, s1, roadX, roadZ, cover }
//   jams[]        congestionamentos da viagem (0–2): { segId, dir, s0, s1, label, pts (x,z… p/ minimapa), cause:'quebrado'|'onibus' }
//   inJam() -> jam | null (o jogador está na fila)
//   leadInfo() -> { id, kind, persona, gap, speed, closing } | null      rearInfo() -> idem (closing = quanto o de trás se aproxima)
//   freeAhead() -> m (≤150)     neighbors(radius) -> vehicles[] (array reutilizado)
//   crosswalkAhead() -> { crosswalkId, dist, occupied, pedCount, waiting, x, z, signalized } | null
//   crosswalkBlockedAt(cid, x, z) -> bool (bloqueio por faixa de rolamento: o pedestre está nela ou chegando)
//   provoke(amount, radius) -> nº de afetados     flashLead() -> { id, kind, persona, reaction:'yield'|'brake'|'ignore', gap } | null
//   revealAgent(id) -> agente | null              stats() -> diagnóstico (custo do update, contagens, draw calls)
//   debug.spawn(kindOrPersona, aheadMeters, laneOffset, opts) / debug.clear() / debug.spawnPed(crosswalkId, crossNow) /
//   debug.setAutoSpawn(bool) / debug.repopulate() / debug.sim (a simulação)
// Eventos emitidos: COLLISION (b:'vehicle'|'pedestrian'), OVERTAKEN, CUT_OFF, HONKED_AT, NEAR_MISS, PEDESTRIAN_CROSSING,
//   HAZARD_HIT, PLAYER_OVERTOOK, TAILGATED, FLASHED (formatos em core/events.js).
// Escuta EV.HORN (tecla H ou buzina automática do humor): o carro da frente reage (sai da faixa / freia de birra). A irritação geral (provoke)
//   é chamada pelo humor (mood.js) — este módulo NÃO chama provoke sozinho.
import { TrafficSim } from './traffic/sim.js';
import { TrafficRenderer } from './traffic/render.js';
import { AUDIO_KIND } from './traffic/personas.js';
import { TRAFFIC_MODELS } from '../player/vehicleModels.js';

let sim = null, rnd = null, C = null;
const perf = { last: 0, avg: 0, max: 0, n: 0, render: 0, renderAvg: 0 };
const _aud = { idx: new Int32Array(6), d: new Float64Array(6) };

const api = {
  name: 'traffic',
  vehicles: [], pedestrians: [], hazards: [], radars: [], agents: [], jams: [],

  init(ctx) {
    C = ctx;
    const dims = {};
    for (const k of Object.keys(TRAFFIC_MODELS || {})) { const m = TRAFFIC_MODELS[k]; dims[k] = { length: m.length, width: m.width, massKg: m.massKg, colors: m.colors }; }
    const q = ctx.quality;
    sim = new TrafficSim({ net: ctx.net, signals: ctx.signals, events: ctx.events, EV: ctx.EV,
      maxVehicles: q.maxTrafficVehicles || 40, maxPedestrians: q.maxPedestrians || 24, dims });
    sim.setPlayer(ctx.player);
    api.vehicles = sim.vehicles; api.pedestrians = sim.pedestrians; api.hazards = sim.hazards; api.radars = sim.radars; api.agents = sim.agents;
    api.debug.sim = sim;
    rnd = new TrafficRenderer(ctx.view.scene, { maxVehicles: sim.maxV, maxPedestrians: sim.maxP,
      blobMaterial: ctx.world && ctx.world.materials ? ctx.world.materials.blobMat : null,
      maxRadars: Math.max(8, ctx.net.enforcementSpots.length), maxHazards: 72, maxAgents: Math.max(4, ctx.net.agentHideouts.length) });
    // buzina do carro do jogador (tecla H ou a buzina "sozinha" do humor): o da frente reage
    ctx.events.on(ctx.EV.HORN, () => { if (ctx.state.mode === 'PLAYING') sim.playerHorn(); });
  },

  /** Menu: trânsito vivo atrás do menu (jogador "fantasma" no gramado da Esplanada, onde a câmera passeia). */
  menuStart(ctx, x = 420, z = 0) {
    if (!sim) return;
    const proxy = this._menuProxy || (this._menuProxy = { phys: { x, z, heading: 0, vx: 0, vz: 0, speed: 0 }, vehicle: { length: 0.1, width: 0.1, massKg: 1 } });
    proxy.phys.x = x; proxy.phys.z = z;
    sim.setPlayer(proxy);
    sim.reset({ seed: 2024, timeOfDay: 'manha', route: null, jams: 0, stjBus: false });
    this.menuOn = true;
  },
  menuUpdate(dt) { if (sim && this.menuOn) sim.step(dt); },

  reset(ctx, trip) {
    this.menuOn = false;
    const st = ctx.state;
    if (!st.traffic) st.traffic = { seed: null, tripSeed: 0, active: 0, peds: 0 };
    // semente da viagem: o núcleo (game.startTrip) já sorteou/fixou em tripSeed; sem núcleo, sorteia aqui
    const seed = st.traffic.tripSeed ? (st.traffic.tripSeed >>> 0)
      : st.traffic.seed != null ? (st.traffic.seed >>> 0) : ((Math.random() * 0xffffffff) >>> 0) || 1;
    st.traffic.tripSeed = seed;
    sim.setPlayer(ctx.player);
    // faixas das duas rotas da viagem (Eixo = GPS livre; Parque = corredor): onde os congestionamentos podem cair
    const routeLanes = new Set();
    try {
      const net = ctx.net, p = ctx.player.phys, near = net.nearestLane(p.x, p.z, {}, p.heading, 1.2), dest = ctx.trip._dest && ctx.trip._dest.targets;
      if (near && dest) {
        for (const id of net.planRoute(near.laneId, near.s, dest, []) || []) routeLanes.add(id);
        const via = net.routeCorridors.parque && net.routeCorridors.parque[trip.routeId];
        if (via) for (const id of net.planRouteVia(near.laneId, near.s, via, dest, []) || []) routeLanes.add(id);
        for (const id of [...routeLanes]) { const l = net.getLane(id); if (!l.isConnector) for (const sid of net.siblingLanes(l)) routeLanes.add(sid); }
      }
    } catch (e) { /* sem rotas: congestionamento cai em qualquer sentido */ }
    sim.reset({ seed, timeOfDay: trip.timeOfDay, route: ctx.trip.route, routeId: trip.routeId, routeLanes, jams: st.traffic.jams, jamSpot: st.traffic.jamSpot, stjBus: st.traffic.stjBus });
    api.jams = sim.jams; st.traffic.jamList = sim.jams.map((j) => j.label);
    perf.avg = 0; perf.max = 0; perf.n = 0;
  },

  update(dt, ctx) {
    const t0 = performance.now();
    sim.playerRoute = ctx.trip.route;
    sim.step(dt);
    const ms = performance.now() - t0;
    perf.last = ms; perf.n++; perf.avg += (ms - perf.avg) / Math.min(perf.n, 300); if (ms > perf.max && perf.n > 30) perf.max = ms;
    ctx.state.traffic.active = sim.vehicles.length; ctx.state.traffic.peds = sim.pedestrians.length;
  },

  frame(dt, alpha, ctx) {
    const playing = ctx.state.mode === 'PLAYING';
    // degrau mais baixo do ajuste automático (cenário reduzido) também reduz o pool do trânsito
    const aq = ctx.view && ctx.view.autoQuality;
    sim.poolCap = aq && aq.step >= 3 ? Math.round(sim.maxV * 0.6) : 0;
    const sp = ctx.state.player;
    const t0 = performance.now();
    rnd.sync(sim, playing ? alpha : 1, ctx.state.mode === 'PAUSED' ? 0 : dt, sp.x, sp.z, ctx.net);
    perf.render = performance.now() - t0; perf.renderAvg += (perf.render - perf.renderAvg) * 0.02;
    // som de passagem: os ~5 mais próximos (o áudio limita a 4 vozes)
    const audio = ctx.modules.audio;
    if (playing && audio && audio.vehiclePass) {
      const A = _aud; let n = 0;
      for (let i = 0; i < sim.vehicles.length; i++) {
        const v = sim.vehicles[i];
        const dx = v.x - sp.x, dz = v.z - sp.z, d = dx * dx + dz * dz;
        if (d > 60 * 60 || v.speed < 1) continue;
        if (n < 6) { A.idx[n] = i; A.d[n] = d; n++; }
        else { let w = 0; for (let k = 1; k < 6; k++) if (A.d[k] > A.d[w]) w = k; if (d < A.d[w]) { A.idx[w] = i; A.d[w] = d; } }
      }
      for (let k = 0; k < n; k++) {
        const v = sim.vehicles[A.idx[k]];
        audio.vehiclePass(v.x, v.z, AUDIO_KIND[v.kind] || 'car', v.speed, v.id);
      }
    }
  },

  // ---------------------------------------------------------------- consultas
  leadInfo() { return sim ? sim.leadInfo() : null; },
  /** Congestionamento em que o jogador está agora ({ label, segId, ... }) ou null. */
  inJam() { return sim ? sim.inJam() : null; },
  rearInfo() { return sim ? sim.rearInfo() : null; },
  freeAhead() { return sim ? sim.freeAhead() : 150; },
  neighbors(radius = 30) { return sim ? sim.neighbors(radius) : []; },
  crosswalkAhead() { return sim ? sim.crosswalkAhead() : null; },
  /** Alguém atravessando a faixa `cid` bloqueia o ponto (x, z)? (só a faixa de rolamento onde o pedestre está ou vai chegar) */
  crosswalkBlockedAt(cid, x, z) { return sim ? sim.cwBlockedAt(cid, x, z) : false; },
  provoke(amount = 0.3, radius = 30) { return sim ? sim.provoke(amount, radius) : 0; },
  flashLead() { return sim ? sim.flashLead() : null; },
  revealAgent(id) { return sim ? sim.revealAgent(id) : null; },
  stats() {
    const r = rnd ? rnd.stats() : { drawCalls: 0, triangles: 0 };
    return { updateMs: perf.last, updateAvgMs: perf.avg, updateMaxMs: perf.max, frameSyncMs: perf.render, frameSyncAvgMs: perf.renderAvg, vehicles: sim.vehicles.length, pedestrians: sim.pedestrians.length,
      max: sim.maxV, seed: sim.seed, ...sim.stats, ...r };
  },

  debug: {
    sim: null,
    /** Veículo à frente (aheadMeters > 0) ou atrás do jogador; laneOffset +1 = faixa à esquerda. kindOrPersona: modelo ou persona. */
    spawn(kindOrPersona = 'normal', aheadMeters = 40, laneOffset = 0, opts) { return sim.debugSpawn(kindOrPersona, aheadMeters, laneOffset, opts); },
    clear() { sim.debugClear(); },
    spawnPed(crosswalkId, crossNow = false) { return sim.debugSpawnPed(crosswalkId, crossNow); },
    setAutoSpawn(on) { sim.autoSpawn = !!on; },
    /** Esvazia e repovoa em volta do jogador (após teleporte). */
    repopulate() { sim.debugRepopulate(); },
  },
};

export default api;
