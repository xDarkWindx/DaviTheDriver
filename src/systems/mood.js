// Humor (ansiedade/estresse) — cola entre o jogo e o modelo puro (mood/model.js).
//  - Dono de state.mood.driver/passenger (valores; who/active vêm do núcleo), state.actions, ctx.player.mods.
//  - Emite EV.SAY (falas/gestos), EV.MOOD_CHANGE, EV.MOOD_PEAK, EV.TAKEOVER (perigo: o dono tomou o carro),
//    EV.HORN {source:'mood'} (buzina que dispara sozinha).
//  - Escuta eventos do trânsito (via contrato), FINE/SIGNAL_RUN (rules), COLLISION, HAZARD_HIT e as ações H/R/X/F.
//  - Toda consulta ao trânsito passa por TrafficAdapter (funciona com o stub).
// Balanceamento: mood/balance.js (MOOD_BALANCE). Falas: mood/lines.js.
import { EV } from '../core/events.js';
import { MODE } from '../core/state.js';
import { MOOD_BALANCE } from './mood/balance.js';
import { createMoodModel, stepMood, moodEvent, drainOut, neutralMods } from './mood/model.js';
import { Speaker } from './mood/lines.js';
import { TrafficAdapter } from './rules/traffic-adapter.js';
import { makeRng, deriveSeed } from '../core/math.js';

const WINDOW_GESTURES = { bracoPraFora: 1, banana: 1, buzinaImaginaria: 1, apontando: 1 };
const RADAR_AHEAD_M = 150;
// palpites do Davi passageiro: se o banco escolhido está em cooldown, ele fala outra coisa (tagarela)
const FALLBACK = { pFreeSlow: 'pInstr', pBlocked: 'pGo', pGo: 'pInstr', pBrake: 'pInstr', pFast: 'pInstr', pInstr: 'pGo' };

export default {
  name: 'mood',
  balance: MOOD_BALANCE,

  init(ctx) {
    this.ctx = ctx;
    this.T = new TrafficAdapter(ctx);
    const S = MOOD_BALANCE.speech;
    this.speaker = new Speaker({ minGap: S.minGap, minGapHigh: S.minGapHigh, fillerGap: S.fillerGap });
    this.model = createMoodModel('davi');
    this.inp = { speedKmh: 0, limitKmh: 0, throttle: 0, brake: 0, longAccel: 0, latAccel: 0, turbo: 0, inJunction: false, inRing: false,
      freeAhead: 150, lead: null, jam: false, stoppedAtRed: false, crosswalkWait: false, busLaneBeside: false, elapsed: 0, radarAhead: false, vehicleId: 'kwid' };
    this._info = {}; this._chgT = 0; this._last = ''; this._hornEndT = 0; this._yawLeft = 0;
    const ev = ctx.events;
    const live = () => ctx.state.mode === MODE.PLAYING;
    const on = (name, type, map) => { if (name) ev.on(name, (p) => { if (live()) this.event(type, map ? map(p || {}) : p || {}); }); };
    on(EV.OVERTAKEN, 'overtaken');
    on(EV.CUT_OFF, 'cutOff');
    on(EV.HONKED_AT, 'honked');
    on(EV.FLASHED, 'flashed');
    on(EV.TAILGATED, 'tailgated');
    on(EV.NEAR_MISS, 'nearMiss');
    on(EV.FINE, 'fine');
    on(EV.HAZARD_HIT, 'hazard');
    on(EV.PLAYER_OVERTOOK, 'playerOvertook');
    on(EV.SIGNAL_RUN, 'signalRun');
    ev.on(EV.COLLISION, (c) => {
      // só raspões chegam aqui ainda em PLAYING (batida forte: rules encerra antes, no mesmo emit)
      if (!live() || !c || c.a !== 'player') return;
      if (c.b === 'pedestrian') this.event('pedScare', c); // "quase" com pedestre (atropelamento de verdade: rules já encerrou)
      else if ((c.impactKmh || 0) >= 3) this.event('scrape', c);
    });
    const action = (name, type) => ev.on(name, (p) => { if (live() && (!p || p.source === 'player' || p.source == null)) this.event(type, p || {}); });
    action(EV.HORN, 'horn'); action(EV.BREATHE, 'breathe'); action(EV.CURSE, 'curse'); action(EV.FLASH, 'flash');
  },

  reset(ctx, trip) {
    const st = ctx.state;
    // sorteios do humor e das falas pela semente da viagem (mesma semente + mesmas entradas = mesma viagem)
    const seed = (st.traffic && st.traffic.tripSeed) || ((Math.random() * 0xffffffff) >>> 0) || 1;
    this.model = createMoodModel(trip.mode || st.trip.mode, { rng: makeRng(deriveSeed(seed, 0x6d6f6f64)) });
    this.speaker.rng = makeRng(deriveSeed(seed, 0x66616c61));
    this.speaker.reset();
    this._chgT = 0; this._last = ''; this._hornEndT = 0; this._yawLeft = 0;
    st.actions = this.model.actions;   // { horn, breathe, curse, flash } -> { cooldown, max }
    Object.assign(ctx.player.mods, neutralMods());
    this._writeState(st);
  },

  /** Estatísticas da viagem (lidas por rules.js para pontuação/resultado). */
  getStats() { return this.model ? this.model.stats : null; },

  event(type, payload) {
    if (!this.model) return false;
    const ok = moodEvent(this.model, type, payload, this.inp);
    this._flush(this.ctx);
    this._writeState(this.ctx.state);
    return ok;
  },

  update(dt, ctx) {
    const st = ctx.state, m = this.model;
    if (!m || st.mode !== MODE.PLAYING) return;
    this._gather(ctx);
    stepMood(m, this.inp, dt);
    this._writeState(st);
    // efeitos no volante (único escritor de player.mods)
    const pl = ctx.player;
    Object.assign(pl.mods, m.mods);
    const ph = pl.phys, veh = pl.vehicle;
    if (ph && veh) {
      // puxão do volante para a esquerda (abrir ultrapassagem) — mods não tem steerBias: aplicado no estado do volante
      if (m.pull > 0.002) {
        const rate = veh.steerRate / (1 + pl.mods.steerDelay * veh.steerRate);
        ph.steer = Math.max(-1, Math.min(1, ph.steer + m.pull * Math.min(1, rate * dt)));
      }
      // empurrão de rumo do escorregão (espalhado em ~0,3 s)
      if (this._yawLeft !== 0) {
        const step = Math.sign(this._yawLeft) * Math.min(Math.abs(this._yawLeft), Math.abs(this._yawTotal || this._yawLeft) * dt / 0.3);
        ph.heading += step; this._yawLeft -= step;
        if (Math.abs(this._yawLeft) < 1e-5) this._yawLeft = 0;
      }
    }
    if (this._hornEndT > 0) { this._hornEndT -= dt; if (this._hornEndT <= 0) ctx.events.emit(EV.HORN_END, { source: 'mood' }); }
    this._flush(ctx);
    // MOOD_CHANGE (limitado)
    this._chgT -= dt;
    if (this._chgT <= 0) {
      this._chgT = MOOD_BALANCE.changeEvery;
      const d = st.mood.driver, p = st.mood.passenger;
      const key = `${d.anxiety | 0},${d.stress | 0},${p.anxiety | 0},${p.stress | 0}`;
      if (key !== this._last) {
        this._last = key;
        ctx.events.emit(EV.MOOD_CHANGE, { who: d.who, role: 'driver', anxiety: d.anxiety, stress: d.stress });
        if (p.active) ctx.events.emit(EV.MOOD_CHANGE, { who: p.who, role: 'passenger', anxiety: p.anxiety, stress: p.stress });
      }
    }
  },

  _writeState(st) {
    const m = this.model;
    for (const role of ['driver', 'passenger']) {
      const src = m[role], dst = st.mood[role];
      if (!src) { dst.anxiety = 0; dst.stress = 0; dst.floor = 0; continue; }
      dst.anxiety = src.anxiety; dst.stress = src.stress; dst.floor = src.floor;
      // porquê da barra subir (rótulo curto no HUD): só nas barras do Davi
      dst.whyA = src.who === 'davi' ? m.whyA || '' : ''; dst.whyS = src.who === 'davi' ? m.whyS || '' : '';
    }
  },

  _gather(ctx) {
    const st = ctx.state, sp = st.player, inp = this.inp, net = ctx.net, T = this.T;
    const ph = ctx.player && ctx.player.phys;
    inp.speedKmh = sp.speedKmh || 0; inp.limitKmh = sp.speedLimitKmh || 0;
    inp.throttle = sp.throttle || 0; inp.brake = sp.brake || 0; inp.turbo = sp.turbo || 0;
    inp.longAccel = ph ? ph.longAccel || 0 : 0; inp.latAccel = ph ? ph.latAccel || 0 : 0;
    inp.inJunction = !!sp.inJunction; inp.elapsed = st.trip.elapsed || 0; inp.vehicleId = sp.vehicleId;
    inp.atStart = /estacionamento/i.test(sp.roadName || '');
    const R = ctx.modules.rules;
    inp.offroad = !!sp.offroad && !(R && R._offroadAllowed && R._offroadAllowed(ctx, sp.x, sp.z));
    inp.inRing = false;
    if (sp.inJunction && net && net.getNode) {
      const info = (ctx.player && ctx.player._info && ctx.player._info.nodeId != null) ? ctx.player._info : net.roadInfoAt(sp.x, sp.z, this._info);
      const node = info.nodeId != null ? net.getNode(info.nodeId) : null;
      inp.inRing = !!(node && (node.type === 'ring' || node.roundaboutId != null));
    }
    inp.freeAhead = T.freeAhead();
    inp.sideFree = T.sideFree();
    const hz = T.hazardAhead(); inp.hazardAhead = hz ? hz.kind : null;
    inp.lead = T.leadInfo();
    const J = T.inJam(); inp.jam = !!J; inp.jamCause = J && J.cause ? J.cause : null;
    inp.noPassRule = !!(inp.lead && inp.lead.laneCount === 1); // 1 faixa por sentido (faixa contínua): a regra proíbe passar
    inp.agentNear = false;
    { const ags = T.agents ? T.agents() : []; for (let i = 0; i < ags.length; i++) { const g = ags[i]; if (g.revealed && (g.x - sp.x) * (g.x - sp.x) + (g.z - sp.z) * (g.z - sp.z) < 3600) { inp.agentNear = true; break; } } }
    // parado no vermelho
    inp.stoppedAtRed = false; inp.busLaneBeside = false;
    const lane = sp.laneId >= 0 && net && net.getLane ? net.getLane(sp.laneId) : null;
    if (lane && inp.speedKmh < 3 && lane.signal && ctx.signals && ctx.signals.stateForLane(lane) === 'red') {
      const s = net.projectOnLane(lane, sp.x, sp.z);
      inp.stoppedAtRed = lane.length - s < 30;
    }
    // faixa de ônibus vazia do lado com a normal travada
    if (lane && sp.laneKind !== 'bus' && inp.speedKmh < 10 && inp.lead && inp.lead.gap < 15 && net.siblingLanes) {
      const sib = net.siblingLanes(lane);
      for (let i = 0; i < sib.length; i++) {
        const L = net.getLane(sib[i]);
        if (!L || L.kind !== 'bus' || L.id === lane.id) continue;
        let empty = true; const vs = T.vehicles();
        for (let k = 0; k < vs.length; k++) {
          const v = vs[k];
          if (v.laneId === L.id && (v.x - sp.x) * (v.x - sp.x) + (v.z - sp.z) * (v.z - sp.z) < 1600) { empty = false; break; }
        }
        if (empty) { inp.busLaneBeside = true; break; }
      }
    }
    // pedestre na faixa à frente
    const cw = T.crosswalkAhead();
    inp.crosswalkWait = !!(cw && cw.occupied && cw.dist < 15 && inp.speedKmh < 3);
    // pardal à frente (para o dono gritar)
    inp.radarAhead = false;
    const rs = T.radars(), fx = Math.sin(sp.heading), fz = Math.cos(sp.heading);
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i]; if (r.type !== 'speed') continue;
      const dx = r.x - sp.x, dz = r.z - sp.z, along = dx * fx + dz * fz;
      if (along > 0 && along < RADAR_AHEAD_M && Math.abs(dx * -fz + dz * fx) < 20) { inp.radarAhead = true; break; }
    }
  },

  _flush(ctx) {
    const m = this.model; if (!m) return;
    const o = drainOut(m), ev = ctx.events, T = this.T;
    const profanity = !(ctx.state.settings && ctx.state.settings.profanity === false);
    const crowd = m.mode === 'carona' || m.mode === 'perigo';
    for (const s of o.says) {
      const opt = { prio: s.prio, gestureOnly: s.gestureOnly, profanity, gestureChance: s.gestureOnly ? 1 : MOOD_BALANCE.speech.gestureChance };
      let p = this.speaker.say(m.t, s.bank, opt);
      if (!p && FALLBACK[s.bank]) p = this.speaker.say(m.t, FALLBACK[s.bank], opt); // banco em cooldown: palpite genérico
      if (!p) continue;
      ev.emit(EV.SAY, p);
      if (crowd && p.gesture && p.who === 'davi' && WINDOW_GESTURES[p.gesture]) T.provoke(MOOD_BALANCE.speech.gestureProvoke, 30);
    }
    for (const p of o.provokes) T.provoke(p.amount, p.radius);
    if (o.flashLead) T.flashLead();
    if (o.autoHorn) { ev.emit(EV.HORN, { source: 'mood' }); this._hornEndT = 0.35; T.provoke(0.2, 30); }
    if (o.yawKick) { this._yawLeft += o.yawKick; this._yawTotal = this._yawLeft; }
    for (const p of o.peaks) ev.emit(EV.MOOD_PEAK, p);
    if (o.takeover) ev.emit(EV.TAKEOVER, { who: 'dono' });
  },

  frame(dt, alpha, ctx) { void dt; void alpha; void ctx; },
};
